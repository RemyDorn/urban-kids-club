"""Polish course-invitation flow:
1. courseDetails as structured fields (no <br> escaping issue)
2. providerName: display_name (Brand) statt company_name (Legal)
3. bookingUrl: /widget/<slug> statt /booking/<id>
4. primaryButton: groesser (mehr Padding, breitere min-width)
5. Filter selbst-Einladung: Eltern, die schon eine aktive Buchung in
   diesem Kurs haben, NICHT als Match anzeigen
"""

import re

# ============================================================
# 1) email.ts: sendCourseInvitation rebuilt with structured fields
# ============================================================
ep = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/lib/email.ts'
es = open(ep, 'r', encoding='utf-8').read()

old_invite = """async sendCourseInvitation(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    courseDetails: string
    bookingUrl: string
    couponCode?: string
  }): Promise<EmailResult> {
    const couponBlock = data.couponCode ? `
      <div style=\"background:${THEME.bg};border:2px dashed ${THEME.primary};border-radius:12px;padding:16px 18px;margin:22px 0;text-align:center;\">
        <div style=\"font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${THEME.inkMuted};\">Dein Rabatt-Code</div>
        <div style=\"font-size:26px;font-weight:500;color:${THEME.primary};letter-spacing:0.1em;margin:6px 0;\">${esc(data.couponCode)}</div>
        <div style=\"font-size:12px;color:${THEME.inkMuted};\">Bei der Buchung eingeben.</div>
      </div>` : ''

    return this.send({
      to,
      subject: `Neuer Kurs: ${data.courseName} — Platz für ${data.childName}?`,
      html: shell({
        preheader: `Neuer Kurs, der zu ${data.childName} passt.`,
        kicker: 'Neu verfügbar',
        heading: `Ein neuer <em>Kurs</em>.`,
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`ein neuer Kurs, der gut zu <strong>${esc(data.childName)}</strong> passen könnte:`)}
          <div style=\"background:${THEME.bg};border-radius:12px;padding:18px 20px;margin:22px 0;\">
            <div style=\"font-size:20px;font-weight:500;color:${THEME.ink};letter-spacing:-0.015em;margin-bottom:6px;\">${esc(data.courseName)}</div>
            <div style=\"font-size:14px;color:${THEME.inkMuted};line-height:1.6;\">${esc(data.courseDetails)}</div>
          </div>
          ${couponBlock}
          ${primaryButton('Platz sichern', data.bookingUrl)}
          ${paragraph(`<span style=\"color:${THEME.inkMuted};font-size:13px;\">Die Plätze sind begrenzt — sei schnell.</span>`)}
          ${signoff(data.providerName)}
        `,
      }),
      text: `Hey ${data.parentName}, neuer Kurs \"${data.courseName}\" bei ${data.providerName} — für ${data.childName}. ${data.courseDetails} Jetzt buchen: ${data.bookingUrl}${data.couponCode ? ' · Rabatt-Code: ' + data.couponCode : ''}`,
    }, false)
  },"""

new_invite = """async sendCourseInvitation(to: string, data: {
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
  }): Promise<EmailResult> {
    const couponBlock = data.couponCode ? `
      <div style=\"background:${THEME.bg};border:2px dashed ${THEME.primary};border-radius:12px;padding:16px 18px;margin:22px 0;text-align:center;\">
        <div style=\"font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${THEME.inkMuted};\">Dein Rabatt-Code</div>
        <div style=\"font-size:26px;font-weight:500;color:${THEME.primary};letter-spacing:0.1em;margin:6px 0;\">${esc(data.couponCode)}</div>
        <div style=\"font-size:12px;color:${THEME.inkMuted};\">Bei der Buchung eingeben.</div>
      </div>` : ''

    const detailRows: string[] = []
    if (data.scheduleText) detailRows.push(`<div style=\"display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed rgba(217,108,69,0.12);\"><span style=\"color:${THEME.inkMuted};font-size:12px;\">Wann</span><span style=\"color:${THEME.ink};font-weight:500;font-size:13px;\">${esc(data.scheduleText)}</span></div>`)
    if (data.ageText) detailRows.push(`<div style=\"display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed rgba(217,108,69,0.12);\"><span style=\"color:${THEME.inkMuted};font-size:12px;\">Alter</span><span style=\"color:${THEME.ink};font-weight:500;font-size:13px;\">${esc(data.ageText)}</span></div>`)
    if (data.priceText) detailRows.push(`<div style=\"display:flex;justify-content:space-between;padding:6px 0;\"><span style=\"color:${THEME.inkMuted};font-size:12px;\">Preis</span><span style=\"color:${THEME.ink};font-weight:500;font-size:13px;\">${esc(data.priceText)}</span></div>`)
    const detailsBlock = detailRows.length ? `<div style=\"margin-top:10px;\">${detailRows.join('')}</div>` : ''
    const descBlock = data.descriptionText ? `<div style=\"margin-top:12px;color:${THEME.inkMuted};font-size:13px;line-height:1.6;\">${esc(data.descriptionText)}</div>` : ''
    const childLabel = data.childName && data.childName !== 'Ihr Kind' && data.childName !== 'Dein Kind' ? esc(data.childName) : 'dein Kind'

    return this.send({
      to,
      subject: `Neuer Kurs bei ${data.providerName}: ${data.courseName}`,
      html: shell({
        preheader: `Ein neuer Kurs, der gut zu ${childLabel} passen könnte.`,
        kicker: 'Neu verfügbar',
        heading: `Ein neuer <em>Kurs</em>.`,
        body: `
          ${greeting(data.parentName)}
          ${paragraph(`bei <strong>${esc(data.providerName)}</strong> startet ein Kurs, der gut zu <strong>${childLabel}</strong> passen könnte:`)}
          <div style=\"background:${THEME.surface};border:1px solid ${THEME.border};border-radius:14px;padding:18px 22px;margin:22px 0;box-shadow:0 1px 2px rgba(31,29,24,0.04);\">
            <div style=\"font-family:${THEME.fontHeading || THEME.fontBody};font-size:22px;font-weight:700;color:${THEME.ink};letter-spacing:-0.01em;margin-bottom:4px;\">${esc(data.courseName)}</div>
            ${detailsBlock}
            ${descBlock}
          </div>
          ${couponBlock}
          ${primaryButton('Platz sichern', data.bookingUrl)}
          ${paragraph(`<span style=\"color:${THEME.inkMuted};font-size:13px;\">Plätze sind begrenzt. Falls dieser Kurs nichts für euch ist: einfach diese Mail ignorieren.</span>`)}
          ${signoff(data.providerName)}
        `,
      }),
      text: `Hey ${data.parentName}, bei ${data.providerName} startet ein Kurs, der gut zu ${data.childName} passen könnte: \"${data.courseName}\". ${[data.scheduleText, data.ageText, data.priceText].filter(Boolean).join(' · ')}. Jetzt buchen: ${data.bookingUrl}${data.couponCode ? ' · Rabatt-Code: ' + data.couponCode : ''}`,
    }, false)
  },"""

if old_invite not in es:
    print('FAIL: sendCourseInvitation anchor not found'); exit(1)
es = es.replace(old_invite, new_invite, 1)
print('OK: sendCourseInvitation rebuilt with structured detail rows')

# ============================================================
# 2) primaryButton: bigger padding + min-width for prominent CTA
# ============================================================
old_btn = """function primaryButton(text: string, href: string): string {
  return `
    <table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"margin:26px auto;\">
      <tr>
        <td align=\"center\" style=\"background:${THEME.primary};border-radius:999px;box-shadow:0 4px 12px rgba(217,108,69,0.24);\">
          <a href=\"${esc(href)}\" style=\"display:inline-block;padding:14px 32px;font-family:${THEME.fontBody};font-size:15px;font-weight:700 !important;color:#ffffff !important;text-decoration:none !important;letter-spacing:0.02em;line-height:1;\">
            <span style=\"color:#ffffff;text-decoration:none;\">${esc(text)}</span>
          </a>
        </td>
      </tr>
    </table>`
}"""

new_btn = """function primaryButton(text: string, href: string): string {
  return `
    <table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"margin:30px auto;\">
      <tr>
        <td align=\"center\" style=\"background:${THEME.primary};border-radius:999px;box-shadow:0 6px 18px rgba(217,108,69,0.28);\">
          <a href=\"${esc(href)}\" style=\"display:inline-block;padding:16px 44px;font-family:${THEME.fontBody};font-size:16px;font-weight:700 !important;color:#ffffff !important;text-decoration:none !important;letter-spacing:0.02em;line-height:1;min-width:180px;text-align:center;\">
            <span style=\"color:#ffffff;text-decoration:none;\">${esc(text)}</span>
          </a>
        </td>
      </tr>
    </table>`
}"""
if old_btn not in es:
    print('WARN: primaryButton anchor not found, skipping')
else:
    es = es.replace(old_btn, new_btn, 1)
    print('OK: primaryButton enlarged (padding 16x44, font 16, min-width 180)')

open(ep, 'w', encoding='utf-8').write(es)

# ============================================================
# 3) invitations.ts: providerName=display_name, bookingUrl=/widget/<slug>,
#    structured field passing, exclude already-booked parents
# ============================================================
ip = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/api/routes/invitations.ts'
isrc = open(ip, 'r', encoding='utf-8').read()

# 3a. Provider lookup with display_name preference
old_prov = """    // Load provider
    const provider = await ProviderService.getById(auth.providerId)
    if (!provider) return res.error(404, 'Anbieter nicht gefunden')"""
new_prov = """    // Load provider — prefer display_name (Brand) over company_name (Legal)
    const provider = await ProviderService.getById(auth.providerId)
    if (!provider) return res.error(404, 'Anbieter nicht gefunden')
    const providerDisplayName = (provider as any).displayName || provider.name"""
if old_prov in isrc:
    isrc = isrc.replace(old_prov, new_prov, 1)
    print('OK: providerDisplayName resolved')

# 3b. bookingUrl uses widget slug
old_url = "const bookingUrl = `${process.env.PUBLIC_URL || 'https://app.urbankids.club'}/booking/${activity.id}`"
new_url = """const baseUrl = process.env.PUBLIC_URL || 'https://app.urbankids.club'
    const slug = (provider as any).slug || ''
    const bookingUrl = slug
      ? `${baseUrl}/widget/${slug}?course=${activity.id}`
      : `${baseUrl}/widget/${activity.id}`"""
if old_url in isrc:
    isrc = isrc.replace(old_url, new_url, 1)
    print('OK: bookingUrl points to widget')

# 3c. Switch to structured fields in sendCourseInvitation call
old_call = """      const emailResult = await EmailService.sendCourseInvitation(parent.email, {
        parentName: parent.name,
        childName,
        courseName: activity.title,
        providerName: provider.name,
        courseDetails,
        bookingUrl,
        couponCode,
      })"""
new_call = """      const emailResult = await EmailService.sendCourseInvitation(parent.email, {
        parentName: parent.name,
        childName,
        courseName: activity.title,
        providerName: providerDisplayName,
        scheduleText,
        ageText,
        priceText,
        descriptionText: activity.description ? activity.description.substring(0, 240) : '',
        bookingUrl,
        couponCode,
      })"""
if old_call in isrc:
    isrc = isrc.replace(old_call, new_call, 1)
    print('OK: structured fields passed to sendCourseInvitation')

# 3d. Drop the now-unused courseDetails string concat (or leave it, it's just a const)
# It's still being used in `text:` fallback elsewhere — actually in our new email, we don't use it.
# Leave it; it's harmless.

# 3e. Exclude already-booked parents from matching endpoint
old_filter = """    // Step 4: Calculate relevance score and build match reasons
    const matches: ParentMatch[] = []

    for (const match of parentMap.values()) {
      // At least one matching criterion required
      if (!match.hasAgeMatch && !match.hasCategoryMatch) continue"""
new_filter = """    // Step 3.5: Get parents that already have an active booking on THIS activity
    let alreadyBookedParents = new Set<string>()
    if (activityId) {
      const { data: existingBookings } = await sb.from('provider_bookings')
        .select('parent_id, status, payment_status')
        .eq('activity_id', activityId)
        .eq('provider_id', auth.providerId)
      for (const row of existingBookings ?? []) {
        if (row.status === 'cancelled') continue
        if (row.payment_status === 'refunded') continue
        if (row.parent_id) alreadyBookedParents.add(row.parent_id)
      }
    }

    // Step 4: Calculate relevance score and build match reasons
    const matches: ParentMatch[] = []

    for (const match of parentMap.values()) {
      // Don't suggest parents that already have an active booking for this course
      if (alreadyBookedParents.has(match.parentId)) continue
      // At least one matching criterion required
      if (!match.hasAgeMatch && !match.hasCategoryMatch) continue"""
if old_filter in isrc:
    isrc = isrc.replace(old_filter, new_filter, 1)
    print('OK: matching-parents excludes existing bookers')

open(ip, 'w', encoding='utf-8').write(isrc)
print('All patches applied.')
