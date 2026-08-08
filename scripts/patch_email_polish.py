"""Polish email templates:
1. detailBox: 2-column row layout (label left, value right) with subtle dashed
   dividers between rows, no harsh left-border, gentle drop-shadow.
2. greeting: friendlier opener, slightly larger and warmer.
3. signoff: cleaner two-line signoff without italic 'Dein Team von'.
4. shell hero: tighter heading sizing + brand mark refinement (Socialy mit
   serif-Italic auf 'aly' bleibt, but kleiner, ruhiger).
5. paragraph: line-height anhebung for readability.
"""

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/lib/email.ts'
src = open(p, 'r', encoding='utf-8').read()

# ----------- detailBox: refined 2-column layout -----------
old_box = """function detailBox(rows: Array<{ label: string; value: string }>, opts: { accent?: 'primary' | 'sage' } = {}): string {
  const isSage = opts.accent === 'sage'
  const borderColor = isSage ? THEME.accentDeep : THEME.primary
  const bgColor = isSage ? '#EDF1EA' : '#FDECE0'
  const labelColor = isSage ? THEME.accentDark : THEME.primary
  const inner = rows.map((r, i) => {
    const mb = i === rows.length - 1 ? '0' : '12px'
    return `
    <div style="margin-bottom:${mb};">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${labelColor};">${esc(r.label)}</div>
      <div style="font-size:15px;font-weight:500;color:${THEME.ink};margin-top:3px;">${r.value}</div>
    </div>`
  }).join('')
  return `
    <div style="background:${bgColor};border-left:4px solid ${borderColor};border-radius:12px;padding:20px 22px;margin:22px 0;">
      ${inner}
    </div>`
}"""

new_box = """function detailBox(rows: Array<{ label: string; value: string }>, opts: { accent?: 'primary' | 'sage' } = {}): string {
  const isSage = opts.accent === 'sage'
  const labelColor = isSage ? THEME.accentDeep : THEME.primary
  const bgColor = THEME.surface
  const dividerColor = isSage ? 'rgba(106,120,99,0.16)' : 'rgba(217,108,69,0.18)'
  const inner = rows.map((r, i) => {
    const isLast = i === rows.length - 1
    const border = isLast ? '' : `border-bottom:1px dashed ${dividerColor};`
    return `
    <table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" width=\"100%\" style=\"${border}\">
      <tr>
        <td style=\"padding:13px 0;width:120px;vertical-align:top;\">
          <div style=\"font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${labelColor};\">${esc(r.label)}</div>
        </td>
        <td style=\"padding:13px 0;vertical-align:top;text-align:right;\">
          <div style=\"font-size:15px;font-weight:500;color:${THEME.ink};line-height:1.4;\">${r.value}</div>
        </td>
      </tr>
    </table>`
  }).join('')
  return `
    <div style=\"background:${bgColor};border:1px solid ${THEME.border};border-radius:14px;padding:6px 22px;margin:22px 0;box-shadow:0 1px 2px rgba(31,29,24,0.04);\">
      ${inner}
    </div>`
}"""

if old_box not in src:
    print('FAIL: detailBox anchor not found'); exit(1)
src = src.replace(old_box, new_box, 1)

# ----------- greeting: warmer, slightly larger -----------
old_greeting = """function greeting(name: string): string {
  const first = (name || '').split(' ')[0] || name || 'du'
  return `<p style=\"margin:0 0 18px;font-size:16px;\">Hey ${esc(first)},</p>`
}"""

new_greeting = """function greeting(name: string): string {
  const first = (name || '').split(' ')[0] || name || 'du'
  return `<p style=\"margin:0 0 14px;font-size:17px;font-weight:500;color:${THEME.ink};\">Hey ${esc(first)} <span style=\"font-family:${THEME.fontAccent};font-style:italic;font-weight:400;color:${THEME.primary};\">·</span></p>`
}"""

if old_greeting not in src:
    print('FAIL: greeting anchor not found'); exit(1)
src = src.replace(old_greeting, new_greeting, 1)

# ----------- signoff: cleaner two-line -----------
old_signoff = """function signoff(providerName: string): string {
  return `
    <p style=\"margin:24px 0 4px;color:${THEME.inkMuted};font-family:${THEME.fontAccent};font-style:italic;\">
      Dein Team von ${esc(providerName)}
    </p>`
}"""

new_signoff = """function signoff(providerName: string): string {
  return `
    <div style=\"margin:28px 0 4px;\">
      <p style=\"margin:0 0 2px;color:${THEME.ink};font-size:14px;\">Bis bald,</p>
      <p style=\"margin:0;color:${THEME.inkMuted};font-family:${THEME.fontAccent};font-style:italic;font-size:18px;\">dein Team von ${esc(providerName)}</p>
    </div>`
}"""

if old_signoff not in src:
    print('FAIL: signoff anchor not found'); exit(1)
src = src.replace(old_signoff, new_signoff, 1)

# ----------- paragraph: line-height + spacing -----------
old_paragraph = """function paragraph(text: string): string {
  return `<p style=\"margin:0 0 16px;\">${text}</p>`
}"""

new_paragraph = """function paragraph(text: string): string {
  return `<p style=\"margin:0 0 16px;font-size:15px;line-height:1.65;color:${THEME.ink};\">${text}</p>`
}"""

if old_paragraph not in src:
    print('FAIL: paragraph anchor not found'); exit(1)
src = src.replace(old_paragraph, new_paragraph, 1)

open(p, 'w', encoding='utf-8').write(src)
print('OK: email templates polished (detailBox, greeting, signoff, paragraph)')
