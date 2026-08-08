"""Patch parent-course-widget.html so booking modal uses already-loaded
block data from the public /widget/providers/:slug/course-blocks call instead
of the auth-protected /course-blocks/:id endpoint.
"""

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/widgets/parent-course-widget.html'
src = open(p, 'r', encoding='utf-8').read()

# 1) Cache blocks after first load. Find the line where `visible` is computed
#    and add a global cache entry alongside.
old1 = """    const blocks = Array.isArray(blocksRes) ? blocksRes : (blocksRes.data || [])
    const visible = blocks.filter(b => b.status === 'active' || b.status === 'upcoming')"""
new1 = """    const blocks = Array.isArray(blocksRes) ? blocksRes : (blocksRes.data || [])
    // Cache blocks for booking modal (public widget endpoint already returns enriched data)
    window._ukcBlockCache = window._ukcBlockCache || {}
    blocks.forEach(b => { if (b && b.id) window._ukcBlockCache[b.id] = b })
    const visible = blocks.filter(b => b.status === 'active' || b.status === 'upcoming')"""
if old1 not in src:
    print('FAIL: blocks list line not found'); exit(1)
src = src.replace(old1, new1, 1)

# 2) loadCheckoutBlock: prefer cache over auth-protected endpoint
old2 = """  try {
    checkoutBlock = await api(`/course-blocks/${blockId}`)
    // Check for sibling discount: if parent has other active enrollments
    checkoutSiblingDiscount = 0
    if (currentParentId) {"""
new2 = """  try {
    // Prefer client-side cache (populated by loadCourseBlocks via public widget endpoint)
    const cached = (window._ukcBlockCache && window._ukcBlockCache[blockId]) || null
    if (cached) {
      checkoutBlock = cached
    } else {
      checkoutBlock = await api(`/course-blocks/${blockId}`)
    }
    // Unwrap {data: ...} response shape if api() returned a wrapper
    if (checkoutBlock && checkoutBlock.data && !checkoutBlock.id) checkoutBlock = checkoutBlock.data
    // Check for sibling discount: if parent has other active enrollments
    checkoutSiblingDiscount = 0
    if (currentParentId) {"""
if old2 not in src:
    print('FAIL: loadCheckoutBlock try-block not found'); exit(1)
src = src.replace(old2, new2, 1)

open(p, 'w', encoding='utf-8').write(src)
print('OK: widget block-cache patched')
