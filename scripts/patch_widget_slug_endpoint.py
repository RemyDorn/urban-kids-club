"""Patch parent-course-widget.html:
1. Auto-detect provider slug from /widget/<slug> URL pathname
2. Use public /api/widget/providers/:slug/course-blocks (no auth)
3. Unwrap {data:[...]} response shape
"""
import re

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/widgets/parent-course-widget.html'
src = open(p, 'r', encoding='utf-8').read()

# Patch 1: PROVIDER_SLUG detection
old1 = "const PROVIDER_SLUG = window.UKC_PROVIDER_SLUG || ''"
new1 = """const PROVIDER_SLUG = (function() {
  if (window.UKC_PROVIDER_SLUG) return window.UKC_PROVIDER_SLUG;
  var params = new URLSearchParams(window.location.search);
  if (params.get('provider')) return params.get('provider');
  var m = window.location.pathname.match(/^\\/widget\\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : '';
})()"""

if old1 not in src:
    print('FAIL: PROVIDER_SLUG line not found'); exit(1)
src = src.replace(old1, new1, 1)

# Patch 2 + 3: switch to public endpoint AND unwrap data
old2 = """    const blocks = await api(`/providers/${PROVIDER_SLUG}/course-blocks`)
    clearTimeout(loadingTimeout)
    loading.style.display = 'none'

    const visible = blocks.filter(b => b.status === 'active' || b.status === 'upcoming')"""

new2 = """    const blocksRes = await api(`/widget/providers/${PROVIDER_SLUG}/course-blocks`)
    clearTimeout(loadingTimeout)
    loading.style.display = 'none'
    const blocks = Array.isArray(blocksRes) ? blocksRes : (blocksRes.data || [])
    const visible = blocks.filter(b => b.status === 'active' || b.status === 'upcoming')"""

if old2 not in src:
    print('FAIL: course-blocks consumer block not found')
    exit(1)
src = src.replace(old2, new2, 1)

open(p, 'w', encoding='utf-8').write(src)
print('OK: widget patched (slug auto-detect + public endpoint + data unwrap)')
