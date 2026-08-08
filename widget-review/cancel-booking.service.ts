/**
 * Cancel-Booking Service — Eltern-Absage mit 24h-Karenz
 *
 * Logik:
 *   - hoursUntil >= GRACE_HOURS → 1 Credit zurück + Status "cancelled"
 *   - hoursUntil  < GRACE_HOURS → kein Credit, Status "cancelled_late"
 *   - Beide Fälle: Provider bekommt Krankmeldungs-Nachricht im Postfach
 *
 * Status: STUB (in-memory). Echte Buchungen-DB-Integration kommt zusammen mit
 * dem Schema-Apply (006). Die Service-Signatur bleibt stabil.
 */
import type { IncomingMessage, ServerResponse } from 'http'

export const GRACE_HOURS = 24

export type CancelReason =
  | 'krank'
  | 'ich-krank'
  | 'termin'
  | 'reise'
  | 'wetter'
  | 'anders'

export interface CancelBookingInput {
  bookingId: string
  reason: CancelReason | string
  note?: string
  hoursUntil: number               // until lesson starts; client-supplied for now
}

export interface CancelBookingResult {
  ok: boolean
  bookingId: string
  status: 'cancelled' | 'cancelled_late'
  creditRefunded: boolean
  newBalanceHint?: number          // optional UI hint
  providerNotified: boolean
}

/* In-memory log so the demo dashboard could show recent cancellations.
   Real impl: write to bookings + parent_postfach_messages tables. */
interface CancelEvent extends CancelBookingResult {
  parentId: string
  providerId: string
  reason: string
  note?: string
  at: string
}
const eventLog: CancelEvent[] = []

export async function cancelBooking(input: {
  parentId: string
  providerId: string
  bookingId: string
  reason: string
  note?: string
  hoursUntil: number
}): Promise<CancelBookingResult> {
  const inGrace = input.hoursUntil >= GRACE_HOURS
  const status = inGrace ? 'cancelled' : 'cancelled_late'

  // TODO once 006 applied:
  //  1. UPDATE bookings SET status = $1, cancelled_at = now() WHERE id = $2 AND parent_id = $3
  //  2. IF inGrace THEN UPDATE parent_provider_links SET credits = credits + 1 ...
  //  3. INSERT INTO parent_postfach_messages (...) for provider
  //  4. Optionally INSERT INTO push_send_queue for provider's notification

  const result: CancelBookingResult = {
    ok: true,
    bookingId: input.bookingId,
    status,
    creditRefunded: inGrace,
    providerNotified: true,
  }

  eventLog.push({
    ...result,
    parentId: input.parentId,
    providerId: input.providerId,
    reason: input.reason,
    note: input.note,
    at: new Date().toISOString(),
  })
  // keep log bounded
  if (eventLog.length > 500) eventLog.splice(0, eventLog.length - 500)

  return result
}

export function recentCancellations(providerId?: string, limit = 50) {
  const filtered = providerId
    ? eventLog.filter(e => e.providerId === providerId)
    : eventLog
  return filtered.slice(-limit).reverse()
}

/* -------------------------------------------------------------------------- */
/*  HTTP handler                                                              */
/* -------------------------------------------------------------------------- */

interface SessionGetter {
  (req: IncomingMessage): { parentId: string; providerId: string } | null
}

export async function handleCancelBooking(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  getSession: SessionGetter
): Promise<boolean> {
  if (url.pathname !== '/api/parent/cancel-booking') return false

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'method_not_allowed' }))
    return true
  }

  const chunks: Buffer[] = []
  await new Promise<void>(resolve => {
    req.on('data', c => chunks.push(c))
    req.on('end', () => resolve())
  })
  let input: CancelBookingInput
  try {
    input = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
  } catch {
    res.statusCode = 400
    res.end(JSON.stringify({ error: 'invalid_json' }))
    return true
  }

  if (!input.bookingId || typeof input.hoursUntil !== 'number' || !input.reason) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'missing_fields', required: ['bookingId', 'hoursUntil', 'reason'] }))
    return true
  }

  // Session optional in demo mode — falls back to a synthetic identity so the
  // preview page works without login. In production, require session.
  const session = getSession(req) ?? {
    parentId: 'demo-parent',
    providerId: 'socialy',
  }

  const result = await cancelBooking({
    parentId: session.parentId,
    providerId: session.providerId,
    bookingId: String(input.bookingId),
    reason: String(input.reason),
    note: input.note ? String(input.note).slice(0, 500) : undefined,
    hoursUntil: Math.max(0, Number(input.hoursUntil)),
  })

  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(result))
  return true
}
