// ============================================================
// Provider Service – CRUD & Geschäftslogik für Anbieter
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { Provider, ProviderStatus, SubscriptionPlan, Address, ContactInfo, ID } from '../types'

export interface CreateProviderInput {
  name: string
  description: string
  address: Address
  contact: ContactInfo
  categories: string[]
  logo?: string
  subscription?: SubscriptionPlan
}

export interface UpdateProviderInput {
  name?: string
  description?: string
  address?: Address
  contact?: ContactInfo
  categories?: string[]
  logo?: string
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export const ProviderService = {

  create(input: CreateProviderInput): Provider {
    const id = generateId('prov')
    const now = new Date()

    // Slug-Kollision vermeiden
    let slug = slugify(input.name)
    const existingSlugs = new Set(
      Array.from(store.state.providers.values()).map((p) => p.slug)
    )
    if (existingSlugs.has(slug)) {
      slug = `${slug}-${id.slice(-4)}`
    }

    const provider: Provider = {
      id,
      name: input.name,
      slug,
      description: input.description,
      logo: input.logo,
      address: input.address,
      contact: input.contact,
      categories: input.categories,
      status: 'onboarding',
      subscription: input.subscription ?? 'free',
      createdAt: now,
      updatedAt: now,
    }

    store.state.providers.set(id, provider)
    return provider
  },

  getById(id: ID): Provider | undefined {
    return store.state.providers.get(id)
  },

  getBySlug(slug: string): Provider | undefined {
    return Array.from(store.state.providers.values()).find((p) => p.slug === slug)
  },

  list(filters?: { status?: ProviderStatus; category?: string }): Provider[] {
    let result = Array.from(store.state.providers.values())

    if (filters?.status) {
      result = result.filter((p) => p.status === filters.status)
    }
    if (filters?.category) {
      result = result.filter((p) => p.categories.includes(filters.category!))
    }

    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  },

  update(id: ID, input: UpdateProviderInput): Provider | undefined {
    const provider = store.state.providers.get(id)
    if (!provider) return undefined

    const updated: Provider = {
      ...provider,
      ...input,
      updatedAt: new Date(),
    }

    store.state.providers.set(id, updated)
    return updated
  },

  activate(id: ID): Provider | undefined {
    const provider = store.state.providers.get(id)
    if (!provider) return undefined
    if (provider.status === 'archived') return undefined  // Archived providers can't be activated
    provider.status = 'active'
    provider.updatedAt = new Date()
    return provider
  },

  suspend(id: ID): Provider | undefined {
    const provider = store.state.providers.get(id)
    if (!provider || provider.status === 'archived') return undefined
    provider.status = 'suspended'
    provider.updatedAt = new Date()
    return provider
  },

  archive(id: ID): Provider | undefined {
    const provider = store.state.providers.get(id)
    if (!provider || provider.status === 'archived') return undefined
    provider.status = 'archived'
    provider.updatedAt = new Date()
    return provider
  },

  changePlan(id: ID, plan: SubscriptionPlan): Provider | undefined {
    const provider = store.state.providers.get(id)
    if (!provider) return undefined
    provider.subscription = plan
    provider.updatedAt = new Date()
    return provider
  },

  delete(id: ID): boolean {
    return store.state.providers.delete(id)
  },

  count(): number {
    return store.state.providers.size
  },
}
