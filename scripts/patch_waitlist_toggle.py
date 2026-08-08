"""Add Warteliste-Option to Kurs-Creator + ensure widget gates the
'Auf Warteliste' button on this flag.

Steps:
1. kurs-creator-v2.js: add 'Buchungsoptionen' section with waitlistEnabled
   checkbox (and trialEnabled while we're at it).
2. kurs-creator-v2.js: prefill setVal('waitlistEnabled', !!act.waitlistEnabled)
3. dashboard-v3.html: both payload builders include waitlistEnabled
4. public.ts: widget endpoint enriches blocks with _waitlistEnabled
5. parent-course-widget.html: 'Auf Warteliste'-Button only when block._waitlistEnabled
"""

import re

# ============================================================
# 1) kurs-creator-v2.js: add Buchungsoptionen section
# ============================================================
kp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/kurs-creator-v2.js'
ks = open(kp, 'r', encoding='utf-8').read()

old_pay = """          // ZAHLUNG
          '<section class=\"kk-section\">' +
            '<div class=\"kk-section-label\">Zahlungsoptionen</div>' +
            '<div class=\"kk-pay-row\">' +
              '<label class=\"kk-checkbox\">' +
                '<input type=\"checkbox\" name=\"payOnline\" checked>' +
                '<span class=\"kk-checkbox-box\"></span>' +
                '<span>Online bezahlen <span class=\"kk-hint\">(Stripe / PayPal)</span></span>' +
              '</label>' +
              '<label class=\"kk-checkbox\">' +
                '<input type=\"checkbox\" name=\"payOnSite\" checked>' +
                '<span class=\"kk-checkbox-box\"></span>' +
                '<span>Vor Ort bezahlen</span>' +
              '</label>' +
              '<label class=\"kk-checkbox\">' +
                '<input type=\"checkbox\" name=\"payInvoice\">' +
                '<span class=\"kk-checkbox-box\"></span>' +
                '<span>Auf Rechnung <span class=\"kk-hint\">(SEPA-Lastschrift)</span></span>' +
              '</label>' +
            '</div>' +
          '</section>' +"""

new_pay = """          // ZAHLUNG
          '<section class=\"kk-section\">' +
            '<div class=\"kk-section-label\">Zahlungsoptionen</div>' +
            '<div class=\"kk-pay-row\">' +
              '<label class=\"kk-checkbox\">' +
                '<input type=\"checkbox\" name=\"payOnline\" checked>' +
                '<span class=\"kk-checkbox-box\"></span>' +
                '<span>Online bezahlen <span class=\"kk-hint\">(Stripe / PayPal)</span></span>' +
              '</label>' +
              '<label class=\"kk-checkbox\">' +
                '<input type=\"checkbox\" name=\"payOnSite\" checked>' +
                '<span class=\"kk-checkbox-box\"></span>' +
                '<span>Vor Ort bezahlen</span>' +
              '</label>' +
              '<label class=\"kk-checkbox\">' +
                '<input type=\"checkbox\" name=\"payInvoice\">' +
                '<span class=\"kk-checkbox-box\"></span>' +
                '<span>Auf Rechnung <span class=\"kk-hint\">(SEPA-Lastschrift)</span></span>' +
              '</label>' +
            '</div>' +
          '</section>' +

          // BUCHUNGSOPTIONEN
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

if old_pay not in ks:
    print('FAIL: payment section anchor not found'); exit(1)
ks = ks.replace(old_pay, new_pay, 1)
print('OK: Buchungsoptionen section added (waitlistEnabled + trialEnabled)')

# Add prefill lines after payOnSite
old_prefill = """      setVal('payOnline', !!act.paymentOnline);
      setVal('payOnSite', act.paymentOnsite !== false);"""
new_prefill = """      setVal('payOnline', !!act.paymentOnline);
      setVal('payOnSite', act.paymentOnsite !== false);
      setVal('waitlistEnabled', act.waitlistEnabled !== false);
      setVal('trialEnabled', !!act.trialEnabled);"""
if old_prefill not in ks:
    print('WARN: prefill anchor not found, skipping')
else:
    ks = ks.replace(old_prefill, new_prefill, 1)
    print('OK: prefill includes waitlistEnabled + trialEnabled')

open(kp, 'w', encoding='utf-8').write(ks)

# ============================================================
# 2) dashboard-v3.html: include waitlistEnabled in BOTH payload builders
# ============================================================
fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
fs = open(fp, 'r', encoding='utf-8').read()

# Pattern: paymentOnsite: !!data.payOnSite,
# Add waitlistEnabled and trialEnabled lines after each occurrence
old_block = """          paymentOnline: !!data.payOnline,
          paymentOnsite: !!data.payOnSite,"""
new_block = """          paymentOnline: !!data.payOnline,
          paymentOnsite: !!data.payOnSite,
          waitlistEnabled: data.waitlistEnabled !== false,
          trialEnabled: !!data.trialEnabled,"""

count = fs.count(old_block)
if count == 0:
    print('FAIL: paymentOnline pattern not found'); exit(1)
fs = fs.replace(old_block, new_block)
print('OK: ' + str(count) + ' payload builder(s) include waitlistEnabled + trialEnabled')

open(fp, 'w', encoding='utf-8').write(fs)

# ============================================================
# 3) public.ts: widget endpoint enriches blocks with _waitlistEnabled
# ============================================================
pp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/api/routes/public.ts'
ps = open(pp, 'r', encoding='utf-8').read()

old_enrich = """        _activityTitle: activity?.title ?? block.activityType,
        _enrollmentCount: enrollmentCounts.get(block.id) || 0,
        _paymentOnline: activity?.paymentOnline ?? false,
        _paymentOnsite: activity?.paymentOnsite ?? true,
      }"""
new_enrich = """        _activityTitle: activity?.title ?? block.activityType,
        _enrollmentCount: enrollmentCounts.get(block.id) || 0,
        _paymentOnline: activity?.paymentOnline ?? false,
        _paymentOnsite: activity?.paymentOnsite ?? true,
        _waitlistEnabled: activity?.waitlistEnabled !== false,
        _trialEnabled: !!activity?.trialEnabled,
      }"""
if old_enrich not in ps:
    print('FAIL: widget enrich anchor not found'); exit(1)
ps = ps.replace(old_enrich, new_enrich, 1)
open(pp, 'w', encoding='utf-8').write(ps)
print('OK: widget endpoint exposes _waitlistEnabled + _trialEnabled')

# ============================================================
# 4) parent-course-widget.html: gate "Auf Warteliste" button on flag
# ============================================================
wp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/widgets/parent-course-widget.html'
ws = open(wp, 'r', encoding='utf-8').read()

old_btn = """          ${spotsLeft > 0 && block.status !== 'completed'
            ? `<button class="btn btn-primary btn-sm" onclick="startBooking('${escAttr(block.id)}')">Jetzt buchen</button>`
            : spotsLeft <= 0
              ? `<button class="btn btn-secondary btn-sm" onclick="joinWaitlist('${escAttr(block.id)}')">Auf Warteliste</button>`
              : ''
          }"""
new_btn = """          ${spotsLeft > 0 && block.status !== 'completed'
            ? `<button class="btn btn-primary btn-sm" onclick="startBooking('${escAttr(block.id)}')">Jetzt buchen</button>`
            : (spotsLeft <= 0 && (block._waitlistEnabled !== false))
              ? `<button class="btn btn-secondary btn-sm" onclick="joinWaitlist('${escAttr(block.id)}')">Auf Warteliste</button>`
              : (spotsLeft <= 0)
                ? `<button class="btn btn-ghost btn-sm" disabled style="opacity:0.5;cursor:not-allowed">Ausgebucht</button>`
                : ''
          }"""
if old_btn not in ws:
    print('FAIL: widget button anchor not found'); exit(1)
ws = ws.replace(old_btn, new_btn, 1)
open(wp, 'w', encoding='utf-8').write(ws)
print('OK: widget gates "Auf Warteliste" button on block._waitlistEnabled')

print('All patches applied.')
