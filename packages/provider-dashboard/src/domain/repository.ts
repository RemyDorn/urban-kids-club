// ============================================================
// Repository Pattern – Abstraktionsschicht für Datenzugriff
// ============================================================
// Ermöglicht den Wechsel zwischen In-Memory-Store und Supabase DB
// ohne Änderung der Service-Schicht.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { store } from './store'

export type DataSource = 'memory' | 'supabase'

// Aktuelle Datenquelle (konfigurierbar via ENV)
let currentDataSource: DataSource = (process.env.DATA_SOURCE as DataSource) ?? 'memory'
let supabaseClient: SupabaseClient | null = null

export function setDataSource(source: DataSource, client?: SupabaseClient) {
  currentDataSource = source
  if (client) supabaseClient = client
}

export function getDataSource(): DataSource {
  return currentDataSource
}

// ============================================================
// Generic Repository Interface
// ============================================================

export interface Repository<T> {
  getById(id: string): Promise<T | undefined>
  getAll(): Promise<T[]>
  create(item: T): Promise<T>
  update(id: string, updates: Partial<T>): Promise<T | undefined>
  delete(id: string): Promise<boolean>
  query(filters: Record<string, unknown>): Promise<T[]>
}

// ============================================================
// In-Memory Repository (verwendet bestehenden Store)
// ============================================================

export class MemoryRepository<T extends { id: string }> implements Repository<T> {
  constructor(
    private map: Map<string, T>,
    private indexes?: { add: (item: T) => void; remove: (item: T) => void }
  ) {}

  async getById(id: string): Promise<T | undefined> {
    return this.map.get(id)
  }

  async getAll(): Promise<T[]> {
    return Array.from(this.map.values())
  }

  async create(item: T): Promise<T> {
    this.map.set(item.id, item)
    this.indexes?.add(item)
    return item
  }

  async update(id: string, updates: Partial<T>): Promise<T | undefined> {
    const existing = this.map.get(id)
    if (!existing) return undefined
    const updated = { ...existing, ...updates } as T
    this.map.set(id, updated)
    return updated
  }

  async delete(id: string): Promise<boolean> {
    const item = this.map.get(id)
    if (!item) return false
    this.indexes?.remove(item)
    return this.map.delete(id)
  }

  async query(filters: Record<string, unknown>): Promise<T[]> {
    let results = Array.from(this.map.values())
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) {
        results = results.filter((item) => (item as Record<string, unknown>)[key] === value)
      }
    }
    return results
  }
}

// ============================================================
// Supabase Repository (PostgreSQL-Backend)
// ============================================================

export class SupabaseRepository<T extends { id: string }> implements Repository<T> {
  constructor(private tableName: string) {}

  private get client(): SupabaseClient {
    if (!supabaseClient) throw new Error('Supabase client not configured')
    return supabaseClient
  }

  async getById(id: string): Promise<T | undefined> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single()
    if (error) return undefined
    return this.mapFromDb(data)
  }

  async getAll(): Promise<T[]> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
    if (error) return []
    return (data ?? []).map(d => this.mapFromDb(d))
  }

  async create(item: T): Promise<T> {
    const dbItem = this.mapToDb(item)
    const { data, error } = await this.client
      .from(this.tableName)
      .insert(dbItem)
      .select()
      .single()
    if (error) throw new Error(`DB insert error: ${error.message}`)
    return this.mapFromDb(data)
  }

  async update(id: string, updates: Partial<T>): Promise<T | undefined> {
    const dbUpdates = this.mapToDb(updates as T)
    const { data, error } = await this.client
      .from(this.tableName)
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single()
    if (error) return undefined
    return this.mapFromDb(data)
  }

  async delete(id: string): Promise<boolean> {
    const { error } = await this.client
      .from(this.tableName)
      .delete()
      .eq('id', id)
    return !error
  }

  async query(filters: Record<string, unknown>): Promise<T[]> {
    let query = this.client.from(this.tableName).select('*')
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) {
        const dbKey = this.camelToSnake(key)
        query = query.eq(dbKey, value)
      }
    }
    const { data, error } = await query
    if (error) return []
    return (data ?? []).map(d => this.mapFromDb(d))
  }

  // snake_case → camelCase mapping
  private mapFromDb(row: Record<string, unknown>): T {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      result[this.snakeToCamel(key)] = value
    }
    return result as T
  }

  private mapToDb(item: Partial<T>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
      if (value !== undefined) {
        result[this.camelToSnake(key)] = value
      }
    }
    return result
  }

  private snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)
  }
}

// ============================================================
// Repository Factory
// ============================================================

// Mapping: Tabellen-Name → Store-Map
const TABLE_MAP: Record<string, keyof typeof store.state> = {
  providers: 'providers',
  locations: 'locations',
  team_members: 'teamMembers',
  activities: 'activities',
  provider_bookings: 'bookings',
  attendance: 'attendance',
  parents: 'parents',
  reviews: 'reviews',
  invoices: 'invoices',
  messages: 'messages',
  coupons: 'coupons',
  coupon_redemptions: 'couponRedemptions',
  trial_lessons: 'trialLessons',
  seasons: 'seasons',
  holidays: 'holidays',
  sepa_mandates: 'sepaMandates',
  payments: 'payments',
  provider_documents: 'documents',
  consent_records: 'consents',
  notifications: 'notifications',
  calendar_events: 'calendarEvents',
  waitlist_entries: 'waitlistEntries',
  widget_configs: 'widgetConfigs',
  contact_notes: 'contactNotes',
  export_requests: 'exportRequests',
  audit_log: 'auditLog',
  e_invoices: 'eInvoices',
  but_vouchers: 'butVouchers',
  instructor_contracts: 'instructorContracts',
}

export function getRepository<T extends { id: string }>(tableName: string): Repository<T> {
  if (currentDataSource === 'supabase') {
    return new SupabaseRepository<T>(tableName)
  }

  const storeKey = TABLE_MAP[tableName]
  if (!storeKey) throw new Error(`Unknown table: ${tableName}`)
  return new MemoryRepository<T>(store.state[storeKey] as unknown as Map<string, T>)
}
