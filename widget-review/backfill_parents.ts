/**
 * Backfill: customers (legacy, per-provider) → parents + parent_provider_links
 *
 * Usage:
 *   tsx backfill_parents.ts --dry                          # default, just reports
 *   tsx backfill_parents.ts --apply                        # actually writes
 *   tsx backfill_parents.ts --apply --provider <slug>      # one provider only
 *
 * Idempotent: re-running is safe. Resolves parents by lower-cased email,
 * upserts links by (parent_id, provider_id).
 *
 * Status: SCRIPT-READY but NOT INVOKED. Run only after migration 006 is
 * applied (which it is NOT yet — see migrations/006_parent_federation.sql).
 *
 * Dry-run output explains exactly what would happen without touching data.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

interface BackfillStats {
  providersProcessed: number
  customersScanned: number
  parentsCreated: number
  parentsMatched: number
  linksCreated: number
  linksAlreadyExisted: number
  conflictsFlagged: number       // e.g. same email already at this provider with different parent_id
  errors: string[]
}

interface CustomerRow {
  id: string
  provider_id: string
  email: string | null
  name: string | null
  phone: string | null
  marketing_consent: boolean | null
  created_at: string
}

interface ParsedArgs {
  dry: boolean
  providerSlug?: string
  limit?: number
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { dry: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--apply') args.dry = false
    if (a === '--dry') args.dry = true
    if (a === '--provider' && argv[i + 1]) { args.providerSlug = argv[++i] }
    if (a === '--limit' && argv[i + 1]) { args.limit = parseInt(argv[++i], 10) }
  }
  return args
}

function getClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in env')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

async function fetchProviders(sb: SupabaseClient, slug?: string) {
  let q = sb.from('providers').select('id, slug, display_name')
  if (slug) q = q.eq('slug', slug)
  const { data, error } = await q
  if (error) throw new Error('fetch providers: ' + error.message)
  return data ?? []
}

async function fetchCustomers(sb: SupabaseClient, providerId: string, limit?: number): Promise<CustomerRow[]> {
  let q = sb.from('customers').select('id, provider_id, email, name, phone, marketing_consent, created_at').eq('provider_id', providerId)
  if (limit) q = q.limit(limit)
  const { data, error } = await q
  if (error) throw new Error(`fetch customers (${providerId}): ${error.message}`)
  return (data ?? []) as CustomerRow[]
}

async function upsertParent(sb: SupabaseClient, customer: CustomerRow, dry: boolean): Promise<{ id: string; created: boolean }> {
  const email = (customer.email || '').trim().toLowerCase()
  if (!email) throw new Error(`customer ${customer.id} has no email — skip in app`)

  const { data: existing, error: selErr } = await sb.from('parents').select('id').eq('email', email).maybeSingle()
  if (selErr) throw new Error('select parent: ' + selErr.message)
  if (existing) return { id: existing.id, created: false }

  if (dry) return { id: '00000000-dry-run-no-id-yet', created: true }

  const { data: ins, error: insErr } = await sb.from('parents').insert({
    email,
    display_name: customer.name?.trim() || null,
    phone: customer.phone?.trim() || null,
    locale: 'de-DE',
    created_at: customer.created_at,
  }).select('id').single()
  if (insErr) throw new Error('insert parent: ' + insErr.message)
  return { id: ins.id, created: true }
}

async function ensureLink(
  sb: SupabaseClient,
  parentId: string,
  customer: CustomerRow,
  dry: boolean
): Promise<{ created: boolean; alreadyExisted: boolean }> {
  if (dry) return { created: true, alreadyExisted: false }

  const { data: existing, error: selErr } = await sb
    .from('parent_provider_links')
    .select('parent_id')
    .eq('parent_id', parentId)
    .eq('provider_id', customer.provider_id)
    .maybeSingle()
  if (selErr) throw new Error('select link: ' + selErr.message)
  if (existing) return { created: false, alreadyExisted: true }

  const { error: insErr } = await sb.from('parent_provider_links').insert({
    parent_id: parentId,
    provider_id: customer.provider_id,
    provider_first_seen_at: customer.created_at,
    marketing_consent: customer.marketing_consent ?? false,
    marketing_consent_at: customer.marketing_consent ? customer.created_at : null,
    share_with_other_providers: false,                 // Phase-2 default
  })
  if (insErr) throw new Error('insert link: ' + insErr.message)
  return { created: true, alreadyExisted: false }
}

async function run() {
  const args = parseArgs(process.argv.slice(2))
  const sb = getClient()

  console.log('=== Backfill parents + parent_provider_links ===')
  console.log(`  mode: ${args.dry ? 'DRY-RUN (no writes)' : 'APPLY (writes to DB)'}`)
  if (args.providerSlug) console.log(`  filter: provider = ${args.providerSlug}`)
  if (args.limit) console.log(`  limit: ${args.limit} customers per provider`)
  console.log('')

  const stats: BackfillStats = {
    providersProcessed: 0, customersScanned: 0, parentsCreated: 0, parentsMatched: 0,
    linksCreated: 0, linksAlreadyExisted: 0, conflictsFlagged: 0, errors: []
  }

  const providers = await fetchProviders(sb, args.providerSlug)
  if (providers.length === 0) {
    console.log('No providers found. Aborting.'); return
  }

  for (const p of providers) {
    stats.providersProcessed++
    console.log(`Provider ${p.slug} (${p.display_name})`)
    const customers = await fetchCustomers(sb, p.id, args.limit)
    console.log(`  ${customers.length} customers found`)

    for (const c of customers) {
      stats.customersScanned++
      try {
        if (!c.email || !c.email.trim()) {
          console.log(`    SKIP customer ${c.id}: no email`)
          continue
        }
        const { id, created } = await upsertParent(sb, c, args.dry)
        if (created) stats.parentsCreated++; else stats.parentsMatched++

        const linkRes = await ensureLink(sb, id, c, args.dry)
        if (linkRes.created) stats.linksCreated++
        if (linkRes.alreadyExisted) stats.linksAlreadyExisted++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        stats.errors.push(`customer ${c.id}: ${msg}`)
      }
    }
  }

  console.log('')
  console.log('=== Summary ===')
  console.log(`  providers processed:        ${stats.providersProcessed}`)
  console.log(`  customers scanned:          ${stats.customersScanned}`)
  console.log(`  parents created:            ${stats.parentsCreated}`)
  console.log(`  parents matched (existing): ${stats.parentsMatched}`)
  console.log(`  links created:              ${stats.linksCreated}`)
  console.log(`  links already existed:      ${stats.linksAlreadyExisted}`)
  console.log(`  conflicts flagged:          ${stats.conflictsFlagged}`)
  console.log(`  errors:                     ${stats.errors.length}`)
  if (stats.errors.length) {
    console.log('')
    console.log('Errors (first 20):')
    for (const e of stats.errors.slice(0, 20)) console.log('  - ' + e)
  }
  if (args.dry) {
    console.log('')
    console.log('Dry run only. Re-run with --apply to commit.')
  }
}

run().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
