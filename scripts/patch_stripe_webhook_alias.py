"""Add a Stripe webhook URL alias /api/stripe/webhook so both URLs hit the same
handler (Stripe Dashboard has /api/stripe/webhook registered, code listens on
/api/webhooks/stripe). Atomic single-file patch.
"""

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/api/routes/public.ts'
src = open(p, 'r', encoding='utf-8').read()

old = """  // Stripe Webhook
  router.post('/api/webhooks/stripe', async (req, res) => {"""
new = """  // Stripe Webhook — register both legacy URL (/api/webhooks/stripe) and the
  // URL Stripe Dashboard already has registered (/api/stripe/webhook).
  router.post('/api/stripe/webhook', stripeWebhookHandler)
  router.post('/api/webhooks/stripe', stripeWebhookHandler)
  async function stripeWebhookHandler(req: any, res: any) {"""

if old not in src:
    print('FAIL: webhook handler signature not found'); exit(1)
src = src.replace(old, new, 1)

# Original handler ended with `})` at end of router.post(...). After our rename
# it is now an async function declaration, which must end with `}` (no closing
# paren). Find the matching closing brace of the original arrow-function body.
# Strategy: the original closing was at end of the giant block ending in
# `\n  })\n` — we locate the FIRST `\n  })\n` after our new function start.
marker_start = src.index("async function stripeWebhookHandler(req: any, res: any) {")
# The original handler's terminator we now need to fix is the FIRST `\n  })\n`
# after marker_start.
needle = "\n  })\n"
idx = src.index(needle, marker_start)
src = src[:idx] + "\n  }\n" + src[idx + len(needle):]

open(p, 'w', encoding='utf-8').write(src)
print('OK: webhook alias added, handler converted to named async function')
