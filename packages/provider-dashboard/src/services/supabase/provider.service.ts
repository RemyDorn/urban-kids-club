// ============================================================
// Provider Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import { providerFromDb, providerToDb } from './mappers'
import type { Provider, ProviderStatus, SubscriptionPlan, ID } from '../../types'

const TABLE = 'providers'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' } as Record<string, string>)[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export const SupabaseProviderService = {

  async list(filters?: { status?: ProviderStatus; category?: string }): Promise<Provider[]> {
    const sb = getServiceClient()
    let query = sb.from(TABLE).select('*').order('created_at', { ascending: false })
    if (filters?.status) query = query.eq('status', filters.status)
    const { data, error } = await query
    if (error) throw error
    let result = (data ?? []).map(providerFromDb)
    if (filters?.category) {
      result = result.filter((p) => p.categories.includes(filters.category!))
    }
    return result
  },

  async getById(id: ID): Promise<Provider | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? providerFromDb(data) : undefined
  },

  async getBySlug(slug: string): Promise<Provider | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*').eq('slug', slug).maybeSingle()
    if (error) throw error
    return data ? providerFromDb(data) : undefined
  },

  async create(input: {
    name: string; description: string; address: Provider['address'];
    contact: Provider['contact']; categories: string[];
    logo?: string; subscription?: SubscriptionPlan
  }): Promise<Provider> {
    const sb = getServiceClient()
    let slug = slugify(input.name)
    const existing = await this.getBySlug(slug)
    if (existing) slug = `${slug}-${Date.now().toString(36).slice(-4)}`

    const row = providerToDb({
      name: input.name,
      slug,
      description: input.description,
      logo: input.logo,
      address: input.address,
      contact: input.contact,
      categories: input.categories,
      status: 'onboarding',
      subscription: input.subscription ?? 'free',
    })

    const { data, error } = await sb.from(TABLE).insert(row).select().single()
    if (error) throw error
    return providerFromDb(data)
  },

  async update(id: ID, input: Partial<Pick<Provider, 'name' | 'description' | 'address' | 'contact' | 'categories' | 'logo' | 'roomCount'>>): Promise<Provider | undefined> {
    const sb = getServiceClient()
    const row = providerToDb(input as Partial<Provider>)
    row.updated_at = new Date().toISOString()
    const { data, error } = await sb.from(TABLE).update(row).eq('id', id).select().maybeSingle()
    if (error) throw error
    return data ? providerFromDb(data) : undefined
  },

  async delete(id: ID): Promise<boolean> {
    const sb = getServiceClient()
    const { error, count } = await sb.from(TABLE).delete().eq('id', id)
    if (error) throw error
    return true
  },

  async activate(id: ID): Promise<Provider | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE)
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', id)
      .neq('status', 'archived')
      .select().maybeSingle()
    if (error) throw error
    return data ? providerFromDb(data) : undefined
  },

  async changePlan(id: ID, plan: SubscriptionPlan): Promise<Provider | undefined> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE)
      .update({ subscription: plan, updated_at: new Date().toISOString() })
      .eq('id', id).select().maybeSingle()
    if (error) throw error
    return data ? providerFromDb(data) : undefined
  },
}
