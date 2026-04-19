// ============================================================
// Shared helpers used across route modules
// ============================================================

import { supabase, getServiceClient } from '../../lib/supabase'
import type { ParsedRequest, ApiResponse } from '../router'

// --- Input-Validierung: parseInt mit NaN-Schutz ---
export function safeParseInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

// ============================================================
// Rate Limiting — simple in-memory fixed window
// NOTE: This is in-memory only — counters reset on server restart
// and are per-instance (not shared across multiple processes).
// For production multi-instance deployments, replace with Redis.
// ============================================================
export const rateLimitStore = new Map<string, { count: number; resetAt: number }>()
// Evict expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of rateLimitStore) {
    if (val.resetAt < now) rateLimitStore.delete(key)
  }
}, 5 * 60 * 1000).unref()

export function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = rateLimitStore.get(key)
  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= maxRequests) return false
  entry.count++
  return true
}

// ============================================================
// Idempotency — prevent duplicate payments on retry
// ============================================================
export const idempotencyStore = new Map<string, { response: any; expiresAt: number }>()
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of idempotencyStore) {
    if (val.expiresAt < now) idempotencyStore.delete(key)
  }
}, 5 * 60 * 1000).unref()

export function getClientIp(req: any): string {
  return req.raw?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.raw?.socket?.remoteAddress || 'unknown'
}

// Helper: escape HTML to prevent XSS
export function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}
// Helper: render a branded HTML page (for confirm/decline/error pages)
export function successPageWithRedirect(title: string, message: string, redirectUrl?: string | null) {
  const redirect = redirectUrl ? `<meta http-equiv="refresh" content="5;url=${escHtml(redirectUrl)}">` : ''
  const redirectNote = redirectUrl ? '<p style="color:#94a3b8;font-size:12px;margin-top:16px;">Du wirst in 5 Sekunden weitergeleitet...</p>' : ''
  return htmlPage('✓', title, message + redirectNote, '#059669', redirect)
}

export function htmlPage(icon: string, title: string, message: string, color = '#059669', extraHead = '') {
  const safeTitle = escHtml(title)
  // message is trusted HTML from our own code (contains <strong>, <a>, <br> etc.)
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${extraHead}
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#faf9f8}
.card{text-align:center;background:#fff;padding:48px 40px;border-radius:20px;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:480px;width:90%}
.icon{width:72px;height:72px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:36px;margin:0 auto 20px;animation:pop .4s ease}
@keyframes pop{0%{transform:scale(0)}50%{transform:scale(1.2)}100%{transform:scale(1)}}
h2{color:#1f2937;font-size:22px;margin-bottom:12px}
.msg{color:#64748b;font-size:14px;line-height:1.7;margin-bottom:20px}
.msg strong{color:#1f2937}
.msg a{display:inline-block;margin-top:12px}
.footer{font-size:11px;color:#94a3b8;margin-top:24px}
</style></head><body><div class="card"><div class="icon">${icon}</div><h2>${safeTitle}</h2><div class="msg">${message}</div><div class="footer">Powered by Urban Kids Club</div></div></body></html>`
}

// Helper: Check if activity schedule fits within provider opening hours
export async function checkOpeningHours(providerId: string, schedule: any): Promise<string | null> {
  if (!schedule?.slots) return null
  const sb = getServiceClient()
  const { data: prov } = await sb.from('providers').select('opening_hours').eq('id', providerId).maybeSingle()
  const oh = prov?.opening_hours as Record<string, { open: string; close: string } | null> | null
  if (!oh) return null // no opening hours set = no restriction

  const dayLabels: Record<string, string> = { MO: 'Montag', TU: 'Dienstag', WE: 'Mittwoch', TH: 'Donnerstag', FR: 'Freitag', SA: 'Samstag', SU: 'Sonntag' }
  const dayCodeToKey: Record<string, string> = { MO: 'monday', TU: 'tuesday', WE: 'wednesday', TH: 'thursday', FR: 'friday', SA: 'saturday', SU: 'sunday' }
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }

  const slots = Array.isArray(schedule) ? schedule : (schedule.slots ?? [])
  for (const slot of slots) {
    const day = slot.day?.toUpperCase()
    const key = dayCodeToKey[day] || day
    const dayHours = oh[key]
    if (!dayHours) return `${dayLabels[day] || day} ist geschlossen. Kein Kurs an diesem Tag möglich.`
    const slotStart = toMin(slot.startTime)
    const slotEnd = toMin(slot.endTime)
    const ohOpen = toMin(dayHours.open)
    const ohClose = toMin(dayHours.close)
    if (slotStart < ohOpen) return `Kurs startet um ${slot.startTime}, aber ${dayLabels[day] || day} öffnet erst um ${dayHours.open} Uhr.`
    if (slotEnd > ohClose) return `Kurs endet um ${slot.endTime}, aber ${dayLabels[day] || day} schließt um ${dayHours.close} Uhr.`
  }
  return null
}

// Helper: Check if provider has enough rooms for parallel activities
export async function checkRoomAvailability(providerId: string, schedule: any, excludeActivityId?: string): Promise<string | null> {
  if (!schedule) return null
  const sb = getServiceClient()

  // Get provider room count
  const { data: prov } = await sb.from('providers').select('room_count').eq('id', providerId).maybeSingle()
  const roomCount = prov?.room_count ?? 1

  // Get all active/published activities for this provider (exclude cancelled/archived)
  const { data: activities } = await sb.from('activities')
    .select('id, schedule, status')
    .eq('provider_id', providerId)
    .not('status', 'in', '("cancelled","archived")')

  if (!activities || activities.length === 0) return null

  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
  const timesOverlap = (s1: string, e1: string, s2: string, e2: string) => toMin(s1) < toMin(e2) && toMin(s2) < toMin(e1)

  // For recurring schedules, check each slot
  const slots = schedule.slots ?? []
  if (schedule.type === 'recurring' && slots.length > 0) {
    for (const slot of slots) {
      let overlapping = 0
      for (const act of activities) {
        if (excludeActivityId && act.id === excludeActivityId) continue
        const actSched = act.schedule
        if (!actSched) continue
        if (actSched.type === 'recurring' && actSched.slots) {
          for (const otherSlot of actSched.slots) {
            if (otherSlot.day === slot.day && timesOverlap(slot.startTime, slot.endTime, otherSlot.startTime, otherSlot.endTime)) {
              overlapping++
              break
            }
          }
        }
      }
      if (overlapping >= roomCount) {
        const dayLabels: Record<string, string> = { MO: 'Montag', TU: 'Dienstag', WE: 'Mittwoch', TH: 'Donnerstag', FR: 'Freitag', SA: 'Samstag', SU: 'Sonntag' }
        return `Alle Räume belegt: ${dayLabels[slot.day] || slot.day} ${slot.startTime}–${slot.endTime}. ${roomCount} von ${roomCount} Räumen sind bereits vergeben.`
      }
    }
  }

  return null
}

// Admin email list
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'remy.dostal@gmail.com').split(',').map(e => e.trim())

// Lightweight admin auth – validates JWT and checks admin email
// Does NOT require a provider record (unlike requireAuth)
export async function requireAdmin(req: ParsedRequest, res: ApiResponse): Promise<{ userId: string; email: string } | null> {
  const token = req.raw.headers.authorization?.replace('Bearer ', '')
  if (!token) { res.error(401, 'Nicht authentifiziert'); return null }
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user || !user.email) { res.error(401, 'Token ungültig oder abgelaufen'); return null }
  if (!ADMIN_EMAILS.includes(user.email)) { res.error(403, 'Kein Admin-Zugang'); return null }
  return { userId: user.id, email: user.email }
}
