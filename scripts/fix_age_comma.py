"""Fix the missing trailing comma after ageRange IIFE in variant B builder
(introduced by patch_addup_quickfixes.py - rstrip stripped the comma).
"""
fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
src = open(fp, 'r', encoding='utf-8').read()

# Find the broken sequence: ...})()\n          schedule:
# (no comma between IIFE close and next field)
broken = "return { min: Math.min(pmin.val, pmax.val), max: Math.max(pmin.val, pmax.val), unit: unit };\n          })()\n          schedule:"
fixed  = "return { min: Math.min(pmin.val, pmax.val), max: Math.max(pmin.val, pmax.val), unit: unit };\n          })(),\n          schedule:"

count = src.count(broken)
if count == 0:
    print('NOT FOUND — maybe already fixed')
else:
    src = src.replace(broken, fixed)
    open(fp, 'w', encoding='utf-8').write(src)
    print('FIXED:', count, 'occurrence(s)')
