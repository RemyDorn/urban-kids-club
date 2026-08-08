"""Sprint A.2.1: Wire kurs-creator-v2.js into dashboard-v3.html
- Embed <script src="/assets/kurs-creator-v2.js"> in dashboard-v3
- Remove redirect-onclick from "+ Neuer Kurs" button (let auto-hook take over)
- Override openKursCreatorV2 with real API submit callback
- Replace hardcoded TRAINERS/ROOMS arrays with API-loaded values
"""
import re

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
with open(p, 'r', encoding='utf-8') as f:
    src = f.read()

# 1. Add script tag before main inline script (or at end of body)
# Find the LAST <script> tag (which is the main inline) and inject our script tag BEFORE it
# Actually we use existing pattern: <script src="/assets/dashboard-ui.js"></script> appears at end
script_tag = '<script src="/assets/kurs-creator-v2.js"></script>'
if script_tag not in src:
    # Look for </body> or end-of-document marker
    # Insert before the last <script> with src= /assets/dashboard-ui
    marker = '<script src="/assets/dashboard-ui.js"></script>'
    if marker in src:
        src = src.replace(marker, script_tag + '\n' + marker, 1)
        print('OK: kurs-creator-v2.js script tag added')
    else:
        # fallback: before </body>
        src = src.replace('</body>', script_tag + '\n</body>', 1)
        print('OK: kurs-creator-v2.js script tag added (before </body>)')
else:
    print('NOTE: script tag already present')

# 2. Remove redirect-onclick from + Neuer Kurs in kurse section (auto-hook will handle it)
old_btn = """<button class="btn btn-primary" onclick="window.location.href='/kurs-anlegen-preview'">+ Neuer Kurs</button>"""
new_btn = """<button class="btn btn-primary">+ Neuer Kurs</button>"""
if old_btn in src:
    src = src.replace(old_btn, new_btn, 1)
    print('OK: redirect onclick removed from kurse + Neuer Kurs button')

# 3. Add wire-up code: register openKursCreatorV2 onSubmit callback that hits API
wire_code = r"""
// ============================================================
// Sprint A.2.1: Kurs-Creator API Integration
// ============================================================
(function() {
  function waitForState(cb, tries) {
    if (window.dashboardState && window.dashboardState.api) return cb();
    if ((tries||0) > 50) return; // 5s max
    setTimeout(function(){ waitForState(cb, (tries||0)+1); }, 100);
  }

  // Override window.openKursCreatorV2 to inject API callback + dynamic Trainers/Rooms
  waitForState(function() {
    var state = window.dashboardState;
    var origOpen = window.openKursCreatorV2;
    if (!origOpen) {
      console.warn('[v3] kurs-creator not loaded yet');
      return;
    }

    // Load rooms + team async, populate after modal opens
    async function populateLists(overlay) {
      try {
        const r = await state.api('/rooms');
        const rooms = r.data || r.rooms || r || [];
        const sel = overlay.querySelector('select[name="room"]');
        if (sel && rooms.length) {
          // Keep first option ("Kein Raum"), append real rooms
          rooms.forEach(function(rm) {
            var opt = document.createElement('option');
            opt.value = rm.id || rm.name;
            opt.textContent = rm.name || ('Raum ' + rm.id);
            sel.appendChild(opt);
          });
        }
      } catch (e) { console.warn('[v3] /rooms load failed', e); }

      try {
        const provider = state.provider;
        const r = await state.api('/providers/' + provider.id + '/team');
        const team = r.data || r.team || r.members || r || [];
        const sel = overlay.querySelector('select[name="trainer"]');
        if (sel) {
          // Clear existing mockup options except first ("Kein Kursleiter")
          while (sel.options.length > 1) sel.remove(1);
          team.forEach(function(m) {
            var opt = document.createElement('option');
            opt.value = m.id || m.userId || m.email;
            opt.textContent = m.name || m.displayName || m.email;
            sel.appendChild(opt);
          });
          // If no team members, hide trainer field or show hint
          if (team.length === 0) {
            sel.options[0].textContent = 'Noch kein Team angelegt';
          }
        }
      } catch (e) {
        // Endpoint may not exist yet — fall back to "no team"
        const sel = overlay.querySelector('select[name="trainer"]');
        if (sel) {
          while (sel.options.length > 1) sel.remove(1);
          sel.options[0].textContent = 'Noch kein Team angelegt';
        }
        console.warn('[v3] team load failed (ok if no team API)', e);
      }
    }

    // Wrap openKursCreatorV2 — inject our submit callback + populate lists
    window.openKursCreatorV2 = function(opts) {
      opts = opts || {};
      var userOnSubmit = opts.onSubmit;
      opts.onSubmit = async function(data) {
        // Map modal data to API shape
        const payload = {
          providerId: state.provider.id,
          title: data.title,
          description: data.description || '',
          category: data.category,
          minAgeMonths: parseInt(data.ageMin) * (data.ageMinUnit === 'years' ? 12 : 1) || null,
          maxAgeMonths: parseInt(data.ageMax) * (data.ageMaxUnit === 'years' ? 12 : 1) || null,
          capacity: parseInt(data.capacity) || 10,
          priceCents: Math.round((parseFloat(data.priceAmount) || 0) * 100),
          priceModel: data.priceModel || 'package',
          priceLabel: data.priceLabel || '',
          weeks: parseInt(data.weeks) || null,
          siblingDiscountPct: parseFloat(data.siblingDiscount) || 0,
          schedule: data.schedule || [],
          paymentOptions: {
            online: !!data.payOnline,
            inPerson: !!data.payInPerson,
            invoice: !!data.payInvoice,
          },
          calendarColor: data.calendarColor || null,
          roomId: data.room && data.room !== '' ? data.room : null,
          trainerId: data.trainer && data.trainer !== '' ? data.trainer : null,
        };
        try {
          const r = await state.api('/activities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          // Refresh state.activities
          state.activities.push(r.data || r.activity || r);
          // Re-render kurse section if active
          if (location.hash === '#kurse' && window.sectionLoaders && window.sectionLoaders.kurse) {
            window.sectionLoaders.kurse();
          }
          // Update sidebar badge
          const tab = document.querySelector('button.nav-item[data-section-target="kurse"] .badge');
          if (tab) tab.textContent = state.activities.length;
        } catch (e) {
          console.error('[v3] Kurs anlegen failed', e);
          alert('Kurs konnte nicht gespeichert werden: ' + e.message);
        }
        if (typeof userOnSubmit === 'function') userOnSubmit(data);
      };
      const result = origOpen.call(this, opts);
      // After modal mounts, populate dynamic lists
      setTimeout(function() {
        const overlay = document.querySelector('.ukc-kurs-overlay');
        if (overlay) populateLists(overlay);
      }, 50);
      return result;
    };

    console.log('[v3] kurs-creator-v2 API integration ready');
  });
})();
"""

# Insert wire_code before Phase 2a
marker = '// ============================================================\n// Phase 2a: SPA-Router'
if marker not in src:
    print('FAIL: Phase 2a marker not found'); exit(1)
if 'Sprint A.2.1: Kurs-Creator API Integration' not in src:
    src = src.replace(marker, wire_code + '\n' + marker, 1)
    print('OK: kurs-creator API integration added')
else:
    print('NOTE: integration already present, skipping')

with open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print(f'File: {len(src)} bytes')
