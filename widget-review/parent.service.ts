import { randomUUID } from 'node:crypto'

/**
 * Parent Service — Phase-2 Federation Layer
 *
 * Status: READY-BUT-STUBBED
 *   The interface and route layer are production-shaped, but the data
 *   adapter is in-memory. Once migration 006 is applied AND backfill is
 *   done, swap `InMemoryParentRepo` for `SupabaseParentRepo`.
 *
 * Why a service, not a route file?
 *   Centralises the federation logic so the Magic-Link service, the PWA
 *   route layer, and (later) the Kids Club master view all consume the
 *   same API. A route swap then doesn't change semantics.
 *
 * Hoheit reminder:
 *   findByEmail() returns a parent only if a parent_provider_link exists
 *   for the *requesting* provider. Cross-provider visibility is gated by
 *   ParentProviderLink.share_with_other_providers (Phase-2 only).
 */

export interface Parent {
  id: string                          // UUID
  email: string                       // canonical lower-case
  display_name?: string
  phone?: string
  locale: string                      // 'de-DE'
  created_at: string                  // ISO
  email_verified_at?: string
}

export interface ParentProviderLink {
  parent_id: string
  provider_id: string
  provider_first_seen_at: string
  provider_last_booking_at?: string
  marketing_consent: boolean
  share_with_other_providers: boolean   // Phase-2 federation gate
  archived_at?: string
}

export interface FindOptions {
  /** The provider doing the lookup. Required for hoheit checks. */
  requestingProviderId: string
  /** If true, also return links the parent opted-in to share (Phase-2 only). */
  includeFederated?: boolean
}

export interface ParentRepo {
  findByEmail(email: string, opts: FindOptions): Promise<{ parent: Parent; links: ParentProviderLink[] } | null>
  findById(id: string, opts: FindOptions): Promise<Parent | null>
  upsertParent(input: { email: string; display_name?: string; phone?: string; locale?: string }): Promise<Parent>
  linkToProvider(parentId: string, providerId: string, init?: Partial<ParentProviderLink>): Promise<ParentProviderLink>
  listLinksForParent(parentId: string, opts: { onlyActive?: boolean }): Promise<ParentProviderLink[]>
  setMarketingConsent(parentId: string, providerId: string, consent: boolean): Promise<void>
  setShareWithOtherProviders(parentId: string, providerId: string, share: boolean): Promise<void>
  touchLastBooking(parentId: string, providerId: string, at: Date): Promise<void>
}

/* -------------------------------------------------------------------------- */
/*  IN-MEMORY ADAPTER — production-safe stub for Phase-1                       */
/*  Swap to SupabaseParentRepo once migration 006 is applied + backfill done  */
/* -------------------------------------------------------------------------- */
class InMemoryParentRepo implements ParentRepo {
  private parents = new Map<string, Parent>()                          // by id
  private byEmail = new Map<string, string>()                          // email → id
  private links: ParentProviderLink[] = []

  // Seed with a couple of demo records so the dev server can answer queries
  constructor() {
    this.seed()
  }

  private seed() {
    const now = new Date().toISOString()
    const hannah: Parent = {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'hannah.b@example.com',
      display_name: 'Hannah B.',
      phone: '+4917612345678',
      locale: 'de-DE',
      created_at: now,
      email_verified_at: now,
    }
    const lisa: Parent = {
      id: '22222222-2222-2222-2222-222222222222',
      email: 'lisa.k@example.com',
      display_name: 'Lisa K.',
      locale: 'de-DE',
      created_at: now,
    }
    for (const p of [hannah, lisa]) {
      this.parents.set(p.id, p)
      this.byEmail.set(p.email.toLowerCase(), p.id)
    }
    // Hannah is at Socialy AND Tanzschule Mitte (federation demo)
    this.links.push({
      parent_id: hannah.id,
      provider_id: 'socialy',
      provider_first_seen_at: now,
      marketing_consent: true,
      share_with_other_providers: true,
    })
    this.links.push({
      parent_id: hannah.id,
      provider_id: 'tanzschule-mitte',
      provider_first_seen_at: now,
      marketing_consent: false,
      share_with_other_providers: true,
    })
    // Lisa only at Socialy
    this.links.push({
      parent_id: lisa.id,
      provider_id: 'socialy',
      provider_first_seen_at: now,
      marketing_consent: true,
      share_with_other_providers: false,
    })
  }

  async findByEmail(email: string, opts: FindOptions) {
    const id = this.byEmail.get(email.toLowerCase())
    if (!id) return null
    const parent = this.parents.get(id)!
    const ownLink = this.links.find(l => l.parent_id === id && l.provider_id === opts.requestingProviderId && !l.archived_at)
    if (!ownLink) return null  // Hoheit: provider doesn't see parents not linked to itself
    const links = opts.includeFederated
      ? this.links.filter(l => l.parent_id === id && !l.archived_at && (l.provider_id === opts.requestingProviderId || l.share_with_other_providers))
      : [ownLink]
    return { parent, links }
  }

  async findById(id: string, opts: FindOptions) {
    const ownLink = this.links.find(l => l.parent_id === id && l.provider_id === opts.requestingProviderId && !l.archived_at)
    if (!ownLink) return null
    return this.parents.get(id) ?? null
  }

  async upsertParent(input: { email: string; display_name?: string; phone?: string; locale?: string }) {
    const emailLower = input.email.toLowerCase()
    const existingId = this.byEmail.get(emailLower)
    if (existingId) {
      const p = this.parents.get(existingId)!
      // Only update if explicitly provided — never wipe existing data
      if (input.display_name) p.display_name = input.display_name
      if (input.phone) p.phone = input.phone
      return p
    }
    const id = randomUUID()
    const parent: Parent = {
      id,
      email: emailLower,
      display_name: input.display_name,
      phone: input.phone,
      locale: input.locale ?? 'de-DE',
      created_at: new Date().toISOString(),
    }
    this.parents.set(id, parent)
    this.byEmail.set(emailLower, id)
    return parent
  }

  async linkToProvider(parentId: string, providerId: string, init: Partial<ParentProviderLink> = {}) {
    let link = this.links.find(l => l.parent_id === parentId && l.provider_id === providerId)
    if (link) {
      if (link.archived_at) {
        // un-archive on re-engagement
        delete link.archived_at
      }
      return link
    }
    link = {
      parent_id: parentId,
      provider_id: providerId,
      provider_first_seen_at: new Date().toISOString(),
      marketing_consent: init.marketing_consent ?? false,
      share_with_other_providers: init.share_with_other_providers ?? false,
    }
    this.links.push(link)
    return link
  }

  async listLinksForParent(parentId: string, opts: { onlyActive?: boolean } = {}) {
    return this.links.filter(l =>
      l.parent_id === parentId && (!opts.onlyActive || !l.archived_at)
    )
  }

  async setMarketingConsent(parentId: string, providerId: string, consent: boolean) {
    const link = this.links.find(l => l.parent_id === parentId && l.provider_id === providerId)
    if (link) link.marketing_consent = consent
  }

  async setShareWithOtherProviders(parentId: string, providerId: string, share: boolean) {
    const link = this.links.find(l => l.parent_id === parentId && l.provider_id === providerId)
    if (link) link.share_with_other_providers = share
  }

  async touchLastBooking(parentId: string, providerId: string, at: Date) {
    const link = this.links.find(l => l.parent_id === parentId && l.provider_id === providerId)
    if (link) link.provider_last_booking_at = at.toISOString()
  }
}

let _repo: ParentRepo | null = null
export function getParentRepo(): ParentRepo {
  if (!_repo) _repo = new InMemoryParentRepo()
  return _repo
}

/* -------------------------------------------------------------------------- */
/*  HIGH-LEVEL API — what callers actually use                                */
/* -------------------------------------------------------------------------- */

/**
 * Called when a new booking comes in. Idempotent.
 * If the email already exists at another provider, the new link is created
 * but parent data (name, phone) is NOT overwritten — the parent owns those.
 */
export async function onboardParentToProvider(input: {
  email: string
  providerId: string
  display_name?: string
  phone?: string
}): Promise<{ parent: Parent; link: ParentProviderLink; alreadyKnown: boolean }> {
  const repo = getParentRepo()
  const existingByEmail = await repo.findByEmail(input.email, {
    requestingProviderId: input.providerId,
  })
  const alreadyKnown = !!existingByEmail
  const parent = await repo.upsertParent({
    email: input.email,
    display_name: input.display_name,
    phone: input.phone,
  })
  const link = await repo.linkToProvider(parent.id, input.providerId)
  return { parent, link, alreadyKnown }
}

/**
 * Phase-2 master view — returns all federated providers for a parent.
 * UI MUST only render this in /portal/ukc (the master app), never inside
 * a white-label provider portal.
 */
export async function getParentFederatedProviders(parentId: string) {
  const repo = getParentRepo()
  const links = await repo.listLinksForParent(parentId, { onlyActive: true })
  return links.filter(l => l.share_with_other_providers)
}
