"""Switch widget submitCheckout from auth-protected /course-blocks/:id/enroll
to the public /checkout/create-session endpoint, with Vor-Ort default and
fallback to Stripe redirect when applicable.
"""

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/widgets/parent-course-widget.html'
src = open(p, 'r', encoding='utf-8').read()

old = """  try {
    await api(`/course-blocks/${checkoutBlockId}/enroll`, {
      method: 'POST',
      body: JSON.stringify({
        child: checkoutData.child,
        parent: checkoutData.parent,
        parentId: currentParentId || undefined,
      }),
    })

    checkoutStep = 3
    renderCheckoutStep()
    // Reload course blocks to update availability
    loadCourseBlocks()
  } catch (e) {
    showToast(e.message || 'Fehler bei der Buchung. Bitte versuche es erneut.', true)
    if (submitBtn) {
      submitBtn.disabled = false
      submitBtn.textContent = 'Erneut versuchen'
    }
  }
}"""

new = """  try {
    // Public booking endpoint (no auth required) — uses /api/checkout/create-session.
    // It accepts {slug, activityId, blockId, child, parent, paymentMethod, bookedDate}
    // and returns either {success, bookingId} for onsite or {success, redirect} for Stripe/PayPal.
    const activityId = checkoutBlock && checkoutBlock.activityId
    if (!activityId) throw new Error('Kursdaten unvollständig')
    const child = {
      firstName: checkoutData.child.firstName,
      lastName: checkoutData.child.lastName,
      birthYear: parseInt(checkoutData.child.birthYear, 10) || new Date().getFullYear(),
    }
    const paymentMethod = checkoutData.paymentMethod || 'onsite'
    const resp = await fetch(API_BASE + '/checkout/create-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: PROVIDER_SLUG,
        activityId: activityId,
        blockId: checkoutBlockId,
        child: child,
        parent: checkoutData.parent,
        paymentMethod: paymentMethod,
        bookedDate: checkoutData.bookedDate || undefined,
      }),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      throw new Error(data.error || ('Fehler ' + resp.status))
    }
    if (data.redirect) {
      // Stripe / PayPal flow → leave widget for hosted checkout
      window.location.href = data.redirect
      return
    }
    checkoutStep = 3
    renderCheckoutStep()
    loadCourseBlocks()
  } catch (e) {
    showToast(e.message || 'Fehler bei der Buchung. Bitte versuche es erneut.', true)
    if (submitBtn) {
      submitBtn.disabled = false
      submitBtn.textContent = 'Erneut versuchen'
    }
  }
}"""

if old not in src:
    print('FAIL: submitCheckout body not found'); exit(1)
src = src.replace(old, new, 1)

open(p, 'w', encoding='utf-8').write(src)
print('OK: submitCheckout patched to use public /checkout/create-session')
