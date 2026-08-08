/**
 * Book-Course Service — Eltern-Buchungen aus dem Portal
 *
 * 3 Buchungs-Typen:
 *   trial      — Probestunde (kostenlos, 1× pro Kurs)
 *   block      — Kurs-Block kaufen (z.B. 8er für 96€)
 *   credit     — Add-Up-Slot via Credit einlösen (1 Credit = 1 Termin)
 *
 * Status: STUB (in-memory). Bei Schema-Apply (006) wird der Repo-Layer
 * gegen Supabase getauscht. Service-Signatur bleibt.
 *
 * Validation:
 *   - trial: prüft ob Kind schon mal Probestunde bei diesem Kurs hatte
 *   - block: prüft Verfügbarkeit + Kapazität
 *   - credit: prüft credit-balance + ob Slot überhaupt offen für Add-Ups
 */
import type { IncomingMessage, ServerResponse } from 'http'

export type BookingKind = 'trial' | 'block' | 'credit'

export interface BookCourseInput {
  kind: BookingKind
  courseId: string
  childName?: string         // for trial bookings
  childAge?: number
  sessionDate?: string       // ISO date for credit redemption / trial slot
  paymentMethod?: 'sepa' | 'card' | 'paypal'
  marketingConsent?: boolean
  note?: string
}

export interface BookCourseResult {
  ok: boolean
  bookingId: string
  kind: BookingKind
  status: 'confirmed' | 'pending_payment' | 'waitlist'
  /** for trial / credit bookings: the actual session to attend */
  sessionDate?: string
  /** for block bookings: total amount (cents, gross) */
  amountCents?: number
  /** for credit bookings: credits remaining after deduction */
  creditBalanceAfter?: number
  /** for waitlist: position */
  waitlistPosition?: number
  message: string            // user-facing summary
}

interface BookingEvent extends BookCourseResult {
  parentId: string
  providerId: string
  courseId: string
  at: string
}
const eventLog: BookingEvent[] = []

function uid(prefix = 'bk'): string {
  return prefix + '-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

export async function bookCourse(input: {
  parentId: string
  providerId: string
  data: BookCourseInput
}): Promise<BookCourseResult> {
  const { kind, courseId } = input.data
  const id = uid('bk')

  let result: BookCourseResult
  switch (kind) {
    case 'trial':
      // TODO post-006: check trial_history for (parent_id, course_id) — block double-trial
      result = {
        ok: true,
        bookingId: id,
        kind,
        status: 'confirmed',
        sessionDate: input.data.sessionDate,
        message: `Probestunde gebucht. Sophie bekommt eine Mail, du auch — Termin ist im Postfach hinterlegt.`,
      }
      break

    case 'block':
      // TODO post-006: check capacity, run Stripe Checkout, set 'pending_payment'
      result = {
        ok: true,
        bookingId: id,
        kind,
        status: 'pending_payment',
        amountCents: 9600,             // mock: 96€ for 8er-Block
        message: `Kurs-Block reserviert. Zahlung wird über ${input.data.paymentMethod ?? 'SEPA'} ausgelöst — Bestätigung kommt per Mail.`,
      }
      break

    case 'credit': {
      // TODO post-006: SELECT credits FROM parent_provider_links WHERE …
      const balanceBefore = 3
      if (balanceBefore < 1) {
        return {
          ok: false,
          bookingId: id,
          kind,
          status: 'pending_payment',
          message: 'Keine Credits verfügbar — neuen Block buchen oder warten bis ein Termin storniert wird.',
        }
      }
      result = {
        ok: true,
        bookingId: id,
        kind,
        status: 'confirmed',
        sessionDate: input.data.sessionDate,
        creditBalanceAfter: balanceBefore - 1,
        message: `Add-Up gebucht — 1 Credit eingelöst (noch ${balanceBefore - 1} verfügbar).`,
      }
      break
    }

    default:
      return {
        ok: false,
        bookingId: id,
        kind,
        status: 'pending_payment',
        message: `Unbekannte Buchungs-Art: ${String(kind)}`,
      }
  }

  eventLog.push({
    ...result,
    parentId: input.parentId,
    providerId: input.providerId,
    courseId,
    at: new Date().toISOString(),
  })
  if (eventLog.length > 500) eventLog.splice(0, eventLog.length - 500)

  return result
}

export function recentBookings(providerId?: string, limit = 50) {
  const filtered = providerId ? eventLog.filter(e => e.providerId === providerId) : eventLog
  return filtered.slice(-limit).reverse()
}

/* -------------------------------------------------------------------------- */
/*  HTTP handler                                                              */
/* -------------------------------------------------------------------------- */

interface SessionGetter {
  (req: IncomingMessage): { parentId: string; providerId: string } | null
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

const ROUTE_KIND_MAP: Record<string, BookingKind> = {
  '/api/parent/book-trial': 'trial',
  '/api/parent/book-block': 'block',
  '/api/parent/redeem-credit': 'credit',
}

export async function handleBookCourse(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  getSession: SessionGetter
): Promise<boolean> {
  const kind = ROUTE_KIND_MAP[url.pathname]
  if (!kind) return false

  if (req.method !== 'POST') {
    json(res, 405, { error: 'method_not_allowed' })
    return true
  }

  let raw: string
  try {
    raw = await readBody(req)
  } catch {
    json(res, 400, { error: 'read_error' })
    return true
  }

  let payload: Partial<BookCourseInput>
  try {
    payload = JSON.parse(raw || '{}')
  } catch {
    json(res, 400, { error: 'invalid_json' })
    return true
  }

  if (!payload.courseId) {
    json(res, 400, { error: 'missing_field', field: 'courseId' })
    return true
  }

  const session = getSession(req) ?? { parentId: 'demo-parent', providerId: 'socialy' }

  const result = await bookCourse({
    parentId: session.parentId,
    providerId: session.providerId,
    data: {
      kind,
      courseId: String(payload.courseId),
      childName: payload.childName ? String(payload.childName).slice(0, 100) : undefined,
      childAge: typeof payload.childAge === 'number' ? payload.childAge : undefined,
      sessionDate: payload.sessionDate ? String(payload.sessionDate) : undefined,
      paymentMethod: payload.paymentMethod as BookCourseInput['paymentMethod'],
      marketingConsent: !!payload.marketingConsent,
      note: payload.note ? String(payload.note).slice(0, 500) : undefined,
    },
  })

  json(res, result.ok ? 200 : 422, result)
  return true
}
