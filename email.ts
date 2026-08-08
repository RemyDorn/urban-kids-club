// ============================================================
// E-Mail Service – Transactional E-Mails (V2 · Socialy-Brandbook)
// ============================================================
// Default-Theme: Socialy (Alpha-Pilot-Provider)
// Token-basiert → pro Provider überschreibbar via brandOverride.
// Design-Prinzipien: Keine Emojis, ruhige Ink-Flächen statt Gradient,
// Instrument-Serif-Italic für genau 1 Akzentwort pro Headline.
// ============================================================

export interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
  from?: string
  replyTo?: string
  /** Provider-Branding overrides — sets From-Display-Name + Reply-To wenn from/replyTo nicht explizit gesetzt */
  brand?: ProviderBranding
}

export interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
}

interface EmailProvider {
  send(options: EmailOptions): Promise<EmailResult>
}

// ============================================================
// PROVIDERS (Console dev / Resend prod)
// ============================================================

class ConsoleEmailProvider implements EmailProvider {
  async send(options: EmailOptions): Promise<EmailResult> {
    console.log(`📧 E-Mail gesendet:`)
    console.log(`   An: ${options.to}`)
    console.log(`   Betreff: ${options.subject}`)
    console.log(`   Text: ${(options.text ?? options.html).substring(0, 100)}...`)
    return { success: true, messageId: `dev-${Date.now()}` }
  }
}

class ResendEmailProvider implements EmailProvider {
  private apiKey: string
  private fromAddress: string

  constructor(apiKey: string, fromAddress: string = 'Urban Kids Club <noreply@urbankids.club>') {
    this.apiKey = apiKey
    this.fromAddress = fromAddress
  }

  async send(options: EmailOptions): Promise<EmailResult> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: options.from ?? this.fromAddress,
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
          reply_to: options.replyTo,
        }),
      })
      if (!response.ok) {
        const error = await response.text()
        return { success: false, error: `Resend API Error: ${error}` }
      }
      const data = await response.json() as { id: string }
      return { success: true, messageId: data.id }
    } catch (err) {
      return { success: false, error: `E-Mail Versand fehlgeschlagen: ${err}` }
    }
  }
}

async function sendWithRetry(
  sendFn: () => Promise<EmailResult>,
  maxRetries = 3,
  label = 'Email'
): Promise<EmailResult> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await sendFn()
      if (result.success) return result
      const isTransient =
        result.error?.includes('500') ||
        result.error?.includes('502') ||
        result.error?.includes('503') ||
        result.error?.includes('504') ||
        result.error?.includes('ECONNRESET') ||
        result.error?.includes('ETIMEDOUT') ||
        result.error?.includes('fetch failed')
      if (attempt === maxRetries || !isTransient) {
        console.error(`[${label}] Failed after ${attempt} attempt(s):`, result.error)
        return result
      }
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
      console.warn(`[${label}] Attempt ${attempt} failed, retrying in ${delay}ms...`)
      await new Promise(r => setTimeout(r, delay))
    } catch (err: any) {
      const isTransient =
        err?.status >= 500 ||
        err?.code === 'ECONNRESET' ||
        err?.code === 'ETIMEDOUT' ||
        err?.message?.includes('fetch failed')
      if (attempt === maxRetries || !isTransient) {
        console.error(`[${label}] Failed after ${attempt} attempt(s):`, err?.message || err)
        return { success: false, error: `${label} fehlgeschlagen: ${err?.message || err}` }
      }
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
      console.warn(`[${label}] Attempt ${attempt} threw, retrying in ${delay}ms...`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  return { success: false, error: `${label} failed after ${maxRetries} attempts` }
}

function createEmailProvider(): EmailProvider {
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    return new ResendEmailProvider(
      resendKey,
      process.env.EMAIL_FROM ?? 'Urban Kids Club <noreply@urbankids.club>'
    )
  }
  return new ConsoleEmailProvider()
}

const emailProvider = createEmailProvider()

// ============================================================
// MULTI-TENANT PROVIDER-BRANDING
// ============================================================
// Jeder Provider kann sein eigenes Logo, Anzeige-Name, From-Display und
// Reply-To setzen. Templates fallen auf THEME-Defaults zurück, wenn kein
// branding übergeben wird.

export interface ProviderBranding {
  name?: string          // Display-Name (display_name oder company_name)
  logoUrl?: string       // Logo URL (header img)
  fromEmail?: string     // optional: provider-eigene From-Adresse
  replyToEmail?: string  // optional: provider.email für Reply-To
  websiteUrl?: string    // optional: für Footer-Link
}

let _emailSbClient: any = null
async function _emailGetSb() {
  if (_emailSbClient) return _emailSbClient
  try {
    const mod: any = await import('./supabase')
    _emailSbClient = mod.getServiceClient ? mod.getServiceClient() : null
    return _emailSbClient
  } catch (e) {
    console.warn('[email] supabase client not available for branding lookup:', (e as any)?.message)
    return null
  }
}

const _brandingCache = new Map<string, { at: number; data: ProviderBranding }>()
const _BRANDING_TTL_MS = 5 * 60 * 1000

export async function getProviderBranding(providerId?: string | null): Promise<ProviderBranding | undefined> {
  if (!providerId) return undefined
  const cached = _brandingCache.get(providerId)
  if (cached && (Date.now() - cached.at) < _BRANDING_TTL_MS) return cached.data
  const sb = await _emailGetSb()
  if (!sb) return undefined
  try {
    const { data } = await sb.from('providers')
      .select('display_name, company_name, logo_url, email, website_url')
      .eq('id', providerId).maybeSingle()
    if (!data) return undefined
    const result: ProviderBranding = {
      name: data.display_name || data.company_name || undefined,
      logoUrl: data.logo_url || undefined,
      replyToEmail: data.email || undefined,
      websiteUrl: data.website_url || undefined,
    }
    _brandingCache.set(providerId, { at: Date.now(), data: result })
    return result
  } catch (e) {
    console.warn('[email] getProviderBranding failed:', (e as any)?.message)
    return undefined
  }
}

// Resolve branding from caller-provided fields (data.branding > data.providerId-lookup > undefined)
async function _resolveBranding(input: { branding?: ProviderBranding; providerId?: string }): Promise<ProviderBranding | undefined> {
  if (input.branding) return input.branding
  if (input.providerId) return await getProviderBranding(input.providerId)
  return undefined
}

// Build a "From"-Header that displays the provider name but keeps the platform's verified sender domain.
// Beispiel: '"Socialy" <noreply@urbankids.club>'
function _buildFromHeader(brand?: ProviderBranding): string | undefined {
  if (!brand?.name) return undefined
  // Sanitize: keine Anführungszeichen im display-name
  const safeName = String(brand.name).replace(/"/g, '')
  const baseFrom = process.env.EMAIL_FROM ?? 'Urban Kids Club <noreply@urbankids.club>'
  // Address aus baseFrom extrahieren
  const addrMatch = baseFrom.match(/<([^>]+)>/)
  const addr = addrMatch ? addrMatch[1] : baseFrom
  return `"${safeName}" <${addr}>`
}

// ============================================================
// BRAND-TOKENS (Socialy Default — pro Provider überschreibbar via ProviderBranding)
// ============================================================

const THEME = {
  // Farben
  bg: '#FBF5EA',            // Cream
  surface: '#FFFDF8',       // Card-Oberfläche
  surfaceAlt: '#F4E9D1',    // Sand Soft
  ink: '#1F1D18',           // Text primär
  inkMuted: '#67625A',      // Text sekundär
  primary: '#D96C45',       // Peach Deep
  primarySoft: '#F7B79C',   // Peach
  accent: '#A8B6A3',        // Sage
  accentDeep: '#6A7863',    // Sage Deep
  accentDark: '#4A5546',    // Sage Dark
  danger: '#B8392A',
  warning: '#E28862',
  border: 'rgba(31, 29, 24, 0.08)',
  borderStrong: 'rgba(31, 29, 24, 0.14)',

  // Fonts (E-Mail-Client-safe mit Fallbacks)
  fontBody: '"Bricolage Grotesque", system-ui, -apple-system, "Segoe UI", sans-serif',
  fontAccent: '"Instrument Serif", Georgia, "Times New Roman", serif',

  // Brand — Plattform-Default (Provider-Branding via ProviderBranding-Param überschreibt diesen Fallback)
  brandName: 'Urban Kids Club',
  brandNameAccent: 'Club', // Italic-Teil
  poweredBy: 'Urban Kids Club',
  poweredByUrl: 'https://urbankids.club',
  tagline: 'mit Nähe gemacht',
}


// ============================================================
// Helpers
// ============================================================

function fmtDateDE(input: string | undefined | null): string {
  if (!input) return ''
  const m = String(input).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return String(input)
  const y = m[1]; const mo = parseInt(m[2], 10); const d = parseInt(m[3], 10)
  const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
  return d + '. ' + (months[mo - 1] || mo) + ' ' + y
}

// ============================================================
// HTML-ESCAPE (für User-Input in Subject & Body)
// ============================================================

function esc(s: string | undefined | null): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ============================================================
// SHELL-RENDERER
// ============================================================

interface ShellOptions {
  preheader?: string       // Preview-Text in der Inbox
  kicker?: string          // Kleiner Kicker-Text über der Headline
  heading: string          // Headline mit <em>…</em> für kursiven Akzent
  body: string             // HTML-Body-Inhalt
  accent?: 'primary' | 'sage' | 'danger' | 'ink'  // Header-Akzent-Farbe
  brand?: ProviderBranding // optional: Provider-Branding overrides (Name + Logo + Footer-Link)
}

function shell(o: ShellOptions): string {
  // Header-Hintergrundfarbe pro Accent — alle hell & warm, keine dunklen Blöcke
  const headerBg = {
    primary: '#FDE4D3',   // warmes Peach-Tint
    sage:    '#E4EBE0',   // warmer Sage-Tint
    danger:  '#FAD5CC',   // sanftes Coral für Urgency
    ink:     '#FDE4D3',   // default = Peach-Tint
  }[o.accent ?? 'primary']

  // Italic-Akzentfarbe im Logo + Headline
  const italicColor = THEME.primary

  const preheader = o.preheader ? `
    <div style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">
      ${esc(o.preheader)}
    </div>` : ''

  const kickerHtml = o.kicker ? `
    <div style="font-size:11px;font-weight:600;color:${THEME.primary};letter-spacing:0.12em;text-transform:uppercase;margin-bottom:14px;">
      ${esc(o.kicker)}
    </div>` : ''

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title></title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;500;600&family=Instrument+Serif:ital@1&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; background:${THEME.bg}; }
  em { font-family:${THEME.fontAccent}; font-style:italic; font-weight:400; }
  a { color:${THEME.ink}; text-decoration:none; }
  a:hover, a:visited, a:active, a:focus { text-decoration:none !important; }
  /* Buttons: keine Underline, eigene Farbe per inline-style */
  a.btn, a.btn span, a.btn font { text-decoration:none !important; -webkit-text-decoration:none !important; }
  @media (max-width:620px) {
    .wrap { padding:16px !important; }
    .hero { padding:32px 24px !important; }
    .hero h1 { font-size:28px !important; }
    .content { padding:28px 24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${THEME.bg};font-family:${THEME.fontBody};color:${THEME.ink};-webkit-font-smoothing:antialiased;">
${preheader}
<div class="wrap" style="padding:28px 16px;background:${THEME.bg};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;margin:0 auto;">
    <tr>
      <td style="background:${THEME.surface};border-radius:20px;overflow:hidden;box-shadow:0 4px 20px rgba(217,108,69,0.08);">

        <!-- HELLER PEACH HEADER -->
        <div class="hero" style="background:${headerBg};padding:40px 36px 34px;">
          <div style="font-family:${THEME.fontBody};font-size:17px;font-weight:500;letter-spacing:-0.01em;color:${THEME.ink};margin-bottom:28px;">
            ${(() => {
              // Provider-Branding bevorzugen: Logo > Provider-Name > THEME.brandName
              if (o.brand?.logoUrl) {
                const altName = o.brand?.name || THEME.brandName
                return `<img src="${esc(o.brand.logoUrl)}" alt="${esc(altName)}" style="max-height:44px;max-width:220px;display:block;margin:0;" />`
              }
              if (o.brand?.name) {
                return `<span>${esc(o.brand.name)}</span>`
              }
              return THEME.brandName.replace(THEME.brandNameAccent, `<em style="color:${italicColor};">${THEME.brandNameAccent}</em>`)
            })()}
          </div>
          ${kickerHtml}
          <h1 style="margin:0;font-family:${THEME.fontBody};font-size:32px;font-weight:500;line-height:1.1;letter-spacing:-0.02em;color:${THEME.ink};">
            ${o.heading}
          </h1>
        </div>

        <!-- BODY (Cream, warm) -->
        <div class="content" style="padding:32px 36px;background:${THEME.surface};color:${THEME.ink};font-size:15px;line-height:1.65;">
          ${o.body}
        </div>

        <!-- FOOTER -->
        <div style="padding:20px 36px 26px;border-top:1px solid ${THEME.border};text-align:center;background:${THEME.surface};">
          <div style="font-size:12px;color:${THEME.inkMuted};">
            Powered by <a href="${THEME.poweredByUrl}" style="color:${THEME.ink};text-decoration:none;font-weight:500;">${THEME.poweredBy}</a>
            <span style="font-family:${THEME.fontAccent};font-style:italic;color:${THEME.primary};margin:0 4px;">·</span>
            ${THEME.tagline}
          </div>
        </div>

      </td>
    </tr>
  </table>
</div>
</body>
</html>`
}

// ============================================================
// BAUSTEINE
// ============================================================

function greeting(name: string): string {
  const first = (name || '').split(' ')[0] || name || 'du'
  return `<p style="margin:0 0 14px;font-size:17px;font-weight:500;color:${THEME.ink};">Hey ${esc(first)} <span style="font-family:${THEME.fontAccent};font-style:italic;font-weight:400;color:${THEME.primary};">·</span></p>`
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${THEME.ink};">${text}</p>`
}

function detailBox(rows: Array<{ label: string; value: string }>, opts: { accent?: 'primary' | 'sage' } = {}): string {
  const isSage = opts.accent === 'sage'
  const labelColor = isSage ? THEME.accentDeep : THEME.primary
  const bgColor = THEME.surface
  const dividerColor = isSage ? 'rgba(106,120,99,0.16)' : 'rgba(217,108,69,0.18)'
  const inner = rows.map((r, i) => {
    const isLast = i === rows.length - 1
    const border = isLast ? '' : `border-bottom:1px dashed ${dividerColor};`
    return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="${border}">
      <tr>
        <td style="padding:13px 0;width:120px;vertical-align:top;">
          <div style="font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${labelColor};">${esc(r.label)}</div>
        </td>
        <td style="padding:13px 0;vertical-align:top;text-align:right;">
          <div style="font-size:15px;font-weight:500;color:${THEME.ink};line-height:1.4;">${r.value}</div>
        </td>
      </tr>
    </table>`
  }).join('')
  return `
    <div style="background:${bgColor};border:1px solid ${THEME.border};border-radius:14px;padding:6px 22px;margin:22px 0;box-shadow:0 1px 2px rgba(31,29,24,0.04);">
      ${inner}
    </div>`
}

// Bulletproof button pattern: padding wird auf <td> gesetzt (bei Gmail zuverlässiger als auf <a>),
// plus bgcolor-Attribut (Outlook), font-Tag (Legacy/iOS Mail), span (Standard),
// mehrfache text-decoration:none Layers (Gmail strippt Inline-Styles).
function primaryButton(text: string, href: string): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:32px auto;border-collapse:separate;">
      <tr>
        <td align="center" bgcolor="${THEME.primary}" valign="middle" style="background:${THEME.primary};border-radius:999px;box-shadow:0 6px 18px rgba(217,108,69,0.28);padding:18px 52px;mso-padding-alt:18px 52px;">
          <a class="btn" href="${esc(href)}" target="_blank" style="display:inline-block;font-family:${THEME.fontBody};font-size:17px;font-weight:700;color:#ffffff;text-decoration:none;-webkit-text-decoration:none;letter-spacing:0.02em;line-height:1.2;min-width:200px;text-align:center;-webkit-text-fill-color:#ffffff;mso-line-height-rule:exactly;"><font color="#ffffff" style="color:#ffffff;text-decoration:none;"><span style="color:#ffffff;text-decoration:none;">${esc(text)}</span></font></a>
        </td>
      </tr>
    </table>`
}

function buttonPair(primary: { text: string; href: string }, secondary: { text: string; href: string }): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:28px auto;border-collapse:separate;">
      <tr>
        <td style="padding-right:12px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="${THEME.primary}" valign="middle" style="background:${THEME.primary};border-radius:999px;box-shadow:0 4px 12px rgba(217,108,69,0.24);padding:15px 32px;mso-padding-alt:15px 32px;">
            <a class="btn" href="${esc(primary.href)}" target="_blank" style="display:inline-block;font-family:${THEME.fontBody};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;-webkit-text-decoration:none;letter-spacing:0.02em;line-height:1.2;-webkit-text-fill-color:#ffffff;mso-line-height-rule:exactly;"><font color="#ffffff" style="color:#ffffff;text-decoration:none;"><span style="color:#ffffff;text-decoration:none;">${esc(primary.text)}</span></font></a>
          </td></tr></table>
        </td>
        <td>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="${THEME.bg}" valign="middle" style="background:${THEME.bg};border:1.5px solid ${THEME.borderStrong};border-radius:999px;padding:14px 30px;mso-padding-alt:14px 30px;">
            <a class="btn" href="${esc(secondary.href)}" target="_blank" style="display:inline-block;font-family:${THEME.fontBody};font-size:15px;font-weight:700;color:${THEME.ink};text-decoration:none;-webkit-text-decoration:none;letter-spacing:0.02em;line-height:1.2;-webkit-text-fill-color:${THEME.ink};mso-line-height-rule:exactly;"><font color="${THEME.ink}" style="color:${THEME.ink};text-decoration:none;"><span style="color:${THEME.ink};text-decoration:none;">${esc(secondary.text)}</span></font></a>
          </td></tr></table>
        </td>
      </tr>
    </table>`
}

// Sekundärer Outline-Button — für "Zum Portal" in Templates ohne anderen Haupt-CTA
function portalButton(href: string, text: string = 'Zum Portal'): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:24px auto 8px;border-collapse:separate;">
      <tr>
        <td align="center" bgcolor="${THEME.bg}" valign="middle" style="background:${THEME.bg};border:1.5px solid ${THEME.primary};border-radius:999px;padding:14px 32px;mso-padding-alt:14px 32px;">
          <a class="btn" href="${esc(href)}" target="_blank" style="display:inline-block;font-family:${THEME.fontBody};font-size:15px;font-weight:700;color:${THEME.ink};text-decoration:none;-webkit-text-decoration:none;letter-spacing:0.02em;line-height:1.2;-webkit-text-fill-color:${THEME.ink};mso-line-height-rule:exactly;"><font color="${THEME.ink}" style="color:${THEME.ink};text-decoration:none;"><span style="color:${THEME.ink};text-decoration:none;">${esc(text)} →</span></font></a>
        </td>
      </tr>
    </table>`
}

// Dezenter Link-Style — nur dort, wo bereits Haupt-Buttons existieren (z.B. Warteliste-Angebot)
function portalLink(href: string, text: string = 'Zum Portal'): string {
  return `
    <div style="text-align:center;margin:20px 0 6px;">
      <a class="btn" href="${esc(href)}" target="_blank" style="display:inline-block;font-family:${THEME.fontBody};font-size:14px;font-weight:600;color:${THEME.ink};text-decoration:none;-webkit-text-decoration:none;border-bottom:1.5px solid ${THEME.primary};padding-bottom:3px;letter-spacing:0.02em;-webkit-text-fill-color:${THEME.ink};"><font color="${THEME.ink}" style="color:${THEME.ink};text-decoration:none;"><span style="color:${THEME.ink};text-decoration:none;">${esc(text)} →</span></font></a>
    </div>`
}

// Kalender-Integration — Google + Apple/ICS
// Generiert zwei Links: Google Calendar Quick-Add und ein ICS-File-Endpoint
function calendarLinks(data: {
  title: string         // Kurs-Name
  description?: string
  location?: string
  startISO: string      // ISO 8601 — z.B. "2026-05-06T09:30:00+02:00"
  endISO: string
  icsUrl?: string       // Backend-Route die .ics liefert (optional, fallback Google-only)
}): string {
  // Google Calendar Quick-Add Format: YYYYMMDDTHHmmssZ
  const toGoogleDate = (iso: string) => {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  }
  const gDates = `${toGoogleDate(data.startISO)}/${toGoogleDate(data.endISO)}`
  const googleUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + '&text=' + encodeURIComponent(data.title)
    + '&dates=' + gDates
    + (data.description ? '&details=' + encodeURIComponent(data.description) : '')
    + (data.location ? '&location=' + encodeURIComponent(data.location) : '')

  const appleLink = data.icsUrl
    ? `<a href="${esc(data.icsUrl)}" style="color:${THEME.ink} !important;text-decoration:none !important;font-weight:600 !important;border-bottom:1px solid ${THEME.primary};padding-bottom:1px;"><span style="color:${THEME.ink};text-decoration:none;">Apple · Outlook (.ics)</span></a>`
    : ''
  const sep = data.icsUrl ? `<span style="color:${THEME.inkMuted};margin:0 10px;">·</span>` : ''

  return `
    <div style="text-align:center;margin:18px 0 6px;padding:14px 20px;background:${THEME.bg};border-radius:12px;">
      <div style="font-size:11px;font-weight:600;color:${THEME.inkMuted};letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">In deinen Kalender</div>
      <a href="${esc(googleUrl)}" style="color:${THEME.ink} !important;text-decoration:none !important;font-weight:600 !important;border-bottom:1px solid ${THEME.primary};padding-bottom:1px;font-size:13px;"><span style="color:${THEME.ink};text-decoration:none;">Google Calendar</span></a>
      ${sep}${appleLink}
    </div>`
}

function highlight(text: string, opts: { tone?: 'primary' | 'sage' | 'warning' } = {}): string {
  const bg = opts.tone === 'sage'
    ? 'rgba(168,182,163,0.2)'
    : opts.tone === 'warning'
      ? 'rgba(226,136,98,0.18)'
      : 'rgba(217,108,69,0.12)'
  const color = opts.tone === 'sage' ? THEME.accentDark : THEME.primary
  return `
    <div style="background:${bg};border-radius:10px;padding:12px 16px;margin:16px 0;font-size:14px;font-family:${THEME.fontAccent};font-style:italic;color:${color};">
      ${text}
    </div>`
}

function signoff(providerName: string): string {
  return `
    <div style="margin:28px 0 4px;">
      <p style="margin:0 0 2px;color:${THEME.ink};font-size:14px;">Bis bald,</p>
      <p style="margin:0;color:${THEME.inkMuted};font-family:${THEME.fontAccent};font-style:italic;font-size:18px;">dein Team von ${esc(providerName)}</p>
    </div>`
}

// ============================================================
// TEMPLATES
// ============================================================

export const EmailService = {
  async send(options: EmailOptions, retry = true): Promise<EmailResult> {
    // Provider-Branding auflösen: from-Display + Reply-To
    const opts: EmailOptions = { ...options }
    if (opts.brand) {
      if (!opts.from) {
        const fromHeader = _buildFromHeader(opts.brand)
        if (fromHeader) opts.from = fromHeader
      }
      if (!opts.replyTo && opts.brand.replyToEmail) {
        opts.replyTo = opts.brand.replyToEmail
      }
    }
    delete (opts as any).brand // brand-prop nicht an Resend weitergeben
    if (!retry) return emailProvider.send(opts)
    return sendWithRetry(() => emailProvider.send(opts), 3, `Email → ${opts.to}`)
  },

  // ------------------------------------------------------------
  // 1. Buchungsbestätigung
  // ------------------------------------------------------------
  async sendBookingConfirmation(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    date: string
    time: string
    providerName: string
    packageInfo?: string
    amount?: string
    portalUrl?: string
    calendar?: { startISO: string; endISO: string; location?: string; icsUrl?: string }
    branding?: ProviderBranding
    providerId?: string
  }): Promise<EmailResult> {
    const brand = await _resolveBranding({ branding: data.branding, providerId: data.providerId })
    const rows: Array<{ label: string; value: string }> = [
      { label: 'Kurs', value: esc(data.courseName) },
      { label: 'Teilnehmer', value: esc(data.childName) },
      { label: 'Termin', value: `${esc(fmtDateDE(data.date) || data.date)} · ${esc(data.time)} Uhr` },
      { label: 'Anbieter', value: esc(data.providerName) },
    ]
    if (data.packageInfo) rows.push({ label: 'Paket', value: esc(data.packageInfo) })
    if (data.amount) rows.push({ label: 'Preis', value: esc(data.amount) })

    const calendarBlock = data.calendar ? calendarLinks({
      title: `${data.courseName} — ${data.childName}`,
      description: `Kurs bei ${data.providerName}`,
      location: data.calendar.location,
      startISO: data.calendar.startISO,
      endISO: data.calendar.endISO,
      icsUrl: data.calendar.icsUrl,
    }) : ''

    return this.send({
      to,
      subject: `Buchung bestätigt — ${data.courseName}`,
      html: shell({
        preheader: `${data.childName} ist dabei bei ${data.courseName}.`,
        kicker: 'Buchung bestätigt',
        heading: `${esc(data.childName)} ist <em>dabei</em>.`,
        brand,
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`wir freuen uns — hier nochmal alles auf einen Blick:`)}
          ${detailBox(rows, { accent: 'primary' })}
          ${calendarBlock}
          ${paragraph(`Falls du mal nicht kannst, kein Stress: Sag rechtzeitig Bescheid und wir schauen nach einer Lösung.`)}
          ${data.portalUrl ? portalButton(data.portalUrl, 'Zu deinen Kursen') : ''}
          ${signoff(data.providerName)}
        `,
      }),
      text: `Hey ${data.parentName}! Buchung bestätigt: ${data.childName} für ${data.courseName} am ${data.date} um ${data.time} bei ${data.providerName}.${data.portalUrl ? ' Portal: ' + data.portalUrl : ''}`,
      brand,
    })
  },

  // ------------------------------------------------------------
  // 2. Rechnung
  // ------------------------------------------------------------
  async sendInvoice(to: string, data: {
    parentName: string
    invoiceNumber: string
    amount: string
    dueDate: string
    providerName: string
    courseName?: string
    childName?: string
    invoiceLink?: string
    branding?: ProviderBranding
    providerId?: string
  }): Promise<EmailResult> {
    const brand = await _resolveBranding({ branding: data.branding, providerId: data.providerId })
    const rows: Array<{ label: string; value: string }> = [
      { label: 'Rechnungsnummer', value: esc(data.invoiceNumber) },
      { label: 'Betrag', value: esc(data.amount) },
      { label: 'Fällig am', value: esc(data.dueDate) },
    ]
    if (data.childName) rows.push({ label: 'Teilnehmer', value: esc(data.childName) })
    if (data.courseName) rows.push({ label: 'Kurs', value: esc(data.courseName) })

    return this.send({
      to,
      subject: `Rechnung ${data.invoiceNumber} — ${data.providerName}`,
      html: shell({
        preheader: `Deine Rechnung über ${data.amount}.`,
        kicker: 'Deine Rechnung',
        heading: `Deine <em>Rechnung</em>.`,
        brand,
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`hier ist deine Rechnung bei <strong>${esc(data.providerName)}</strong>.`)}
          ${detailBox(rows, { accent: 'primary' })}
          ${data.invoiceLink ? primaryButton('Rechnung als PDF', data.invoiceLink) : ''}
          ${paragraph(`Bei Fragen wende dich direkt an ${esc(data.providerName)}.`)}
        `,
      }),
      text: `Hey ${data.parentName.split(' ')[0]}! Rechnung ${data.invoiceNumber} über ${data.amount} von ${data.providerName}. Fällig am ${data.dueDate}.${data.invoiceLink ? ' Link: ' + data.invoiceLink : ''}`,
      brand,
    })
  },

  // ------------------------------------------------------------
  // 3. Zahlungserinnerung
  // ------------------------------------------------------------
  async sendPaymentReminder(to: string, data: {
    parentName: string
    invoiceNumber: string
    amount: string
    providerName: string
    branding?: ProviderBranding
    providerId?: string
  }): Promise<EmailResult> {
    const brand = await _resolveBranding({ branding: data.branding, providerId: data.providerId })
    return this.send({
      to,
      subject: `Zahlungserinnerung — ${data.invoiceNumber}`,
      html: shell({
        preheader: `Rechnung ${data.invoiceNumber} ist noch offen.`,
        kicker: 'Kleiner Hinweis',
        heading: `Eine Zahlung ist noch <em>offen</em>.`,
        accent: 'sage',
        brand,
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`die Rechnung <strong>${esc(data.invoiceNumber)}</strong> über <strong>${esc(data.amount)}</strong> von ${esc(data.providerName)} wurde noch nicht beglichen.`)}
          ${highlight(`Bitte gleiche den Betrag zeitnah aus — wenn schon bezahlt, sieh diese Mail als Überschneidung.`, { tone: 'warning' })}
          ${paragraph(`Bei Fragen wende dich direkt an ${esc(data.providerName)}.`)}
        `,
      }),
      text: `Zahlungserinnerung: Rechnung ${data.invoiceNumber} über ${data.amount} von ${data.providerName} ist noch offen.`,
      brand,
    })
  },

  // ------------------------------------------------------------
  // 4. Probestunden-Erinnerung (Basic — legacy)
  // ------------------------------------------------------------
  async sendTrialReminder(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    date: string
    time: string
    branding?: ProviderBranding
    providerId?: string
  }): Promise<EmailResult> {
    const brand = await _resolveBranding({ branding: data.branding, providerId: data.providerId })
    return this.send({
      to,
      subject: `Erinnerung: Probestunde morgen — ${data.courseName}`,
      html: shell({
        preheader: `${data.childName} hat morgen Probestunde bei ${data.courseName}.`,
        kicker: 'Morgen',
        heading: `Probestunde <em>wartet</em>.`,
        brand,
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`kurze Erinnerung: <strong>${esc(data.childName)}</strong> hat morgen Probestunde.`)}
          ${detailBox([
            { label: 'Kurs', value: esc(data.courseName) },
            { label: 'Datum', value: esc(data.date) },
            { label: 'Uhrzeit', value: `${esc(data.time)} Uhr` },
          ])}
          ${paragraph(`Wir freuen uns auf euch.`)}
        `,
      }),
      text: `Erinnerung: ${data.childName} hat morgen um ${data.time} eine Probestunde bei "${data.courseName}".`,
      brand,
    }, false)
  },

  // ------------------------------------------------------------
  // 5. Warteliste-Angebot (zeitkritisch, 3h-Countdown)
  // ------------------------------------------------------------
  async sendWaitlistOffer(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    confirmLink: string
    declineLink: string
    portalUrl?: string
    branding?: ProviderBranding
    providerId?: string
  }): Promise<EmailResult> {
    const brand = await _resolveBranding({ branding: data.branding, providerId: data.providerId })
    return this.send({
      to,
      subject: `Platz frei — ${data.courseName}`,
      html: shell({
        preheader: `Ein Platz ist frei geworden. Du hast 3 Stunden zum Bestätigen.`,
        kicker: 'Zeitkritisch',
        heading: `Ein Platz ist <em>frei</em>.`,
        accent: 'primary',
        brand,
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`gute Nachricht: Ein Platz in <strong>${esc(data.courseName)}</strong> ist frei geworden — <strong>${esc(data.childName)}</strong> kann rein.`)}
          ${detailBox([
            { label: 'Kurs', value: esc(data.courseName) },
            { label: 'Anbieter', value: esc(data.providerName) },
            { label: 'Für', value: esc(data.childName) },
          ], { accent: 'primary' })}
          ${highlight(`Angebot läuft in <strong>3 Stunden</strong> ab. Danach geht der Platz an die nächste Person.`, { tone: 'warning' })}
          ${buttonPair(
            { text: 'Platz annehmen', href: data.confirmLink },
            { text: 'Ablehnen', href: data.declineLink }
          )}
          ${paragraph(`<span style="color:${THEME.inkMuted};font-size:13px;">Falls du nicht reagierst, geht der Platz automatisch an die nächste Person auf der Warteliste.</span>`)}
          ${data.portalUrl ? portalLink(data.portalUrl, 'Zu deinen Kursen') : ''}
        `,
      }),
      text: `Platz frei in "${data.courseName}" für ${data.childName}! Bestätigen: ${data.confirmLink} — Ablehnen: ${data.declineLink} — Angebot gültig für 3 Stunden.`,
      brand,
    })
  },

  // ------------------------------------------------------------
  // 6. Warteliste-Bestätigung
  // ------------------------------------------------------------
  async sendWaitlistConfirmation(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    portalUrl?: string
    branding?: ProviderBranding
    providerId?: string
  }): Promise<EmailResult> {
    const brand = await _resolveBranding({ branding: data.branding, providerId: data.providerId })
    return this.send({
      to,
      subject: `Warteliste — ${data.courseName}`,
      html: shell({
        preheader: `${data.childName} steht auf der Warteliste für ${data.courseName}.`,
        kicker: 'Status',
        heading: `Auf der <em>Warteliste</em>.`,
        accent: 'sage',
        brand,
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`vielen Dank fürs Eintragen — wir haben <strong>${esc(data.childName)}</strong> für <strong>${esc(data.courseName)}</strong> auf die Warteliste gesetzt.`)}
          ${detailBox([
            { label: 'Kurs', value: esc(data.courseName) },
            { label: 'Anbieter', value: esc(data.providerName) },
            { label: 'Für', value: esc(data.childName) },
          ], { accent: 'sage' })}
          ${paragraph(`Sobald ein Platz frei wird, bekommst du sofort eine Mail mit Bestätigungslink — dann hast du drei Stunden zum Zuschlagen.`)}
          ${data.portalUrl ? portalButton(data.portalUrl, 'Zu deinen Kursen') : ''}
          ${signoff(data.providerName)}
        `,
      }),
      text: `Hey ${data.parentName}! ${data.childName} steht jetzt auf der Warteliste für "${data.courseName}" bei ${data.providerName}. Sobald ein Platz frei wird, melden wir uns sofort.`,
      brand,
    })
  },

  // ------------------------------------------------------------
  // 7. Warteliste-Promotion (kurze Version, ohne Links)
  // ------------------------------------------------------------
  async sendWaitlistPromotion(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    deadlineHours: number
    branding?: ProviderBranding
    providerId?: string
  }): Promise<EmailResult> {
    const brand = await _resolveBranding({ branding: data.branding, providerId: data.providerId })
    return this.send({
      to,
      subject: `Platz frei — ${data.courseName}`,
      html: shell({
        preheader: `Ein Platz ist frei für ${data.childName}.`,
        kicker: 'Zeitkritisch',
        brand,
        heading: `Ein Platz ist <em>frei</em>.`,
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`ein Platz in <strong>${esc(data.courseName)}</strong> ist frei geworden — <strong>${esc(data.childName)}</strong> kann dabei sein.`)}
          ${highlight(`Bitte innerhalb von <strong>${data.deadlineHours} Stunden</strong> im Portal bestätigen.`, { tone: 'warning' })}
        `,
      }),
      text: `Platz frei in "${data.courseName}" für ${data.childName}. Bitte innerhalb von ${data.deadlineHours}h im Portal bestätigen.`,
      brand,
    }, false)
  },

  // ------------------------------------------------------------
  // 8. Probestunde Follow-up
  // ------------------------------------------------------------
  async sendTrialFollowUp(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    bookingUrl?: string
    branding?: ProviderBranding
    providerId?: string
  }): Promise<EmailResult> {
    const brand = await _resolveBranding({ branding: data.branding, providerId: data.providerId })
    return this.send({
      to,
      subject: `Wie war die Probestunde, ${data.parentName.split(' ')[0]}?`,
      html: shell({
        preheader: `Hat ${data.childName} Spaß gehabt?`,
        kicker: 'Kurzes Feedback',
        heading: `Wie war die <em>Probestunde</em>?`,
        accent: 'sage',
        brand,
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`<strong>${esc(data.childName)}</strong> war gestern bei <strong>${esc(data.courseName)}</strong> bei ${esc(data.providerName)}. Wir hoffen, es war schön.`)}
          ${paragraph(`Wenn's gepasst hat: Sichere dir jetzt einen festen Platz, bevor der Kurs voll ist.`)}
          ${data.bookingUrl ? primaryButton('Platz sichern', data.bookingUrl) : ''}
          ${paragraph(`<span style="color:${THEME.inkMuted};font-size:13px;">Falls es nicht gepasst hat — kein Problem. Wir haben viele andere Kurse, die vielleicht besser zu ${esc(data.childName)} passen.</span>`)}
          ${signoff(data.providerName)}
        `,
      }),
      text: `Hey ${data.parentName.split(' ')[0]}, wie war die Probestunde von ${data.childName} bei "${data.courseName}"? ${data.bookingUrl ? 'Platz sichern: ' + data.bookingUrl : ''}`,
      brand,
    }, false)
  },

  // ------------------------------------------------------------
  // 9. Probestunden-Erinnerung (branded)
  // ------------------------------------------------------------
  async sendTrialReminderBranded(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    trialDate: string
    trialTime: string
    branding?: ProviderBranding
    providerId?: string
  }): Promise<EmailResult> {
    const brand = await _resolveBranding({ branding: data.branding, providerId: data.providerId })
    return this.send({
      to,
      subject: `Erinnerung: Probestunde morgen — ${data.courseName}`,
      html: shell({
        preheader: `${data.childName} hat morgen Probestunde.`,
        kicker: 'Morgen',
        heading: `Probestunde <em>wartet</em>.`,
        brand,
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`kurze Erinnerung — <strong>${esc(data.childName)}</strong> hat morgen Probestunde.`)}
          ${detailBox([
            { label: 'Kurs', value: esc(data.courseName) },
            { label: 'Datum', value: esc(data.trialDate) },
            { label: 'Uhrzeit', value: `${esc(data.trialTime)} Uhr` },
            { label: 'Anbieter', value: esc(data.providerName) },
          ])}
          ${paragraph(`Bei Fragen melde dich gerne direkt bei ${esc(data.providerName)}.`)}
          ${signoff(data.providerName)}
        `,
      }),
      text: `Hey ${data.parentName}, Erinnerung: ${data.childName} hat morgen um ${data.trialTime} Uhr eine Probestunde bei "${data.courseName}" (${data.providerName}).`,
      brand,
    }, false)
  },

  // ------------------------------------------------------------
  // 10. Kurs-Erinnerung (24h vorher)
  // ------------------------------------------------------------
  async sendCourseReminder(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    courseDate: string
    courseTime: string
    location?: string
    portalUrl?: string
    calendar?: { startISO: string; endISO: string; icsUrl?: string }
    branding?: ProviderBranding
    providerId?: string
  }): Promise<EmailResult> {
    const brand = await _resolveBranding({ branding: data.branding, providerId: data.providerId })
    const rows: Array<{ label: string; value: string }> = [
      { label: 'Kurs', value: esc(data.courseName) },
      { label: 'Datum', value: esc(data.courseDate) },
      { label: 'Uhrzeit', value: `${esc(data.courseTime)} Uhr` },
      { label: 'Anbieter', value: esc(data.providerName) },
    ]
    if (data.location) rows.push({ label: 'Ort', value: esc(data.location) })

    const calendarBlock = data.calendar ? calendarLinks({
      title: `${data.courseName} — ${data.childName}`,
      description: `Kurs bei ${data.providerName}`,
      location: data.location,
      startISO: data.calendar.startISO,
      endISO: data.calendar.endISO,
      icsUrl: data.calendar.icsUrl,
    }) : ''

    return this.send({
      to,
      subject: `Morgen: ${data.courseName} um ${data.courseTime} Uhr`,
      html: shell({
        preheader: `${data.childName} hat morgen Kurs.`,
        kicker: 'Morgen',
        heading: `Morgen <em>geht's</em> los.`,
        brand,
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`kurze Erinnerung: <strong>${esc(data.childName)}</strong> hat morgen Kurs.`)}
          ${detailBox(rows)}
          ${calendarBlock}
          ${paragraph(`Wir freuen uns auf euch.`)}
          ${data.portalUrl ? portalButton(data.portalUrl, 'Zu deinen Kursen') : ''}
        `,
      }),
      text: `Hey ${data.parentName}, Erinnerung: ${data.childName} hat morgen um ${data.courseTime} Uhr "${data.courseName}" bei ${data.providerName}.${data.portalUrl ? ' Portal: ' + data.portalUrl : ''}`,
      brand,
    }, false)
  },

  // ------------------------------------------------------------
  // 11. Kurs-Einladung
  // ------------------------------------------------------------
  async sendCourseInvitation(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    scheduleText?: string
    ageText?: string
    priceText?: string
    descriptionText?: string
    bookingUrl: string
    couponCode?: string
    branding?: ProviderBranding
    providerId?: string
  }): Promise<EmailResult> {
    const brand = await _resolveBranding({ branding: data.branding, providerId: data.providerId })
    const couponBlock = data.couponCode ? `
      <div style="background:${THEME.bg};border:2px dashed ${THEME.primary};border-radius:12px;padding:16px 18px;margin:22px 0;text-align:center;">
        <div style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${THEME.inkMuted};">Dein Rabatt-Code</div>
        <div style="font-size:26px;font-weight:500;color:${THEME.primary};letter-spacing:0.1em;margin:6px 0;">${esc(data.couponCode)}</div>
        <div style="font-size:12px;color:${THEME.inkMuted};">Bei der Buchung eingeben.</div>
      </div>` : ''

    const detailRows: string[] = []
    if (data.scheduleText) detailRows.push(`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed rgba(217,108,69,0.12);"><span style="color:${THEME.inkMuted};font-size:12px;">Wann</span><span style="color:${THEME.ink};font-weight:500;font-size:13px;">${esc(data.scheduleText)}</span></div>`)
    if (data.ageText) detailRows.push(`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed rgba(217,108,69,0.12);"><span style="color:${THEME.inkMuted};font-size:12px;">Alter</span><span style="color:${THEME.ink};font-weight:500;font-size:13px;">${esc(data.ageText)}</span></div>`)
    if (data.priceText) detailRows.push(`<div style="display:flex;justify-content:space-between;padding:6px 0;"><span style="color:${THEME.inkMuted};font-size:12px;">Preis</span><span style="color:${THEME.ink};font-weight:500;font-size:13px;">${esc(data.priceText)}</span></div>`)
    const detailsBlock = detailRows.length ? `<div style="margin-top:10px;">${detailRows.join('')}</div>` : ''
    const descBlock = data.descriptionText ? `<div style="margin-top:12px;color:${THEME.inkMuted};font-size:13px;line-height:1.6;">${esc(data.descriptionText)}</div>` : ''
    const childLabel = data.childName && data.childName !== 'Ihr Kind' && data.childName !== 'Dein Kind' ? esc(data.childName) : 'dein Kind'

    return this.send({
      to,
      subject: `Neuer Kurs bei ${data.providerName}: ${data.courseName}`,
      html: shell({
        preheader: `Ein neuer Kurs, der gut zu ${childLabel} passen könnte.`,
        kicker: 'Neu verfügbar',
        heading: `Ein neuer <em>Kurs</em>.`,
        brand,
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`bei <strong>${esc(data.providerName)}</strong> startet ein Kurs, der gut zu <strong>${childLabel}</strong> passen könnte:`)}
          <div style="background:${THEME.surface};border:1px solid ${THEME.border};border-radius:14px;padding:18px 22px;margin:22px 0;box-shadow:0 1px 2px rgba(31,29,24,0.04);">
            <div style="font-family:${THEME.fontHeading || THEME.fontBody};font-size:22px;font-weight:700;color:${THEME.ink};letter-spacing:-0.01em;margin-bottom:4px;">${esc(data.courseName)}</div>
            ${detailsBlock}
            ${descBlock}
          </div>
          ${couponBlock}
          ${primaryButton('Platz sichern', data.bookingUrl)}
          ${paragraph(`<span style="color:${THEME.inkMuted};font-size:13px;">Plätze sind begrenzt. Falls dieser Kurs nichts für euch ist: einfach diese Mail ignorieren.</span>`)}
          ${signoff(data.providerName)}
        `,
      }),
      text: `Hey ${data.parentName}, bei ${data.providerName} startet ein Kurs, der gut zu ${data.childName} passen könnte: "${data.courseName}". ${[data.scheduleText, data.ageText, data.priceText].filter(Boolean).join(' · ')}. Jetzt buchen: ${data.bookingUrl}${data.couponCode ? ' · Rabatt-Code: ' + data.couponCode : ''}`,
      brand,
    }, false)
  },

  // ------------------------------------------------------------
  // 12. Stornierung
  // ------------------------------------------------------------
  // ------------------------------------------------------------
  // 12b. Kurs-Änderung (Provider hat den Kurs editiert)
  // ------------------------------------------------------------
  async sendCoursePause(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    note?: string
    portalUrl?: string
    branding?: ProviderBranding
    providerId?: string
  }): Promise<EmailResult> {
    const brand = await _resolveBranding({ branding: data.branding, providerId: data.providerId })
    return this.send({
      to,
      subject: `Kurze Pause: ${data.courseName}`,
      html: shell({
        preheader: `Wir machen mit ${data.courseName} kurz Pause — ${data.childName} bleibt eingebucht.`,
        kicker: 'Kurze Pause',
        heading: `Kurze <em>Pause</em>.`,
        accent: 'sage',
        brand,
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`wir machen mit <strong>${esc(data.courseName)}</strong> kurz Pause. ${esc(data.childName)} bleibt für später eingebucht — du musst nichts tun.`)}
          ${data.note ? paragraph(`Kurze Notiz: ${esc(data.note)}`) : ''}
          ${paragraph(`Sobald es wieder losgeht, hörst du von uns. Wenn etwas Dringendes ist: einfach kurz zurückschreiben.`)}
          ${data.portalUrl ? portalButton(data.portalUrl, 'Zu deinen Kursen') : ''}
          ${signoff(data.providerName)}
        `,
      }),
      text: `Hey ${data.parentName}, wir machen mit "${data.courseName}" kurz Pause. ${data.childName} bleibt für später eingebucht — sobald es wieder losgeht, melden wir uns.${data.note ? ' Notiz: ' + data.note : ''}`,
      brand,
    })
  },

  async sendCourseResume(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    nextSessionLabel?: string
    portalUrl?: string
    branding?: ProviderBranding
    providerId?: string
  }): Promise<EmailResult> {
    const brand = await _resolveBranding({ branding: data.branding, providerId: data.providerId })
    return this.send({
      to,
      subject: `${data.courseName} ist wieder da`,
      html: shell({
        preheader: `Wir sind zurück — ${data.courseName} läuft ab sofort wieder.`,
        kicker: 'Wieder da',
        heading: `Wir sind <em>zurück</em>.`,
        accent: 'primary',
        brand,
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`schön, dass es weitergeht. <strong>${esc(data.courseName)}</strong> läuft ab sofort wieder — wir freuen uns auf euch beide.`)}
          ${data.nextSessionLabel ? paragraph(`<strong>Nächster Termin:</strong> ${esc(data.nextSessionLabel)}`) : ''}
          ${data.portalUrl ? portalButton(data.portalUrl, 'Zu deinen Kursen') : ''}
          ${signoff(data.providerName)}
        `,
      }),
      text: `Hey ${data.parentName}, schön dass es weitergeht — "${data.courseName}" läuft ab sofort wieder.${data.nextSessionLabel ? ' Nächster Termin: ' + data.nextSessionLabel : ''}`,
      brand,
    })
  },

  async sendCourseUpdate(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    changes: Array<{ label: string; oldValue: string; newValue: string }>
    portalUrl?: string
    branding?: ProviderBranding
    providerId?: string
  }): Promise<EmailResult> {
    if (!data.changes || data.changes.length === 0) {
      return { success: true, messageId: 'noop-empty-changes' }
    }
    const brand = await _resolveBranding({ branding: data.branding, providerId: data.providerId })
    const changeRows = data.changes.map(c =>
      `<tr>
        <td style="padding:10px 0;border-bottom:1px dashed rgba(217,108,69,0.18);width:130px;vertical-align:top;">
          <div style="font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${THEME.primary};">${esc(c.label)}</div>
        </td>
        <td style="padding:10px 0;border-bottom:1px dashed rgba(217,108,69,0.18);vertical-align:top;">
          <div style="font-size:13px;color:${THEME.inkMuted};text-decoration:line-through;">${esc(c.oldValue || '—')}</div>
          <div style="font-size:15px;font-weight:600;color:${THEME.ink};margin-top:3px;">${esc(c.newValue || '—')}</div>
        </td>
      </tr>`
    ).join('')
    const changesBlock = `
      <div style="background:${THEME.surface};border:1px solid ${THEME.border};border-radius:14px;padding:6px 22px;margin:22px 0;box-shadow:0 1px 2px rgba(31,29,24,0.04);">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          ${changeRows}
        </table>
      </div>`

    return this.send({
      to,
      subject: `Hinweis: ${data.courseName} wurde aktualisiert`,
      html: shell({
        preheader: `${data.courseName} wurde von ${data.providerName} aktualisiert.`,
        kicker: 'Kurs aktualisiert',
        heading: `Es gibt eine <em>kleine Änderung</em>.`,
        accent: 'sage',
        brand,
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`<strong>${esc(data.providerName)}</strong> hat den Kurs <strong>${esc(data.courseName)}</strong> (Teilnahme: <strong>${esc(data.childName)}</strong>) angepasst. Hier auf einen Blick was sich geändert hat:`)}
          ${changesBlock}
          ${paragraph(`Falls eine Änderung für dich nicht passt, melde dich kurz bei ${esc(data.providerName)} — sie schauen mit dir nach einer Lösung.`)}
          ${data.portalUrl ? portalButton(data.portalUrl, 'Zu deinen Kursen') : ''}
          ${signoff(data.providerName)}
        `,
      }),
      text: `Hey ${data.parentName}, ${data.providerName} hat "${data.courseName}" angepasst. Änderungen: ` + data.changes.map(c => `${c.label}: ${c.oldValue} -> ${c.newValue}`).join('; '),
      brand,
    })
  },

  async sendCancellation(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    refundInfo?: string
    branding?: ProviderBranding
    providerId?: string
  }): Promise<EmailResult> {
    const brand = await _resolveBranding({ branding: data.branding, providerId: data.providerId })
    const refundBlock = data.refundInfo ? highlight(`<strong>Rückerstattung:</strong> ${esc(data.refundInfo)}`, { tone: 'sage' }) : ''

    return this.send({
      to,
      subject: `Stornierung — ${data.courseName}`,
      html: shell({
        preheader: `Die Buchung von ${data.childName} wurde storniert.`,
        kicker: 'Buchungsstatus',
        heading: `Buchung <em>storniert</em>.`,
        accent: 'sage',
        brand,
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`die Buchung von <strong>${esc(data.childName)}</strong> für <strong>${esc(data.courseName)}</strong> bei ${esc(data.providerName)} wurde storniert.`)}
          ${refundBlock}
          ${paragraph(`Bei Fragen melde dich direkt bei ${esc(data.providerName)}.`)}
          ${paragraph(`Wir hoffen, euch bald wiederzusehen.`)}
          ${signoff(data.providerName)}
        `,
      }),
      text: `Hey ${data.parentName}, die Buchung von ${data.childName} für "${data.courseName}" wurde storniert.${data.refundInfo ? ' ' + data.refundInfo : ''} Bei Fragen wende dich an ${data.providerName}.`,
      brand,
    })
  },

  // ------------------------------------------------------------
  // 12b. Provider-Nachricht (Postfach) → an Eltern
  // ------------------------------------------------------------
  async sendProviderMessage(to: string, data: {
    parentName: string
    providerName: string
    messageBody: string
    subject?: string
    portalUrl?: string
    branding?: ProviderBranding
    providerId?: string
  }): Promise<EmailResult> {
    const brand = await _resolveBranding({ branding: data.branding, providerId: data.providerId })
    const preview = (data.messageBody || '').slice(0, 160)
    const safeBody = esc(data.messageBody || '').replace(/\n/g, '<br>')
    const messageBlock = `
      <div style="background:${THEME.surface};border-left:3px solid ${THEME.primary};border-radius:8px;padding:18px 22px;margin:22px 0;font-size:15px;line-height:1.65;color:${THEME.ink};font-style:italic;">
        ${safeBody}
      </div>`
    return this.send({
      to,
      subject: data.subject || `Neue Nachricht von ${data.providerName}`,
      html: shell({
        preheader: preview,
        kicker: 'Nachricht',
        heading: `Neue <em>Nachricht</em>.`,
        brand,
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`<strong>${esc(data.providerName)}</strong> hat dir eine Nachricht geschickt:`)}
          ${messageBlock}
          ${paragraph(`Du kannst direkt im Portal antworten — alle Nachrichten landen dort gebündelt.`)}
          ${data.portalUrl ? primaryButton('Im Portal antworten', data.portalUrl) : ''}
          ${signoff(data.providerName)}
        `,
      }),
      text: `Hey ${(data.parentName || '').split(' ')[0]}, ${data.providerName} hat dir geschrieben:\n\n"${data.messageBody}"\n\nAntworte im Portal: ${data.portalUrl || ''}`,
      brand,
    })
  },

  // ------------------------------------------------------------
  // 13. Guthaben-Benachrichtigung (Credit erhalten)
  // ------------------------------------------------------------
  async sendCreditNotification(to: string, data: {
    parentName: string
    childName: string
    sessionDate: string
    validUntil: string
    providerName: string
    portalUrl?: string
    branding?: ProviderBranding
    providerId?: string
  }): Promise<EmailResult> {
    const brand = await _resolveBranding({ branding: data.branding, providerId: data.providerId })
    return this.send({
      to,
      subject: `Guthaben erhalten — ${data.childName}`,
      html: shell({
        preheader: `Ein Credit für einen Add-Up-Termin ist gutgeschrieben.`,
        kicker: 'Dein Guthaben',
        heading: `Guthaben <em>erhalten</em>.`,
        brand,
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`für den ausgefallenen Termin am <strong>${esc(data.sessionDate)}</strong> von <strong>${esc(data.childName)}</strong> bei ${esc(data.providerName)} haben wir dir einen Credit gutgeschrieben.`)}
          ${detailBox([
            { label: 'Guthaben', value: '1 Credit' },
            { label: 'Gültig bis', value: esc(data.validUntil) },
            { label: 'Einlösbar als', value: 'Add-Up-Termin in jedem passenden Kurs' },
          ], { accent: 'sage' })}
          ${data.portalUrl ? primaryButton('Jetzt Add-Up-Termin buchen', data.portalUrl) : paragraph(`Logg dich ins Portal ein, um einen Add-Up-Termin zu buchen.`)}
          ${signoff(data.providerName)}
        `,
      }),
      text: `Hallo ${data.parentName}, für den abgesagten Termin am ${data.sessionDate} für ${data.childName} bei ${data.providerName} hast du 1 Credit erhalten. Einlösbar als Add-Up-Termin. Gültig bis: ${data.validUntil}.`,
      brand,
    })
  },

  // ------------------------------------------------------------
  // 14. Welcome — nach erstem Login: App auf Homescreen
  // ------------------------------------------------------------
  async sendHomescreenGuide(to: string, data: {
    parentName: string
    providerName: string
    portalUrl: string
    branding?: ProviderBranding
    providerId?: string
  }): Promise<EmailResult> {
    const brand = await _resolveBranding({ branding: data.branding, providerId: data.providerId })
    return this.send({
      to,
      subject: `Willkommen, ${data.parentName.split(' ')[0]} — dein Bereich ist da`,
      html: shell({
        preheader: `Leg dir deinen Bereich aufs Handy, dann hast du alles mit einem Tipp.`,
        kicker: 'Willkommen',
        heading: `Dein <em>Bereich</em> wartet.`,
        brand,
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`schön, dass du dabei bist. In deinem Bereich findest du deine Kurse, Termine und Guthaben — alles auf einen Blick.`)}
          ${primaryButton('Zu meinem Bereich', data.portalUrl)}

          <div style="margin:28px 0 8px;padding:22px 24px;background:${THEME.bg};border-radius:14px;">
            <div style="font-size:11px;font-weight:600;color:${THEME.primary};letter-spacing:0.12em;text-transform:uppercase;margin-bottom:10px;">Tipp</div>
            <div style="font-size:17px;font-weight:500;color:${THEME.ink};letter-spacing:-0.01em;line-height:1.25;margin-bottom:14px;">
              Leg dir den Bereich wie eine <em style="color:${THEME.primary};">App</em> aufs Handy.
            </div>
            <p style="margin:0 0 10px;color:${THEME.ink};font-size:14px;line-height:1.6;">So hast du deine Kurse mit einem Tipp direkt griffbereit — ohne Website-Suche, ohne Bookmark-Chaos.</p>

            <div style="margin-top:16px;padding:14px 16px;background:${THEME.surface};border-radius:10px;border:1px solid ${THEME.border};">
              <div style="font-size:12px;font-weight:600;color:${THEME.inkMuted};letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">Auf dem iPhone</div>
              <div style="font-size:13px;color:${THEME.ink};line-height:1.6;">
                Öffne den Link in <strong>Safari</strong> → Tippe unten auf <strong>Teilen</strong> (das Quadrat mit Pfeil) → wähle <strong>„Zum Home-Bildschirm"</strong>.
              </div>
            </div>

            <div style="margin-top:10px;padding:14px 16px;background:${THEME.surface};border-radius:10px;border:1px solid ${THEME.border};">
              <div style="font-size:12px;font-weight:600;color:${THEME.inkMuted};letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">Auf Android</div>
              <div style="font-size:13px;color:${THEME.ink};line-height:1.6;">
                Öffne den Link in <strong>Chrome</strong> → Tippe oben rechts auf das <strong>Drei-Punkte-Menü</strong> → wähle <strong>„Zum Startbildschirm hinzufügen"</strong>.
              </div>
            </div>
          </div>

          ${paragraph(`<span style="color:${THEME.inkMuted};font-size:13px;">Du kannst außerdem deine Termine direkt in deinen Handy-Kalender übernehmen — einfach in der Buchungsbestätigung auf „Google Calendar" oder „Apple · Outlook" tippen.</span>`)}
          ${signoff(data.providerName)}
        `,
      }),
      text: `Hey ${data.parentName.split(' ')[0]}! Willkommen bei ${data.providerName}. Dein Bereich: ${data.portalUrl}. Tipp: Öffne den Link auf dem Handy und leg ihn als App auf den Homescreen (iPhone: Safari → Teilen → "Zum Home-Bildschirm"; Android: Chrome → Menü → "Zum Startbildschirm hinzufügen").`,
      brand,
    })
  },
}

// ============================================================
// PREVIEW HELPERS (für /email-preview Route)
// ============================================================

export const EmailPreview = {
  templates: [
    { id: 'homescreen-guide', name: 'Willkommen · App auf Homescreen', kind: 'parent' },
    { id: 'booking-confirmation', name: 'Buchungsbestätigung', kind: 'parent' },
    { id: 'invoice', name: 'Rechnung', kind: 'parent' },
    { id: 'payment-reminder', name: 'Zahlungserinnerung', kind: 'parent' },
    { id: 'trial-reminder', name: 'Probestunde-Erinnerung (basic)', kind: 'parent' },
    { id: 'waitlist-offer', name: 'Warteliste-Angebot (zeitkritisch)', kind: 'parent' },
    { id: 'waitlist-confirmation', name: 'Warteliste-Bestätigung', kind: 'parent' },
    { id: 'waitlist-promotion', name: 'Warteliste-Promotion (kurz)', kind: 'parent' },
    { id: 'trial-followup', name: 'Probestunde Follow-up', kind: 'parent' },
    { id: 'trial-reminder-branded', name: 'Probestunde-Erinnerung (branded)', kind: 'parent' },
    { id: 'course-reminder', name: 'Kurs-Erinnerung (24h vorher)', kind: 'parent' },
    { id: 'course-invitation', name: 'Kurs-Einladung', kind: 'parent' },
    { id: 'cancellation', name: 'Stornierung', kind: 'parent' },
    { id: 'credit-notification', name: 'Guthaben-Benachrichtigung', kind: 'parent' },
  ] as const,

  async render(id: string): Promise<{ subject: string; html: string } | null> {
    // Mock-Daten für Previews
    const dummy = {
      parentName: 'Anna Schmidt',
      childName: 'Mia',
      courseName: 'PEKiP Basis',
      providerName: 'Socialy',
      date: 'Mo, 6. Mai 2026',
      time: '09:30',
      invoiceNumber: '2026-0042',
      amount: '180,00 €',
      dueDate: '15.05.2026',
      trialDate: 'Do, 9. Mai 2026',
      trialTime: '15:30',
      courseDate: 'Mo, 6. Mai 2026',
      courseTime: '09:30',
      location: 'Socialy Space, Hamburg-Altona',
      sessionDate: '29.04.2026',
      validUntil: '08.07.2026',
      confirmLink: '#confirm',
      declineLink: '#decline',
      invoiceLink: '#invoice',
      bookingUrl: '#booking',
      courseDetails: 'Mittwochs um 15:30. 10 Termine à 45 Minuten. Perfekt für Kinder von 2 bis 4 Jahren, die sich gerne zu Musik bewegen.',
      couponCode: 'SOCIALY10',
      packageInfo: '10er-Block',
      refundInfo: '54,00 € werden innerhalb von 7 Tagen auf dein Konto zurückerstattet.',
      deadlineHours: 3,
      portalUrl: 'https://mein.socialy.club',
      calendarStartISO: '2026-05-06T09:30:00+02:00',
      calendarEndISO: '2026-05-06T10:30:00+02:00',
      icsUrl: 'https://mein.socialy.club/api/calendar/dummy.ics',
    }

    const interceptor = {
      calls: [] as Array<{ subject: string; html: string }>,
      send: async (opts: EmailOptions): Promise<EmailResult> => {
        interceptor.calls.push({ subject: opts.subject, html: opts.html })
        return { success: true, messageId: 'preview' }
      },
    }
    const realProvider = (emailProvider as any)
    const prevSend = realProvider.send.bind(realProvider)
    try {
      realProvider.send = interceptor.send

      switch (id) {
        case 'homescreen-guide':
          await EmailService.sendHomescreenGuide('preview@example.com', { parentName: dummy.parentName, providerName: dummy.providerName, portalUrl: dummy.portalUrl })
          break
        case 'booking-confirmation':
          await EmailService.sendBookingConfirmation('preview@example.com', { parentName: dummy.parentName, childName: dummy.childName, courseName: dummy.courseName, date: dummy.date, time: dummy.time, providerName: dummy.providerName, packageInfo: dummy.packageInfo, amount: dummy.amount, portalUrl: dummy.portalUrl, calendar: { startISO: dummy.calendarStartISO, endISO: dummy.calendarEndISO, location: dummy.location, icsUrl: dummy.icsUrl } })
          break
        case 'invoice':
          await EmailService.sendInvoice('preview@example.com', { parentName: dummy.parentName, invoiceNumber: dummy.invoiceNumber, amount: dummy.amount, dueDate: dummy.dueDate, providerName: dummy.providerName, courseName: dummy.courseName, childName: dummy.childName, invoiceLink: dummy.invoiceLink })
          break
        case 'payment-reminder':
          await EmailService.sendPaymentReminder('preview@example.com', { parentName: dummy.parentName, invoiceNumber: dummy.invoiceNumber, amount: dummy.amount, providerName: dummy.providerName })
          break
        case 'trial-reminder':
          await EmailService.sendTrialReminder('preview@example.com', { parentName: dummy.parentName, childName: dummy.childName, courseName: dummy.courseName, date: dummy.trialDate, time: dummy.trialTime })
          break
        case 'waitlist-offer':
          await EmailService.sendWaitlistOffer('preview@example.com', { parentName: dummy.parentName, childName: dummy.childName, courseName: dummy.courseName, providerName: dummy.providerName, confirmLink: dummy.confirmLink, declineLink: dummy.declineLink, portalUrl: dummy.portalUrl })
          break
        case 'waitlist-confirmation':
          await EmailService.sendWaitlistConfirmation('preview@example.com', { parentName: dummy.parentName, childName: dummy.childName, courseName: dummy.courseName, providerName: dummy.providerName, portalUrl: dummy.portalUrl })
          break
        case 'waitlist-promotion':
          await EmailService.sendWaitlistPromotion('preview@example.com', { parentName: dummy.parentName, childName: dummy.childName, courseName: dummy.courseName, deadlineHours: dummy.deadlineHours })
          break
        case 'trial-followup':
          await EmailService.sendTrialFollowUp('preview@example.com', { parentName: dummy.parentName, childName: dummy.childName, courseName: dummy.courseName, providerName: dummy.providerName, bookingUrl: dummy.bookingUrl })
          break
        case 'trial-reminder-branded':
          await EmailService.sendTrialReminderBranded('preview@example.com', { parentName: dummy.parentName, childName: dummy.childName, courseName: dummy.courseName, providerName: dummy.providerName, trialDate: dummy.trialDate, trialTime: dummy.trialTime })
          break
        case 'course-reminder':
          await EmailService.sendCourseReminder('preview@example.com', { parentName: dummy.parentName, childName: dummy.childName, courseName: dummy.courseName, providerName: dummy.providerName, courseDate: dummy.courseDate, courseTime: dummy.courseTime, location: dummy.location, portalUrl: dummy.portalUrl, calendar: { startISO: dummy.calendarStartISO, endISO: dummy.calendarEndISO, icsUrl: dummy.icsUrl } })
          break
        case 'course-invitation':
          await EmailService.sendCourseInvitation('preview@example.com', { parentName: dummy.parentName, childName: dummy.childName, courseName: 'Musikgarten', providerName: dummy.providerName, courseDetails: dummy.courseDetails, bookingUrl: dummy.bookingUrl, couponCode: dummy.couponCode })
          break
        case 'cancellation':
          await EmailService.sendCancellation('preview@example.com', { parentName: dummy.parentName, childName: dummy.childName, courseName: dummy.courseName, providerName: dummy.providerName, refundInfo: dummy.refundInfo })
          break
        case 'credit-notification':
          await EmailService.sendCreditNotification('preview@example.com', { parentName: dummy.parentName, childName: dummy.childName, sessionDate: dummy.sessionDate, validUntil: dummy.validUntil, providerName: dummy.providerName, portalUrl: dummy.portalUrl })
          break
        default:
          return null
      }

      return interceptor.calls[0] ?? null
    } finally {
      realProvider.send = prevSend
    }
  },

  renderIndex(): string {
    const rows = EmailPreview.templates.map(t => `
      <li style="margin-bottom:6px;">
        <a href="/email-preview/${t.id}" style="color:${THEME.ink};text-decoration:none;font-weight:500;display:inline-block;padding:10px 14px;background:${THEME.surface};border:1px solid ${THEME.border};border-radius:10px;transition:border-color .2s;">
          ${esc(t.name)}
        </a>
      </li>`).join('')
    return `<!DOCTYPE html>
<html lang="de"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>E-Mail Previews — Socialy</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;500;600&family=Instrument+Serif:ital@1&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:32px 20px; font-family:${THEME.fontBody}; background:${THEME.bg}; color:${THEME.ink}; }
  .wrap { max-width:560px; margin:0 auto; }
  h1 { font-size:32px; font-weight:500; letter-spacing:-0.02em; margin:0 0 8px; }
  em { font-family:${THEME.fontAccent}; font-style:italic; font-weight:400; color:${THEME.primary}; }
  .sub { color:${THEME.inkMuted}; margin-bottom:32px; }
  ul { list-style:none; padding:0; margin:0; }
  a:hover { border-color:${THEME.borderStrong} !important; }
</style>
</head><body>
<div class="wrap">
  <h1>E-Mail <em>Previews</em></h1>
  <p class="sub">Alle 14 Socialy-Templates mit Dummy-Daten. Klick → HTML-Vorschau im Browser.</p>
  <ul>${rows}</ul>
</div>
</body></html>`
  },
}
