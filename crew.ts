// ============================================================
// Crew Routes — Eltern-zu-Eltern Mini-Messenger (V1)
// Spec: project_ukc_crew_feature.md
// ============================================================
//
// Endpoints (alle /api/portal/crew/*):
//   POST   /invite-link              → frischer Token + URL
//   GET    /preview/:token           → public Sender-Snippet (no auth)
//   POST   /accept/:token            → auth'd, baut Connection
//   GET    /                         → list connections + unread
//   GET    /:connectionId            → connection detail + other-side profile
//   GET    /:connectionId/messages   → message thread (optional ?since=ISO)
//   POST   /:connectionId/messages   → send message
//   POST   /:connectionId/read       → mark messages from other side as read
//   POST   /:connectionId/block      → block (silent fail for sent messages)
//   DELETE /:connectionId            → unverbinden + cascade messages
//
// ── Design-Decision: Same-Provider-Gate ist EINTRITTSHÜRDE, kein Lifecycle-Filter ──
// Beim Invite-Erstellen + Accept prüfen wir, dass beide Eltern eine aktive Buchung
// beim selben Provider haben. Danach bleibt die Connection aber persistent — auch
// wenn eine Seite ihre Buchung später storniert. Begründung: soziale Verbindung
// gehört den Eltern, nicht dem Provider; ein Storno soll nicht die Beziehung killen.
// DSGVO-Schutz ist via /block + /:connectionId DELETE in Eltern-Hand.
// ============================================================

import { createHash, randomBytes } from 'node:crypto'
import { Router } from '../router'
import { getServiceClient } from '../../lib/supabase'
import { rateLimit } from './helpers'
import { authenticateParent } from './portal'

// Hash a token (URL-safe) into the storage form
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// Generate a URL-safe random token (16 bytes → 22 chars base64url)
function genToken(): string {
  return randomBytes(16).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Canonical ordering: a < b for parent_connections
function canonicalPair(p1: string, p2: string): { a: string; b: string } {
  return p1 < p2 ? { a: p1, b: p2 } : { a: p2, b: p1 }
}

// Compute child-age summary from parents.children JSONB
function childSummary(children: any[]): string {
  if (!Array.isArray(children) || !children.length) return ''
  const yr = new Date().getFullYear()
  const ages = children
    .map(c => c?.birthYear ? (yr - Number(c.birthYear)) : null)
    .filter(a => a !== null && a >= 0 && a < 30)
  if (!ages.length) return ''
  return ages.length === 1 ? `Kind ${ages[0]} J.` : `${ages.length} Kinder (${ages.join(', ')} J.)`
}

// Format parent display: first name + child summary
function formatParentDisplay(p: any): { firstName: string; display: string; childSummary: string } {
  const first = String(p?.name || '').split(' ')[0] || 'Eltern'
  const cs = childSummary(p?.children)
  return {
    firstName: first,
    display: cs ? `${first} (${cs})` : first,
    childSummary: cs,
  }
}

// Resolve which side of the connection the current parent is on
function pickOtherId(conn: any, myId: string): string {
  return conn.parent_a_id === myId ? conn.parent_b_id : conn.parent_a_id
}

export function registerCrewRoutes(router: Router) {

  // ── POST /api/portal/crew/invite-link ─────────────────────
  // Generiert frischen Token + URL für Sharing via WhatsApp/Copy
  router.post('/api/portal/crew/invite-link', async (req, res) => {
    const auth = await authenticateParent(req, res)
    if (!auth) return

    // Rate limit: max 10 fresh links pro Stunde pro parent
    if (!rateLimit(`crew-invite:${auth.parentId}`, 10, 60 * 60 * 1000)) {
      return res.error(429, 'Zu viele Links erstellt. Bitte später erneut.')
    }

    const sb = getServiceClient()

    // Same-Provider: nimm den ersten aktiven Provider, bei dem dieser Parent gebucht hat
    const { data: bookings } = await sb.from('provider_bookings')
      .select('provider_id')
      .eq('parent_id', auth.parentId)
      .neq('status', 'cancelled')
      .limit(1)

    if (!bookings || !bookings.length) {
      return res.error(400, 'Du brauchst eine aktive Buchung bei einem Studio, um Crew-Links zu erstellen.')
    }

    const providerId = bookings[0].provider_id
    const token = genToken()
    const tokenHash = hashToken(token)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30d

    const { error } = await sb.from('parent_invite_tokens').insert({
      sender_id: auth.parentId,
      provider_id: providerId,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    if (error) return res.error(500, 'Token konnte nicht gespeichert werden')

    const origin = process.env.APP_PUBLIC_URL || 'https://app.urbankids.club'
    const url = `${origin}/portal/?invite=${token}`

    res.json({ data: { url, token, expiresAt } })
  })

  // ── GET /api/portal/crew/preview/:token ───────────────────
  // Public preview: zeigt Sender-Profil-Snippet bevor Empfänger akzeptiert
  router.get('/api/portal/crew/preview/:token', async (req, res) => {
    const token = String(req.params.token || '')
    if (!token) return res.error(400, 'Token fehlt')
    const tokenHash = hashToken(token)

    const sb = getServiceClient()
    const { data: invite } = await sb.from('parent_invite_tokens')
      .select('sender_id, provider_id, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (!invite) return res.error(404, 'Link ungültig oder abgelaufen')
    if (invite.used_at) return res.error(410, 'Dieser Link wurde bereits verwendet')
    if (new Date(invite.expires_at) < new Date()) return res.error(410, 'Link abgelaufen')

    // Sender-Profil + Provider-Name laden
    const { data: sender } = await sb.from('parents').select('id, name, children').eq('id', invite.sender_id).maybeSingle()
    const { data: provider } = await sb.from('providers').select('id, company_name, display_name').eq('id', invite.provider_id).maybeSingle()

    if (!sender || !provider) return res.error(404, 'Eingeladener oder Studio nicht gefunden')

    const senderInfo = formatParentDisplay(sender)
    const providerName = (provider as any).display_name || provider.company_name || 'Studio'

    res.json({
      data: {
        senderName: senderInfo.firstName,
        senderDisplay: senderInfo.display,
        senderChildSummary: senderInfo.childSummary,
        providerName,
        providerId: provider.id,
      },
    })
  })

  // ── POST /api/portal/crew/accept/:token ───────────────────
  // Auth'd accept: baut Connection (idempotent wenn schon connected)
  router.post('/api/portal/crew/accept/:token', async (req, res) => {
    const auth = await authenticateParent(req, res)
    if (!auth) return

    const token = String(req.params.token || '')
    if (!token) return res.error(400, 'Token fehlt')
    const tokenHash = hashToken(token)

    const sb = getServiceClient()
    const { data: invite } = await sb.from('parent_invite_tokens')
      .select('id, sender_id, provider_id, expires_at, used_at, used_by')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (!invite) return res.error(404, 'Link ungültig oder abgelaufen')
    if (new Date(invite.expires_at) < new Date()) return res.error(410, 'Link abgelaufen')

    if (invite.sender_id === auth.parentId) {
      return res.error(400, 'Das ist dein eigener Link — schicke ihn an jemand anderen.')
    }

    // Same-Provider-Gate: Empfänger muss auch beim Studio gebucht haben
    const { data: recipientBookings } = await sb.from('provider_bookings')
      .select('id')
      .eq('parent_id', auth.parentId)
      .eq('provider_id', invite.provider_id)
      .neq('status', 'cancelled')
      .limit(1)

    if (!recipientBookings || !recipientBookings.length) {
      // Sender-Studio holen für die Fehlermeldung
      const { data: prov } = await sb.from('providers').select('display_name, company_name').eq('id', invite.provider_id).maybeSingle()
      const provName = (prov as any)?.display_name || prov?.company_name || 'dem Studio'
      return res.error(403, `Du brauchst erst eine Buchung bei ${provName}, bevor du dich verbinden kannst.`)
    }

    const { a, b } = canonicalPair(invite.sender_id, auth.parentId)

    // Idempotency: existing connection? (z.B. Re-Click oder zweiter Token vom selben Sender)
    const { data: existing } = await sb.from('parent_connections')
      .select('id, status')
      .eq('parent_a_id', a).eq('parent_b_id', b).eq('provider_id', invite.provider_id)
      .maybeSingle()

    if (existing) {
      if (existing.status === 'blocked') {
        return res.error(403, 'Diese Verbindung wurde blockiert.')
      }
      // Token mit-claimen wenn noch frei (bewahrt Single-Use Semantik), aber atomar
      if (!invite.used_at) {
        await sb.from('parent_invite_tokens')
          .update({ used_at: new Date().toISOString(), used_by: auth.parentId })
          .eq('id', invite.id)
          .is('used_at', null)
      }
      return res.json({ data: { connectionId: existing.id, alreadyConnected: true } })
    }

    // Token-Claim atomar: nur eine Request gewinnt das WHERE used_at IS NULL.
    // Ohne diesen Step könnten zwei parallele Empfänger beide eine Connection bauen.
    const claimNow = new Date().toISOString()
    const { data: claimed, error: claimErr } = await sb.from('parent_invite_tokens')
      .update({ used_at: claimNow, used_by: auth.parentId })
      .eq('id', invite.id)
      .is('used_at', null)
      .select('id')
      .maybeSingle()
    if (claimErr) return res.error(500, claimErr.message)
    if (!claimed) {
      // Race: zwischen invite-Read und Claim hat jemand anderes den Token verbraucht.
      // Falls eine Connection mittlerweile existiert (z.B. selbe Person doppel-klick) → idempotent.
      const { data: existing2 } = await sb.from('parent_connections')
        .select('id, status')
        .eq('parent_a_id', a).eq('parent_b_id', b).eq('provider_id', invite.provider_id)
        .maybeSingle()
      if (existing2) {
        if (existing2.status === 'blocked') return res.error(403, 'Diese Verbindung wurde blockiert.')
        return res.json({ data: { connectionId: existing2.id, alreadyConnected: true } })
      }
      return res.error(410, 'Dieser Link wurde bereits verwendet.')
    }

    // Build connection (Token ist bereits geclaimed → Single-Use bewiesen)
    const { data: conn, error: insErr } = await sb.from('parent_connections').insert({
      parent_a_id: a,
      parent_b_id: b,
      provider_id: invite.provider_id,
      status: 'active',
    }).select('id').single()
    if (insErr || !conn) {
      // Extreme Race: UNIQUE-Konflikt durch parallel-Path → fetch existing
      const { data: existing3 } = await sb.from('parent_connections')
        .select('id')
        .eq('parent_a_id', a).eq('parent_b_id', b).eq('provider_id', invite.provider_id)
        .maybeSingle()
      if (existing3) return res.json({ data: { connectionId: existing3.id, alreadyConnected: true } })
      return res.error(500, insErr?.message || 'Verbindung konnte nicht erstellt werden')
    }

    res.json({ data: { connectionId: conn.id, alreadyConnected: false } })
  })

  // ── GET /api/portal/crew ──────────────────────────────────
  // List connections für aktuellen Parent + last-message + unread-count
  router.get('/api/portal/crew', async (req, res) => {
    const auth = await authenticateParent(req, res)
    if (!auth) return

    const sb = getServiceClient()
    const { data: conns } = await sb.from('parent_connections')
      .select('id, parent_a_id, parent_b_id, provider_id, status, blocked_by, created_at, last_message_at')
      .or(`parent_a_id.eq.${auth.parentId},parent_b_id.eq.${auth.parentId}`)
      .neq('status', 'blocked')
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (!conns || !conns.length) return res.json({ data: [] })

    // Hide connections blockiert by self (würde aber nicht bei .neq('status','blocked') auftauchen — keep)
    const visible = conns.filter(c => !(c.status === 'blocked' && c.blocked_by === auth.parentId))

    const otherIds = [...new Set(visible.map(c => pickOtherId(c, auth.parentId)))]
    const provIds = [...new Set(visible.map(c => c.provider_id))]

    const { data: parents } = otherIds.length
      ? await sb.from('parents').select('id, name, children').in('id', otherIds)
      : { data: [] }
    const { data: provs } = provIds.length
      ? await sb.from('providers').select('id, company_name, display_name').in('id', provIds)
      : { data: [] }

    const parentMap = new Map((parents ?? []).map((p: any) => [p.id, p]))
    const provMap = new Map((provs ?? []).map((p: any) => [p.id, (p as any).display_name || p.company_name]))

    // Last message + unread für jeden Connection
    const connIds = visible.map(c => c.id)
    const { data: lastMsgs } = connIds.length
      ? await sb.from('parent_messages')
          .select('connection_id, sender_id, body, sent_at, read_at')
          .in('connection_id', connIds)
          .order('sent_at', { ascending: false })
      : { data: [] }

    const lastByConn = new Map<string, any>()
    const unreadByConn = new Map<string, number>()
    for (const m of (lastMsgs ?? [])) {
      if (!lastByConn.has(m.connection_id)) lastByConn.set(m.connection_id, m)
      // unread = empfangene Message ohne read_at (sender ≠ ich)
      if (m.sender_id !== auth.parentId && !m.read_at) {
        unreadByConn.set(m.connection_id, (unreadByConn.get(m.connection_id) || 0) + 1)
      }
    }

    const result = visible.map(c => {
      const otherId = pickOtherId(c, auth.parentId)
      const otherParent = parentMap.get(otherId)
      const display = formatParentDisplay(otherParent)
      const lm = lastByConn.get(c.id)
      return {
        connectionId: c.id,
        otherParentId: otherId,
        otherFirstName: display.firstName,
        otherDisplay: display.display,
        otherChildSummary: display.childSummary,
        providerName: provMap.get(c.provider_id) || 'Studio',
        status: c.status,
        createdAt: c.created_at,
        lastMessageAt: c.last_message_at,
        lastMessageBody: lm?.body || '',
        lastMessageFromMe: lm?.sender_id === auth.parentId,
        unreadCount: unreadByConn.get(c.id) || 0,
      }
    })

    // Total unread für Tab-Badge — gewrappt in data für apiFetch-Consumer
    const totalUnread = result.reduce((s, r) => s + r.unreadCount, 0)

    res.json({ data: { threads: result, totalUnread } })
  })

  // ── GET /api/portal/crew/:connectionId ────────────────────
  router.get('/api/portal/crew/:connectionId', async (req, res) => {
    const auth = await authenticateParent(req, res)
    if (!auth) return

    const sb = getServiceClient()
    const { data: conn } = await sb.from('parent_connections')
      .select('*')
      .eq('id', req.params.connectionId)
      .maybeSingle()

    if (!conn) return res.error(404, 'Verbindung nicht gefunden')
    if (conn.parent_a_id !== auth.parentId && conn.parent_b_id !== auth.parentId) {
      return res.error(403, 'Kein Zugriff auf diese Verbindung')
    }
    if (conn.status === 'blocked' && conn.blocked_by === auth.parentId) {
      return res.error(403, 'Du hast diese Verbindung blockiert')
    }

    const otherId = pickOtherId(conn, auth.parentId)
    const { data: other } = await sb.from('parents').select('id, name, children').eq('id', otherId).maybeSingle()
    const { data: prov } = await sb.from('providers').select('id, company_name, display_name').eq('id', conn.provider_id).maybeSingle()
    const display = formatParentDisplay(other)

    res.json({
      data: {
        connectionId: conn.id,
        status: conn.status,
        createdAt: conn.created_at,
        lastMessageAt: conn.last_message_at,
        otherParentId: otherId,
        otherFirstName: display.firstName,
        otherDisplay: display.display,
        otherChildSummary: display.childSummary,
        providerName: (prov as any)?.display_name || prov?.company_name || 'Studio',
        amIBlocker: conn.blocked_by === auth.parentId,
      },
    })
  })

  // ── GET /api/portal/crew/:connectionId/messages ───────────
  router.get('/api/portal/crew/:connectionId/messages', async (req, res) => {
    const auth = await authenticateParent(req, res)
    if (!auth) return

    const sb = getServiceClient()
    const { data: conn } = await sb.from('parent_connections')
      .select('id, parent_a_id, parent_b_id, status, blocked_by')
      .eq('id', req.params.connectionId)
      .maybeSingle()

    if (!conn) return res.error(404, 'Verbindung nicht gefunden')
    if (conn.parent_a_id !== auth.parentId && conn.parent_b_id !== auth.parentId) {
      return res.error(403, 'Kein Zugriff')
    }
    if (conn.status === 'blocked' && conn.blocked_by === auth.parentId) {
      return res.error(403, 'Du hast diese Verbindung blockiert')
    }

    const since = req.query.since ? String(req.query.since) : null
    let q = sb.from('parent_messages')
      .select('id, sender_id, body, sent_at, read_at')
      .eq('connection_id', req.params.connectionId)
      .order('sent_at', { ascending: true })
      .limit(500)
    if (since) q = q.gt('sent_at', since)

    const { data: msgs } = await q
    res.json({ data: msgs || [] })
  })

  // ── POST /api/portal/crew/:connectionId/messages ──────────
  router.post('/api/portal/crew/:connectionId/messages', async (req, res) => {
    const auth = await authenticateParent(req, res)
    if (!auth) return

    const body = String((req.body as any)?.body || '').trim()
    if (!body) return res.error(400, 'Nachricht ist leer')
    if (body.length > 5000) return res.error(400, 'Nachricht ist zu lang (max 5000 Zeichen)')

    if (!rateLimit(`crew-msg:${auth.parentId}`, 60, 60 * 1000)) {
      return res.error(429, 'Zu viele Nachrichten. Bitte kurz warten.')
    }

    const sb = getServiceClient()
    const { data: conn } = await sb.from('parent_connections')
      .select('id, parent_a_id, parent_b_id, status, blocked_by')
      .eq('id', req.params.connectionId)
      .maybeSingle()

    if (!conn) return res.error(404, 'Verbindung nicht gefunden')
    if (conn.parent_a_id !== auth.parentId && conn.parent_b_id !== auth.parentId) {
      return res.error(403, 'Kein Zugriff')
    }

    // Anti-Drama-Pattern: bei Block silent success ohne INSERT
    // - Wenn ICH geblockt habe → Reject explizit (verhindert Versehen)
    // - Wenn ANDERE mich geblockt hat → silent success, Sender denkt es ging raus
    if (conn.status === 'blocked') {
      if (conn.blocked_by === auth.parentId) {
        return res.error(403, 'Du hast diese Verbindung blockiert')
      }
      // Anderer hat blockiert → silent success
      return res.json({ data: { silent: true } })
    }

    const nowIso = new Date().toISOString()
    const { data: inserted, error: insErr } = await sb.from('parent_messages').insert({
      connection_id: req.params.connectionId,
      sender_id: auth.parentId,
      body,
      sent_at: nowIso,
    }).select('id, sender_id, body, sent_at, read_at').single()
    if (insErr || !inserted) return res.error(500, insErr?.message || 'Nachricht konnte nicht gesendet werden')

    // last_message_at aktualisieren
    await sb.from('parent_connections').update({ last_message_at: nowIso }).eq('id', req.params.connectionId)

    res.json({ data: inserted })
  })

  // ── POST /api/portal/crew/:connectionId/read ──────────────
  // Markiert alle Messages der Gegenseite als gelesen
  router.post('/api/portal/crew/:connectionId/read', async (req, res) => {
    const auth = await authenticateParent(req, res)
    if (!auth) return

    const sb = getServiceClient()
    const { data: conn } = await sb.from('parent_connections')
      .select('id, parent_a_id, parent_b_id')
      .eq('id', req.params.connectionId)
      .maybeSingle()

    if (!conn) return res.error(404, 'Verbindung nicht gefunden')
    if (conn.parent_a_id !== auth.parentId && conn.parent_b_id !== auth.parentId) {
      return res.error(403, 'Kein Zugriff')
    }

    const { error } = await sb.from('parent_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('connection_id', req.params.connectionId)
      .neq('sender_id', auth.parentId)
      .is('read_at', null)
    if (error) return res.error(500, error.message)

    res.json({ data: { success: true } })
  })

  // ── POST /api/portal/crew/:connectionId/block ─────────────
  router.post('/api/portal/crew/:connectionId/block', async (req, res) => {
    const auth = await authenticateParent(req, res)
    if (!auth) return

    const sb = getServiceClient()
    const { data: conn } = await sb.from('parent_connections')
      .select('id, parent_a_id, parent_b_id')
      .eq('id', req.params.connectionId)
      .maybeSingle()

    if (!conn) return res.error(404, 'Verbindung nicht gefunden')
    if (conn.parent_a_id !== auth.parentId && conn.parent_b_id !== auth.parentId) {
      return res.error(403, 'Kein Zugriff')
    }

    const { error } = await sb.from('parent_connections')
      .update({ status: 'blocked', blocked_by: auth.parentId })
      .eq('id', req.params.connectionId)
    if (error) return res.error(500, error.message)

    res.json({ data: { success: true } })
  })

  // ── DELETE /api/portal/crew/:connectionId ─────────────────
  // Verbindung lösen + alle Messages cascade-deleten
  router.delete('/api/portal/crew/:connectionId', async (req, res) => {
    const auth = await authenticateParent(req, res)
    if (!auth) return

    const sb = getServiceClient()
    const { data: conn } = await sb.from('parent_connections')
      .select('id, parent_a_id, parent_b_id')
      .eq('id', req.params.connectionId)
      .maybeSingle()

    if (!conn) return res.error(404, 'Verbindung nicht gefunden')
    if (conn.parent_a_id !== auth.parentId && conn.parent_b_id !== auth.parentId) {
      return res.error(403, 'Kein Zugriff')
    }

    // CASCADE on parent_messages.connection_id wird automatisch
    const { error } = await sb.from('parent_connections').delete().eq('id', req.params.connectionId)
    if (error) return res.error(500, error.message)

    res.json({ data: { success: true } })
  })
}
