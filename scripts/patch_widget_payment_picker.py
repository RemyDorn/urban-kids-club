"""Two patches:
1. Backend: enrich /api/widget/providers/:slug/course-blocks with payment flags from activity.
2. Frontend (parent-course-widget.html): show payment-method picker in step 2.
"""

# ============================================================
# 1. Backend: src/api/routes/public.ts
# ============================================================
backend_path = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/api/routes/public.ts'
b_src = open(backend_path, 'r', encoding='utf-8').read()

old_b = """    const enriched = blocks.map((block: any) => {
      const activity = activityMap.get(block.activityId)
      return {
        ...block,
        _activityTitle: activity?.title ?? block.activityType,
        _enrollmentCount: enrollmentCounts.get(block.id) || 0,
      }
    })"""

new_b = """    const enriched = blocks.map((block: any) => {
      const activity = activityMap.get(block.activityId)
      return {
        ...block,
        _activityTitle: activity?.title ?? block.activityType,
        _enrollmentCount: enrollmentCounts.get(block.id) || 0,
        _paymentOnline: activity?.paymentOnline ?? false,
        _paymentOnsite: activity?.paymentOnsite ?? true,
      }
    })"""

if old_b not in b_src:
    print('FAIL: backend enrichment block not found'); exit(1)
b_src = b_src.replace(old_b, new_b, 1)
open(backend_path, 'w', encoding='utf-8').write(b_src)
print('OK: backend enriched with payment flags')

# ============================================================
# 2. Frontend: src/widgets/parent-course-widget.html
# ============================================================
fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/widgets/parent-course-widget.html'
f_src = open(fp, 'r', encoding='utf-8').read()

# Insert payment picker into step 2 right above the AGB checkbox.
old_f = """      <label class="checkout-checkbox">
        <input type="checkbox" id="co-agb" ${checkoutData.agbAccepted ? 'checked' : ''}>
        <span>Ich stimme den <a href="#" style="color:var(--primary)">AGB</a> und <a href="#" style="color:var(--primary)">Datenschutzbestimmungen</a> zu. *</span>
      </label>`"""

new_f = """      <div id="payment-picker" style="margin-top:14px;display:flex;flex-direction:column;gap:8px">
        <div style="font-weight:600;font-size:13px;color:var(--text);margin-bottom:2px">Zahlungsart</div>
        ${block._paymentOnline ? `
          <label class="checkout-checkbox" style="cursor:pointer">
            <input type="radio" name="co-pay" value="stripe" ${(checkoutData.paymentMethod || (block._paymentOnsite ? 'onsite' : 'stripe')) === 'stripe' ? 'checked' : ''}>
            <span>Online bezahlen <span style="color:var(--text-muted);font-size:12px">(Stripe — sicher per Kreditkarte / SEPA)</span></span>
          </label>` : ''}
        ${block._paymentOnsite ? `
          <label class="checkout-checkbox" style="cursor:pointer">
            <input type="radio" name="co-pay" value="onsite" ${(checkoutData.paymentMethod || 'onsite') === 'onsite' ? 'checked' : ''}>
            <span>Vor Ort bezahlen <span style="color:var(--text-muted);font-size:12px">(bar oder Karte beim Kursleiter)</span></span>
          </label>` : ''}
        ${(!block._paymentOnline && !block._paymentOnsite) ? `
          <div style="padding:10px 12px;background:#fef3c7;border-radius:8px;font-size:13px;color:#92400e">Keine Zahlungsart aktiviert. Bitte beim Anbieter nachfragen.</div>` : ''}
      </div>

      <label class="checkout-checkbox" style="margin-top:12px">
        <input type="checkbox" id="co-agb" ${checkoutData.agbAccepted ? 'checked' : ''}>
        <span>Ich stimme den <a href="#" style="color:var(--primary)">AGB</a> und <a href="#" style="color:var(--primary)">Datenschutzbestimmungen</a> zu. *</span>
      </label>`"""

if old_f not in f_src:
    print('FAIL: AGB checkbox marker not found'); exit(1)
f_src = f_src.replace(old_f, new_f, 1)

# Wire the radio change → checkoutData.paymentMethod, and persist on next/back.
# The existing saveCheckoutFormData captures form data; let's also make sure
# the radio is read at submit time. Easiest: add saveCheckoutFormData hook for step 2.
old_save = """function saveCheckoutFormData() {"""
new_save = """function saveCheckoutFormData() {
  // Step 2: capture selected payment method
  const payRadio = document.querySelector('input[name="co-pay"]:checked')
  if (payRadio) checkoutData.paymentMethod = payRadio.value
  // Capture AGB checkbox state too
  const agb = document.getElementById('co-agb')
  if (agb) checkoutData.agbAccepted = agb.checked
"""

if old_save not in f_src:
    print('FAIL: saveCheckoutFormData entry not found'); exit(1)
f_src = f_src.replace(old_save, new_save, 1)

# Add payment-method validation in step 2 next-handler
old_step2 = """  } else if (checkoutStep === 2) {
    // Validate step 2
    if (!checkoutData.agbAccepted) {
      showToast('Bitte stimme den AGB zu.', true)
      return
    }
    submitCheckout()
  }
}"""

new_step2 = """  } else if (checkoutStep === 2) {
    // Validate step 2
    if (!checkoutData.paymentMethod) {
      showToast('Bitte wähle eine Zahlungsart.', true)
      return
    }
    if (!checkoutData.agbAccepted) {
      showToast('Bitte stimme den AGB zu.', true)
      return
    }
    submitCheckout()
  }
}"""

if old_step2 not in f_src:
    print('FAIL: step2 next-handler not found'); exit(1)
f_src = f_src.replace(old_step2, new_step2, 1)

open(fp, 'w', encoding='utf-8').write(f_src)
print('OK: frontend payment-picker wired')
