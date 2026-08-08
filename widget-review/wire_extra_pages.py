#!/usr/bin/env python3
"""
Wire 6 new V2 preview routes (postfach, ki-assistent, integrationen, raeume, credits, anwesenheit)
into server.ts. Also extends dashboard-ui.js sidebar nav.
"""
from pathlib import Path

SERVER_TS = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/api/server.ts")
DASHBOARD_UI = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/frontend/dashboard-ui.js")

server = SERVER_TS.read_text(encoding="utf-8")

# Anchor: existing kurs-anlegen-preview route
anchor = """  if (path === '/kurs-anlegen-preview' || path === '/kurs-anlegen-preview/') {"""

# Find existing route for kurs-anlegen as template
NEW_ROUTES = []
for slug in ["postfach", "ki-assistent", "integrationen", "raeume", "credits", "anwesenheit"]:
    NEW_ROUTES.append(f"""  if (path === '/{slug}-preview' || path === '/{slug}-preview/') {{
    try {{
      const html = readFileSync(resolve(__dirname, '../widgets/{slug}-preview.html'), 'utf-8')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.statusCode = 200
      res.end(html)
    }} catch (err) {{
      res.statusCode = 500
      res.end('{slug} preview error')
    }}
    return
  }}

""")

new_block = "".join(NEW_ROUTES) + anchor

skipped = []
for slug in ["postfach", "ki-assistent", "integrationen", "raeume", "credits", "anwesenheit"]:
    if f"/{slug}-preview" in server:
        skipped.append(slug)

if skipped:
    print(f"- already wired (skipped): {skipped}")

if anchor in server and not all(s in skipped for s in ["postfach", "ki-assistent", "integrationen", "raeume", "credits", "anwesenheit"]):
    if all(f"/{slug}-preview" not in server for slug in ["postfach", "ki-assistent", "integrationen", "raeume", "credits", "anwesenheit"]):
        server = server.replace(anchor, new_block, 1)
        SERVER_TS.write_text(server, encoding="utf-8")
        print("OK server.ts: 6 new routes wired before kurs-anlegen-preview")
    else:
        print("- mixed state, manual review needed")
else:
    print("- anchor not found OR all already wired")

# ============================================================
# Extend dashboard-ui.js sidebar with auto-injection of new items
# ============================================================
ui = DASHBOARD_UI.read_text(encoding="utf-8")

INJECT_MARK = "// V2_SIDEBAR_EXTRA_NAV"
sidebar_block = """
// V2_SIDEBAR_EXTRA_NAV — adds new sections to existing sidebars without editing HTML
;(function(){
  const NEW_GROUPS = {
    'Menschen': [{ label: 'Postfach', href: '/postfach-preview', badge: '3' }],
    'Finanzen': [{ label: 'Credits', href: '/credits-preview' }],
    'Tools': [
      { label: 'Anwesenheit', href: '/anwesenheit-preview', insertBefore: 'Ferien' },
      { label: 'Räume', href: '/raeume-preview', insertBefore: 'Ferien' },
      { label: 'KI-Assistent', href: '/ki-assistent-preview', badge: 'PRO', insertBefore: 'Einstellungen' },
      { label: 'Integrationen', href: '/integrationen-preview', insertBefore: 'Einstellungen' },
    ]
  }
  function inject() {
    const nav = document.querySelector('.sidebar-nav')
    if (!nav) return
    if (nav.dataset.v2Extra === '1') return
    nav.dataset.v2Extra = '1'

    const groups = nav.querySelectorAll('.nav-group')
    const groupMap = {}
    groups.forEach(g => {
      const lbl = g.querySelector('.nav-group-label')
      if (lbl) groupMap[lbl.textContent.trim()] = g
    })

    Object.entries(NEW_GROUPS).forEach(([groupName, items]) => {
      const target = groupMap[groupName]
      if (!target) return
      const existingItems = Array.from(target.querySelectorAll('.nav-item')).map(b => b.textContent.toLowerCase())
      items.forEach(it => {
        const itemKey = it.label.toLowerCase()
        if (existingItems.some(e => e.includes(itemKey.replace('ä','a')))) return // already there

        const btn = document.createElement('button')
        btn.className = 'nav-item'
        if (window.location.pathname.startsWith(it.href)) btn.classList.add('active')
        btn.onclick = () => { window.location.href = it.href }
        btn.textContent = it.label
        if (it.badge) {
          const sp = document.createElement('span')
          sp.className = 'badge'
          sp.textContent = it.badge
          btn.appendChild(document.createTextNode(' '))
          btn.appendChild(sp)
        }
        // insertBefore an existing item if specified
        let inserted = false
        if (it.insertBefore) {
          const items = target.querySelectorAll('.nav-item')
          for (const ex of items) {
            if (ex.textContent.toLowerCase().includes(it.insertBefore.toLowerCase())) {
              target.insertBefore(btn, ex)
              inserted = true
              break
            }
          }
        }
        if (!inserted) target.appendChild(btn)
      })
    })
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject)
  } else {
    inject()
  }
})()
"""

if INJECT_MARK in ui:
    print("- dashboard-ui.js already has V2_SIDEBAR_EXTRA_NAV")
else:
    ui = ui.rstrip() + "\n\n" + sidebar_block + "\n"
    DASHBOARD_UI.write_text(ui, encoding="utf-8")
    print("OK dashboard-ui.js: sidebar extension appended")
