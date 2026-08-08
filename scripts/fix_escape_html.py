"""Repair the broken escapeHtml fallback (apostrophe key collided with the
surrounding single-quoted string)."""

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
src = open(p, 'r', encoding='utf-8').read()

old = "var escapeHtml = window.escapeHtml || function(str) { return String(str==null?'':str).replace(/[&<>\"']/g, function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',''':'&#39;'})[c]; }); };"

new = "var escapeHtml = window.escapeHtml || function(str) { var m={'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}; m[String.fromCharCode(39)]='&#39;'; return String(str==null?'':str).replace(/[&<>\"']/g, function(c){ return m[c] || c; }); };"

if old not in src:
    print('FAIL: broken escapeHtml line not found'); exit(1)
src = src.replace(old, new, 1)
open(p, 'w', encoding='utf-8').write(src)
print('OK: escapeHtml fallback repaired')
