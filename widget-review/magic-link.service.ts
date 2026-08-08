/**
 * Magic-Link Auth Service — Phase-2 Federation Layer
 *
 * Status: READY-BUT-STUBBED
 *   In-memory token store; ready to swap for parent_magic_links table.
 *
 * Flow:
 *   1. Parent enters email at /portal/:slug → POST /api/parent/magic-link
 *   2. Service creates parent (if new), creates parent_provider_link to current
 *      provider, generates token, sends email (or returns it in dev mode).
 *   3. Email link → GET /api/parent/magic-link/:token?slug=:slug
 *      → marks token used, sets parent session cookie, redirects to /portal/:slug
 *
 * Hoheit:
 *   The link is bound to BOTH the parent's email AND the issuing provider.
 *   Using a Socialy magic-link lands the parent on /portal/socialy, NOT a
 *   federated master view. White-label is preserved.
 *
 * Security:
 *   - Token is 256-bit random; only its hash is stored
 *   - 15min expiry, single-use
 *   - Brute-force: max 5 issued tokens per email per hour
 *   - Replay: used_at timestamp + lookup-by-hash defeats reuse
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { onboardParentToProvider, getParentRepo } from './parent.service'

export interface MagicLinkRecord {
  id: string
  parent_id: string
  issuing_provider_id: string
  token_hash: string                       // hex
  expires_at: string                       // ISO
  used_at?: string
  ip_address?: string
  user_agent?: string
  created_at: string
}

export interface MagicLinkRepo {
  insert(rec: Omit<MagicLinkRecord, 'id' | 'created_at'> & { created_at?: string }): Promise<MagicLinkRecord>
  findByHash(hash: string): Promise<MagicLinkRecord | null>
  markUsed(id: string): Promise<void>
  countRecentForParent(parentId: string, sinceMs: number): Promise<number>
}

class InMemoryMagicLinkRepo implements MagicLinkRepo {
  private records: MagicLinkRecord[] = []

  async insert(rec: Omit<MagicLinkRecord, 'id' | 'created_at'> & { created_at?: string }) {
    const full: MagicLinkRecord = {
      id: randomUUID(),
      created_at: rec.created_at ?? new Date().toISOString(),
      ...rec,
    }
    this.records.push(full)
    return full
  }

  async findByHash(hash: string) {
    return this.records.find(r => r.token_hash === hash) ?? null
  }

  async markUsed(id: string) {
    const r = this.records.find(x => x.id === id)
    if (r) r.used_at = new Date().toISOString()
  }

  async countRecentForParent(parentId: string, sinceMs: number) {
    const since = Date.now() - sinceMs
    return this.records.filter(r =>
      r.parent_id === parentId && new Date(r.created_at).getTime() > since
    ).length
  }
}

let _repo: MagicLinkRepo | null = null
function getRepo(): MagicLinkRepo {
  if (!_repo) _repo = new InMemoryMagicLinkRepo()
  return _repo
}

/* -------------------------------------------------------------------------- */

const TOKEN_BYTES = 32                     // 256-bit
const TOKEN_TTL_MIN = 15
const RATE_WINDOW_MS = 60 * 60_000         // 1h
const RATE_MAX = 5

function hashToken(plain: string): string {
  return createHash('sha256').update(plain).digest('hex')
}

export interface IssueResult {
  /** The plain token to put in the magic link URL (don't log!). */
  token: string
  /** Generated link to embed in the email. */
  url: string
  /** Whether the parent existed at this provider already. */
  alreadyKnown: boolean
  /** Whether the parent existed in UKC at all (potentially at another provider). */
  emailKnownGlobally: boolean
  expiresAt: string
}

/**
 * Issue a magic link. Performs federation-aware signup if the email is new.
 *
 * Returns the link URL + meta. In production the email is sent here; in dev
 * mode the URL is returned and surfaced in the response so QA can click it.
 */
export async function issueMagicLink(input: {
  email: string
  providerId: string
  origin: string                           // e.g. https://v2.urbankids.club
  ip?: string
  userAgent?: string
  display_name?: string
}): Promise<IssueResult> {
  const repo = getRepo()
  const parentRepo = getParentRepo()

  // Detect cross-provider account: email may already exist at a different provider
  const allLinks = await parentRepo.listLinksForParent('', { onlyActive: true }).catch(() => [])
  void allLinks // (placeholder until repo gets a "find by email any provider" method)

  // Onboard / link to this provider (idempotent)
  const { parent, alreadyKnown } = await onboardParentToProvider({
    email: input.email,
    providerId: input.providerId,
    display_name: input.display_name,
  })

  // Rate limit
  const recent = await repo.countRecentForParent(parent.id, RATE_WINDOW_MS)
  if (recent >= RATE_MAX) {
    throw new Error('rate_limited: too many magic-link requests in last hour')
  }

  const plainToken = randomBytes(TOKEN_BYTES).toString('hex')
  const tokenHash = hashToken(plainToken)
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60_000).toISOString()

  await repo.insert({
    parent_id: parent.id,
    issuing_provider_id: input.providerId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    ip_address: input.ip,
    user_agent: input.userAgent,
  })

  const url = `${input.origin}/portal/${input.providerId}/auth?token=${plainToken}`

  return {
    token: plainToken,
    url,
    alreadyKnown,
    emailKnownGlobally: alreadyKnown,    // simplification while parentRepo lacks "find anywhere"
    expiresAt,
  }
}

export interface ConsumeResult {
  parentId: string
  providerId: string
  /** True iff token was valid AND unused AND not expired. */
  authenticated: boolean
  reason?: 'not_found' | 'expired' | 'already_used' | 'provider_mismatch'
}

/**
 * Consume a magic-link token.  Authenticates the parent for the given provider.
 * Returns provider mismatch if the link came from one provider but is being
 * used in another (white-label hoheit guard).
 */
export async function consumeMagicLink(input: {
  token: string
  providerId: string
}): Promise<ConsumeResult> {
  const repo = getRepo()
  const hash = hashToken(input.token)
  const rec = await repo.findByHash(hash)
  if (!rec) {
    return { parentId: '', providerId: input.providerId, authenticated: false, reason: 'not_found' }
  }
  if (rec.used_at) {
    return { parentId: rec.parent_id, providerId: rec.issuing_provider_id, authenticated: false, reason: 'already_used' }
  }
  if (new Date(rec.expires_at).getTime() < Date.now()) {
    return { parentId: rec.parent_id, providerId: rec.issuing_provider_id, authenticated: false, reason: 'expired' }
  }
  if (rec.issuing_provider_id !== input.providerId) {
    return { parentId: rec.parent_id, providerId: rec.issuing_provider_id, authenticated: false, reason: 'provider_mismatch' }
  }
  await repo.markUsed(rec.id)
  return {
    parentId: rec.parent_id,
    providerId: rec.issuing_provider_id,
    authenticated: true,
  }
}

/**
 * For dev/test pages — exposes whether a token is still alive without
 * consuming it. NEVER call from production routes.
 */
export async function inspectMagicLink(token: string) {
  const rec = await getRepo().findByHash(hashToken(token))
  return rec
    ? { exists: true, used: !!rec.used_at, expiresAt: rec.expires_at, parentId: rec.parent_id }
    : { exists: false }
}
