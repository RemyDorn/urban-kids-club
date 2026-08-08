"""Add bodyExtraHtml support to ukcShowDetailModal."""

fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
src = open(fp, 'r', encoding='utf-8').read()

old = "+ '<div class=\"ukc-detail-body\">' + rowsHtml + '</div>'"
new = "+ '<div class=\"ukc-detail-body\">' + rowsHtml + (opts.bodyExtraHtml || '') + '</div>'"

if old not in src:
    print('FAIL: ukc-detail-body anchor not found'); exit(1)
src = src.replace(old, new, 1)
open(fp, 'w', encoding='utf-8').write(src)
print('OK: bodyExtraHtml support added to ukcShowDetailModal')
