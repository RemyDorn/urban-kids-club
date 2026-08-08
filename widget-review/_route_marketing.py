from pathlib import Path
p = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/api/server.ts")
src = p.read_text()

if "/marketing-preview" in src:
    print("ALREADY EXISTS")
    raise SystemExit(0)

anchor = """  // Einstellungen Preview"""
if anchor not in src:
    print("ANCHOR NOT FOUND")
    raise SystemExit(1)

addition = """  // Marketing / Mom-Graph Preview
  if (path === '/marketing-preview' || path === '/marketing-preview/') {
    try {
      const html = readFileSync(resolve(__dirname, '../widgets/marketing-preview.html'), 'utf-8')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.statusCode = 200
      res.end(html)
    } catch (err) {
      res.statusCode = 500; res.end('Marketing preview not found')
    }
    return
  }

"""

src = src.replace(anchor, addition + anchor)
p.write_text(src)
print("OK, marketing route added")
