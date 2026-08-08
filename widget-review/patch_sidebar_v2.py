#!/usr/bin/env python3
"""
Patch dashboard-ui.js:
  - Replace buggy V2_SIDEBAR_EXTRA_NAV block with fixed version
    (data-sidebar-mode skip, umlaut-normalized matching, exact-path active state)
  - Inject sidebar-polish CSS (dense items, custom scrollbar, group spacing)
"""
import re
from pathlib import Path

UI = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/frontend/dashboard-ui.js")
src = UI.read_text(encoding="utf-8")

# 1. Remove old block(s) matching V2_SIDEBAR_EXTRA_NAV up through final IIFE close
pattern = re.compile(r"\n*//\s*V2_SIDEBAR_EXTRA_NAV.*?\}\)\(\)\s*\n?", re.DOTALL)
src_clean = pattern.sub("\n", src)

NEW_BLOCK = r"""

// V2_SIDEBAR_EXTRA_NAV_V2 — adds nav items only on legacy sidebars (skip when data-sidebar-mode="full")
;(function(){
  const norm = (s) => (s||'').toLowerCase().replace(/ä/g,'a').replace(/ö/g,'o').replace(/ü/g,'u').replace(/ß/g,'ss').trim()
  const NEW_GROUPS = {
    'Menschen': [
      { label: 'Postfach', href: '/postfach-preview', badge: '3' }
    ],
    'Finanzen': [
      { label: 'Credits', href: '/credits-preview' }
    ],
    'Tools': [
      { label: 'Anwesenheit', href: '/anwesenheit-preview', insertBefore: 'Ferien' },
      { label: 'Räume', href: '/raeume-preview', insertBefore: 'Ferien' },
      { label: 'KI-Assistent', href: '/ki-assistent-preview', badge: 'PRO', insertBefore: 'Einstellungen' },
      { label: 'Integrationen', href: '/integrationen-preview', insertBefore: 'Einstellungen' }
    ]
  }
  function injectStyles(){
    if (document.getElementById('v2-sidebar-polish')) return
    const css = `
      .sidebar-nav { overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(255,239,225,0.18) transparent; }
      .sidebar-nav::-webkit-scrollbar { width: 4px; }
      .sidebar-nav::-webkit-scrollbar-track { background: transparent; }
      .sidebar-nav::-webkit-scrollbar-thumb { background: rgba(255,239,225,0.18); border-radius: 4px; }
      .sidebar-nav::-webkit-scrollbar-thumb:hover { background: rgba(255,239,225,0.32); }
      .sidebar-nav .nav-group { margin-bottom: 12px; }
      .sidebar-nav .nav-group:last-child { margin-bottom: 0; }
      .sidebar-nav .nav-item { padding-top: 7px; padding-bottom: 7px; font-size: 13.5px; }
      .sidebar-nav .nav-group-label { font-size: 10.5px; margin-bottom: 4px; }
      .sidebar-nav .badge { font-size: 10px; }
    `
    const st = document.createElement('style')
    st.id = 'v2-sidebar-polish'
    st.textContent = css
    document.head.appendChild(st)
  }
  function inject() {
    injectStyles()
    const nav = document.querySelector('.sidebar-nav')
    if (!nav) return
    // Skip if sidebar already rendered with full V2 menu (new pages)
    if (nav.dataset.sidebarMode === 'full') return
    if (nav.dataset.v2ExtraV2 === '1') return
    nav.dataset.v2ExtraV2 = '1'

    const groups = nav.querySelectorAll('.nav-group')
    const groupMap = {}
    groups.forEach(g => {
      const lbl = g.querySelector('.nav-group-label')
      if (lbl) groupMap[norm(lbl.textContent)] = g
    })

    Object.entries(NEW_GROUPS).forEach(([groupName, items]) => {
      const target = groupMap[norm(groupName)]
      if (!target) return
      const existingNorms = Array.from(target.querySelectorAll('.nav-item')).map(b => norm(b.textContent))
      items.forEach(it => {
        const itemNorm = norm(it.label)
        if (existingNorms.some(e => e === itemNorm || e.startsWith(itemNorm + ' '))) return // already there

        const btn = document.createElement('button')
        btn.className = 'nav-item'
        if (window.location.pathname.replace(/\/$/, '') === it.href) btn.classList.add('active')
        btn.onclick = () => { window.location.href = it.href }
        btn.textContent = it.label
        if (it.badge) {
          const sp = document.createElement('span')
          sp.className = 'badge'
          sp.textContent = it.badge
          btn.appendChild(document.createTextNode(' '))
          btn.appendChild(sp)
        }
        let inserted = false
        if (it.insertBefore) {
          const before = norm(it.insertBefore)
          const list = target.querySelectorAll('.nav-item')
          for (const ex of list) {
            if (norm(ex.textContent).startsWith(before)) {
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

if "V2_SIDEBAR_EXTRA_NAV_V2" in src_clean:
    print("- already has V2_SIDEBAR_EXTRA_NAV_V2 — replacing again to ensure latest")
    src_clean = re.sub(r"\n*//\s*V2_SIDEBAR_EXTRA_NAV_V2.*?\}\)\(\)\s*\n?", "\n", src_clean, flags=re.DOTALL)

src_new = src_clean.rstrip() + NEW_BLOCK
UI.write_text(src_new, encoding="utf-8")
print(f"OK dashboard-ui.js patched ({len(src_new)} bytes)")
