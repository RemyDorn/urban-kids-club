"""Patch A: Add-Up-System v1
1. Frontend rename: Make-up -> Add-Up in user-facing labels
2. kurs-creator-v2: replace 'Probestunde anbieten' toggle with
   number field 'Add-Up-Plaetze' (maps to makeupCapacity)
3. dashboard-v3 payload builders: send makeupCapacity instead of trialEnabled
4. Backend activities POST insert + PUT sync support makeupCapacity
5. Kurs-Detail KPI: capacity color-separated (apricot regular + sage Add-Up)
6. Settings page: new card 'Add-Up & Credits' (static UI, save stub)
7. invitations matching-parents: include parents with active credits
"""

import re

# ============================================================
# 1. kurs-creator-v2.js: Probestunde -> Add-Up-Plaetze number field
# ============================================================
kp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/kurs-creator-v2.js'
ks = open(kp, 'r', encoding='utf-8').read()

old_section = """          // BUCHUNGSOPTIONEN
          '<section class=\"kk-section\">' +
            '<div class=\"kk-section-label\">Buchungsoptionen</div>' +
            '<div class=\"kk-pay-row\">' +
              '<label class=\"kk-checkbox\">' +
                '<input type=\"checkbox\" name=\"waitlistEnabled\" checked>' +
                '<span class=\"kk-checkbox-box\"></span>' +
                '<span>Warteliste aktivieren <span class=\"kk-hint\">(wenn voll, k\\u00f6nnen Eltern sich vormerken)</span></span>' +
              '</label>' +
              '<label class=\"kk-checkbox\">' +
                '<input type=\"checkbox\" name=\"trialEnabled\">' +
                '<span class=\"kk-checkbox-box\"></span>' +
                '<span>Probestunde anbieten <span class=\"kk-hint\">(unverbindliches Schnuppern)</span></span>' +
              '</label>' +
            '</div>' +
          '</section>' +"""

new_section = """          // BUCHUNGSOPTIONEN
          '<section class=\"kk-section\">' +
            '<div class=\"kk-section-label\">Buchungsoptionen</div>' +
            '<div class=\"kk-pay-row\" style=\"align-items:flex-end;\">' +
              '<label class=\"kk-checkbox\">' +
                '<input type=\"checkbox\" name=\"waitlistEnabled\" checked>' +
                '<span class=\"kk-checkbox-box\"></span>' +
                '<span>Warteliste aktivieren <span class=\"kk-hint\">(wenn voll, k\\u00f6nnen Eltern sich vormerken)</span></span>' +
              '</label>' +
              '<label class=\"kk-field\" style=\"max-width:200px;\">' +
                '<span class=\"kk-label\">Add-Up-Pl\\u00e4tze</span>' +
                '<input class=\"kk-input\" type=\"number\" name=\"addUpSlots\" value=\"2\" min=\"0\" max=\"20\">' +
                '<span class=\"kk-hint\" style=\"font-size:11px;color:var(--muted-2);margin-top:4px;\">Zus\\u00e4tzliche Pl\\u00e4tze f\\u00fcr Probestunden, Wartelisten-Angebote und Nachhol-Buchungen. F\\u00fcr Eltern unsichtbar.</span>' +
              '</label>' +
            '</div>' +
          '</section>' +"""

if old_section not in ks:
    print('FAIL: Buchungsoptionen anchor not found'); exit(1)
ks = ks.replace(old_section, new_section, 1)
print('OK: Probestunde toggle replaced with Add-Up-Plaetze number field')

# Update prefill to use addUpSlots
old_pre = """      setVal('waitlistEnabled', act.waitlistEnabled !== false);
      setVal('trialEnabled', !!act.trialEnabled);"""
new_pre = """      setVal('waitlistEnabled', act.waitlistEnabled !== false);
      setVal('addUpSlots', act.makeupCapacity != null ? act.makeupCapacity : 2);"""
if old_pre not in ks:
    print('WARN: prefill anchor not found, skipping')
else:
    ks = ks.replace(old_pre, new_pre, 1)
    print('OK: prefill addUpSlots from act.makeupCapacity')

open(kp, 'w', encoding='utf-8').write(ks)

# ============================================================
# 2. dashboard-v3 payload builders: makeupCapacity instead of trialEnabled
# ============================================================
fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
fs = open(fp, 'r', encoding='utf-8').read()

old_pl = """          paymentOnline: !!data.payOnline,
          paymentOnsite: !!data.payOnSite,
          waitlistEnabled: data.waitlistEnabled !== false,
          trialEnabled: !!data.trialEnabled,"""
new_pl = """          paymentOnline: !!data.payOnline,
          paymentOnsite: !!data.payOnSite,
          waitlistEnabled: data.waitlistEnabled !== false,
          makeupCapacity: data.addUpSlots != null ? Math.max(0, parseInt(data.addUpSlots, 10)) : 2,"""
count = fs.count(old_pl)
if count == 0:
    print('FAIL: payload pattern not found'); exit(1)
fs = fs.replace(old_pl, new_pl)
print('OK: ' + str(count) + ' payload builder(s) send makeupCapacity')

# ============================================================
# 3. Kurs-Detail Im Detail "Max. Gruppe" -> color-separated capacity
# ============================================================
old_max = "document.getElementById('phKdInfoMax').textContent = (a.capacity || '—') + (a.capacity ? ' Plätze' : '');"
new_max = """var addUpC = (a.makeupCapacity != null) ? a.makeupCapacity : null;
    document.getElementById('phKdInfoMax').innerHTML = (a.capacity ? '<span style=\"color:var(--primary);font-weight:600\">' + a.capacity + '</span> regul\\u00e4r' : '\\u2014') + (addUpC ? ' <span style=\"color:var(--sage-deep);margin-left:6px\">+ ' + addUpC + ' Add-Up</span>' : '');"""
if old_max not in fs:
    print('WARN: phKdInfoMax anchor not found');
else:
    fs = fs.replace(old_max, new_max, 1)
    print('OK: phKdInfoMax capacity color-separated')

# Auslastung sub: include Add-Up info
old_ausl = "document.getElementById('phKdAuslSub').textContent = pct + ' % · ' + Math.max(0, cap - booked) + ' Plätze frei';"
new_ausl = """var addUpInfo = (a.makeupCapacity != null && a.makeupCapacity > 0) ? ' · ' + a.makeupCapacity + ' Add-Up' : '';
    document.getElementById('phKdAuslSub').textContent = pct + ' % · ' + Math.max(0, cap - booked) + ' Pl\\u00e4tze frei' + addUpInfo;"""
if old_ausl in fs:
    fs = fs.replace(old_ausl, new_ausl, 1)
    print('OK: Auslastung sub shows Add-Up')

# 'Nachhol-Termin' rename in Quick-Action
old_nh = "<div><div>Termin hinzufügen</div><div class=\"quick-action-sub\">Zusatz-Stunde oder Nachhol-Termin</div></div>"
new_nh = "<div><div>Termin hinzufügen</div><div class=\"quick-action-sub\">Zusatz-Stunde oder Add-Up Termin</div></div>"
if old_nh in fs:
    fs = fs.replace(old_nh, new_nh, 1)
    print('OK: Quick-Action sub renamed to Add-Up')

# ============================================================
# 4. Settings page: new card "Add-Up & Credits" (static UI for now)
# ============================================================
old_advanced = """      <div class=\"card\" style=\"padding:24px;margin-top:18px;\">
        <h3 style=\"font-family:var(--font-heading);font-weight:700;font-size:18px;margin-bottom:12px;\">Erweiterte Einstellungen</h3>
        <p style=\"font-size:13px;color:var(--muted);\">Rollen-System, Steuer-Einstellungen, Benachrichtigungs-Templates, Backup &amp; Export &mdash; folgen in Sprint D.</p>
      </div>"""

new_addup_card = """      <div class=\"card\" style=\"padding:24px;margin-top:18px;\">
        <h3 style=\"font-family:var(--font-heading);font-weight:700;font-size:18px;margin-bottom:14px;\">Add-Up &amp; Credits</h3>
        <p style=\"font-size:13px;color:var(--muted);margin-bottom:16px;line-height:1.55;\">Add-Up-Plätze sind zusätzliche, für Eltern unsichtbare Plätze in jedem Kurs. Sie werden vergeben für Probestunden, Warteliste-Angebote und Nachhol-Buchungen mit Credits.</p>
        <div style=\"display:grid;grid-template-columns:1fr 1fr;gap:16px;\">
          <label class=\"kk-field\">
            <span class=\"kk-label\">Add-Up-System aktivieren</span>
            <select class=\"kk-input\" id=\"phSetAddUpEnabled\">
              <option value=\"true\" selected>Ja — Add-Up-Plätze sind verfügbar</option>
              <option value=\"false\">Nein — nur reguläre Plätze</option>
            </select>
          </label>
          <label class=\"kk-field\">
            <span class=\"kk-label\">Krank-Cutoff (Stunden vor Termin)</span>
            <input class=\"kk-input\" id=\"phSetCancelCutoff\" type=\"number\" min=\"0\" max=\"168\" value=\"24\">
            <span class=\"kk-hint\" style=\"font-size:11px;color:var(--muted-2);margin-top:4px;\">Eltern, die später krank melden, bekommen keinen Credit.</span>
          </label>
          <label class=\"kk-field\">
            <span class=\"kk-label\">Credit-Verfall (Monate)</span>
            <input class=\"kk-input\" id=\"phSetCreditExpiry\" type=\"number\" min=\"0\" max=\"36\" value=\"12\">
            <span class=\"kk-hint\" style=\"font-size:11px;color:var(--muted-2);margin-top:4px;\">0 = unbegrenzt gültig.</span>
          </label>
          <label class=\"kk-field\">
            <span class=\"kk-label\">Standard Add-Up-Plätze</span>
            <input class=\"kk-input\" id=\"phSetDefaultAddUp\" type=\"number\" min=\"0\" max=\"20\" value=\"2\">
            <span class=\"kk-hint\" style=\"font-size:11px;color:var(--muted-2);margin-top:4px;\">Voreinstellung beim Anlegen neuer Kurse.</span>
          </label>
        </div>
        <div style=\"margin-top:18px;display:flex;gap:8px;\">
          <button class=\"btn btn-primary btn-sm\" onclick=\"window.__settingsSaveAddUp()\">Speichern</button>
          <button class=\"btn btn-ghost btn-sm\" onclick=\"window.showSection('kurse')\">Abbrechen</button>
        </div>
      </div>

      <div class=\"card\" style=\"padding:24px;margin-top:18px;\">
        <h3 style=\"font-family:var(--font-heading);font-weight:700;font-size:18px;margin-bottom:12px;\">Erweiterte Einstellungen</h3>
        <p style=\"font-size:13px;color:var(--muted);\">Rollen-System, Steuer-Einstellungen, Benachrichtigungs-Templates, Backup &amp; Export &mdash; folgen in Sprint D.</p>
      </div>"""

if old_advanced not in fs:
    print('WARN: Erweiterte Einstellungen anchor not found, skipping settings card')
else:
    fs = fs.replace(old_advanced, new_addup_card, 1)
    print('OK: Add-Up & Credits settings card injected')

# Settings save stub function — write to provider preferences via PUT /me
SAVE_FN = """
window.__settingsSaveAddUp = async function() {
  var s = window.dashboardState; if (!s) return;
  var addUpEnabled = (document.getElementById('phSetAddUpEnabled') || {}).value === 'true';
  var cutoff = parseInt((document.getElementById('phSetCancelCutoff') || {}).value, 10) || 24;
  var expiry = parseInt((document.getElementById('phSetCreditExpiry') || {}).value, 10) || 12;
  var defaultAU = parseInt((document.getElementById('phSetDefaultAddUp') || {}).value, 10) || 2;
  var prefs = {
    addUpEnabled: addUpEnabled,
    cancelCutoffHours: cutoff,
    creditExpiryMonths: expiry,
    defaultAddUpSlots: defaultAU,
  };
  try {
    var resp = await fetch('/api/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (s.token || '') },
      body: JSON.stringify({ preferences: prefs }),
    });
    // Save locally regardless (backend may not persist preferences yet)
    s.provider = Object.assign({}, s.provider || {}, { preferences: prefs });
    if (window.ukcToast) window.ukcToast(resp.ok ? 'Einstellungen gespeichert' : 'Lokal gespeichert (Server-Sync folgt)');
  } catch (e) {
    s.provider = Object.assign({}, s.provider || {}, { preferences: prefs });
    if (window.ukcToast) window.ukcToast('Lokal gespeichert');
  }
};
"""

# Insert before the existing einstellungen sectionLoader
anchor = "window.sectionLoaders.einstellungen = async function() {"
idx = fs.find(anchor)
if idx > 0:
    fs = fs[:idx] + SAVE_FN + "\n" + fs[idx:]
    print('OK: __settingsSaveAddUp helper added')

open(fp, 'w', encoding='utf-8').write(fs)

# ============================================================
# 5. Backend activities.ts: makeup_capacity sync (insert + PUT)
# ============================================================
ap = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/api/routes/activities.ts'
asrc = open(ap, 'r', encoding='utf-8').read()

# 5a. INSERT: append makeup_capacity to course_blocks insert
old_insert = """          capacity: (parsed.data as any).capacity || 10,
          status: 'active',
        }).select().single()"""
new_insert = """          capacity: (parsed.data as any).capacity || 10,
          makeup_capacity: (parsed.data as any).makeupCapacity != null ? (parsed.data as any).makeupCapacity : 2,
          status: 'active',
        }).select().single()"""
if old_insert not in asrc:
    print('WARN: course_block insert anchor not found')
else:
    asrc = asrc.replace(old_insert, new_insert, 1)
    print('OK: course_blocks insert honors makeupCapacity from create payload')

# 5b. PUT: extend updateForBlock with makeup_capacity
old_putblk = """      const updateForBlock: Record<string, any> = {}
      if (body.capacity != null) updateForBlock.capacity = body.capacity"""
new_putblk = """      const updateForBlock: Record<string, any> = {}
      if (body.capacity != null) updateForBlock.capacity = body.capacity
      if (body.makeupCapacity != null) updateForBlock.makeup_capacity = body.makeupCapacity"""
if old_putblk in asrc:
    asrc = asrc.replace(old_putblk, new_putblk, 1)
    print('OK: PUT route syncs makeup_capacity to course_blocks')
else:
    print('WARN: PUT updateForBlock anchor not found')

open(ap, 'w', encoding='utf-8').write(asrc)

# ============================================================
# 6. Schema: ensure makeupCapacity is allowed in CreateActivitySchema
# ============================================================
sp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/lib/schemas.ts'
ssrc = open(sp, 'r', encoding='utf-8').read()
if 'makeupCapacity' not in ssrc:
    # find waitlistEnabled line and add makeupCapacity right after
    target = "  waitlistEnabled: z.boolean().optional(),"
    if target in ssrc:
        ssrc = ssrc.replace(target, target + "\n  makeupCapacity: z.number().int().min(0).max(50).optional(),", 1)
        open(sp, 'w', encoding='utf-8').write(ssrc)
        print('OK: schema accepts makeupCapacity')

# ============================================================
# 7. Activity PUT whitelist: include makeupCapacity
# ============================================================
asrc2 = open(ap, 'r', encoding='utf-8').read()
old_whitelist = """    const fields = ['title', 'description', 'category', 'ageRange', 'capacity', 'schedule', 'pricing',
      'color', 'imageUrl', 'images', 'status', 'instructorId', 'roomId', 'locationId', 'platformListing',
      'payment_online', 'payment_onsite', 'paymentOnline', 'paymentOnsite',
      'waitlistEnabled', 'trialEnabled', 'tags',
      'siblingDiscount', 'siblingDiscountPercent']"""
new_whitelist = """    const fields = ['title', 'description', 'category', 'ageRange', 'capacity', 'schedule', 'pricing',
      'color', 'imageUrl', 'images', 'status', 'instructorId', 'roomId', 'locationId', 'platformListing',
      'payment_online', 'payment_onsite', 'paymentOnline', 'paymentOnsite',
      'waitlistEnabled', 'trialEnabled', 'tags', 'makeupCapacity',
      'siblingDiscount', 'siblingDiscountPercent']"""
if old_whitelist in asrc2:
    asrc2 = asrc2.replace(old_whitelist, new_whitelist, 1)
    open(ap, 'w', encoding='utf-8').write(asrc2)
    print('OK: PUT whitelist includes makeupCapacity')

# ============================================================
# 8. invitations.ts: extend matching-parents to include credit-holders
# ============================================================
ip = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/api/routes/invitations.ts'
isrc = open(ip, 'r', encoding='utf-8').read()

# Insert the credit-fetch block right after the alreadyBooked logic
old_credits_anchor = """    // Step 4: Calculate relevance score and build match reasons"""
new_credits_anchor = """    // Step 3.6: Find parents with active credits (also relevant for invites)
    const creditCountByParent = new Map<string, number>()
    try {
      const { data: creditRows } = await sb.from('session_credits')
        .select('parent_id, status')
        .eq('status', 'active')
      for (const row of creditRows ?? []) {
        if (!row.parent_id) continue
        creditCountByParent.set(row.parent_id, (creditCountByParent.get(row.parent_id) || 0) + 1)
      }
      // Boost or include parents with credits even if no age/category match
      for (const [pid, cnt] of creditCountByParent) {
        if (alreadyBookedParents.has(pid)) continue
        let m = parentMap.get(pid)
        if (!m) {
          // Add as fresh entry — no booking history but has unused credits
          m = {
            parentId: pid, childNames: [], childAges: [], matchReasons: [],
            relevanceScore: 0, lastBookingAt: '', bookingCount: 0,
            hasCategoryMatch: false, hasAgeMatch: false, isActive: true,
          }
          parentMap.set(pid, m)
        }
        ;(m as any).creditCount = cnt
      }
    } catch (e) {
      // session_credits table may not exist yet
    }

    // Step 4: Calculate relevance score and build match reasons"""

if old_credits_anchor in isrc:
    isrc = isrc.replace(old_credits_anchor, new_credits_anchor, 1)
    print('OK: matching-parents collects credit holders')

# Also adjust the score loop to include credit-based scoring
old_score = """    for (const match of parentMap.values()) {
      // Don't suggest parents that already have an active booking for this course
      if (alreadyBookedParents.has(match.parentId)) continue
      // At least one matching criterion required
      if (!match.hasAgeMatch && !match.hasCategoryMatch) continue

      let score = 0
      if (match.hasAgeMatch) {
        score += 50
        match.matchReasons.push('Kind im passenden Alter')
      }
      if (match.hasCategoryMatch) {
        score += 30
        match.matchReasons.push('Hat ähnlichen Kurs besucht')
      }
      if (match.isActive) {
        score += 20
        match.matchReasons.push('Aktiver Kunde')
      }
      match.relevanceScore = score
      matches.push(match)
    }"""

new_score = """    for (const match of parentMap.values()) {
      // Don't suggest parents that already have an active booking for this course
      if (alreadyBookedParents.has(match.parentId)) continue
      const credCount = (match as any).creditCount || 0
      // At least one matching criterion required (or credits available)
      if (!match.hasAgeMatch && !match.hasCategoryMatch && credCount === 0) continue

      let score = 0
      if (credCount > 0) {
        score += 70
        match.matchReasons.push(credCount + ' Credit' + (credCount === 1 ? '' : 's') + ' verfügbar')
      }
      if (match.hasAgeMatch) {
        score += 50
        match.matchReasons.push('Kind im passenden Alter')
      }
      if (match.hasCategoryMatch) {
        score += 30
        match.matchReasons.push('Hat ähnlichen Kurs besucht')
      }
      if (match.isActive) {
        score += 20
        match.matchReasons.push('Aktiver Kunde')
      }
      match.relevanceScore = score
      matches.push(match)
    }"""

if old_score in isrc:
    isrc = isrc.replace(old_score, new_score, 1)
    print('OK: scoring includes credit-holder priority (+70)')

# Pass creditCount through to result
old_result = """          relevanceScore: m.relevanceScore,
          bookingCount: m.bookingCount,
          isActive: m.isActive,
          alreadyInvited: invitedParentIds.has(m.parentId),
        }"""
new_result = """          relevanceScore: m.relevanceScore,
          bookingCount: m.bookingCount,
          isActive: m.isActive,
          creditCount: (m as any).creditCount || 0,
          alreadyInvited: invitedParentIds.has(m.parentId),
        }"""
if old_result in isrc:
    isrc = isrc.replace(old_result, new_result, 1)
    print('OK: result includes creditCount')

open(ip, 'w', encoding='utf-8').write(isrc)

# ============================================================
# 9. Frontend invite-modal: render credit badge
# ============================================================
fs2 = open(fp, 'r', encoding='utf-8').read()

old_badges = """        (p.matchReasons || []).forEach(function(reason) {
          var cls = 'invite-badge';
          if (/Alter/.test(reason)) cls += ' match-age';
          else if (/Kurs/.test(reason)) cls += ' match-cat';
          else if (/Aktiv/.test(reason)) cls += ' active';
          badges += '<span class=\"' + cls + '\">' + (window.escapeHtml ? window.escapeHtml(reason) : reason) + '</span>';
        });"""
new_badges = """        (p.matchReasons || []).forEach(function(reason) {
          var cls = 'invite-badge';
          if (/Credit/.test(reason)) cls += ' match-credit';
          else if (/Alter/.test(reason)) cls += ' match-age';
          else if (/Kurs/.test(reason)) cls += ' match-cat';
          else if (/Aktiv/.test(reason)) cls += ' active';
          badges += '<span class=\"' + cls + '\">' + (window.escapeHtml ? window.escapeHtml(reason) : reason) + '</span>';
        });"""
if old_badges in fs2:
    fs2 = fs2.replace(old_badges, new_badges, 1)
    print('OK: invite badges recognize Credit reason')

# Add CSS for credit badge
CREDIT_CSS = """
.invite-badge.match-credit { background: var(--primary-tint); color: var(--primary-hover); border: 1px solid var(--primary); font-weight: 700; }
"""
m_style = re.search(r'</style>', fs2)
if m_style:
    fs2 = fs2[:m_style.start()] + CREDIT_CSS + fs2[m_style.start():]
    print('OK: credit badge CSS injected')

open(fp, 'w', encoding='utf-8').write(fs2)
print('All patches applied.')
