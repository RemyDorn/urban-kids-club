// ============================================================
// HTTP Server – Provider Dashboard API + Frontend
// ============================================================

import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router } from './router'
import { registerRoutes } from './routes'

const PORT = parseInt(process.env.PORT ?? '3000')
const __dirname = dirname(fileURLToPath(import.meta.url))
const USE_SUPABASE = process.env.USE_SUPABASE === 'true'

// ============================================================
// Persistence: Nur im In-Memory-Modus
// ============================================================
let hasPersistedData = false

if (!USE_SUPABASE) {
  const { loadFromDisk, startAutoSave } = await import('../domain/persistence')
  const { seedDemoData } = await import('./seed')

  const loadResult = loadFromDisk()
  hasPersistedData = loadResult.success && loadResult.entries > 0

  if (hasPersistedData) {
    console.log(`[Server] ${loadResult.entries} Einträge aus Disk geladen – überspringe Demo-Daten.`)
  } else {
    // Nur Demo-Daten laden wenn keine persistierten Daten vorhanden
    seedDemoData()
    console.log('[Server] Demo-Daten geladen (keine persistierten Daten gefunden).')
  }

  // Auto-Save starten (alle 30 Sek oder via SAVE_INTERVAL env)
  startAutoSave()
} else {
  console.log('[Server] Supabase-Modus – Persistence deaktiviert')
}

// Dashboard HTML laden
let dashboardHtml: string
try {
  dashboardHtml = readFileSync(resolve(__dirname, '../frontend/dashboard.html'), 'utf-8')
} catch {
  dashboardHtml = '<html><body><h1>Frontend not found</h1></body></html>'
}

// Admin HTML laden
let adminHtml: string
try {
  adminHtml = readFileSync(resolve(__dirname, '../frontend/admin.html'), 'utf-8')
} catch {
  adminHtml = '<html><body><h1>Admin not found</h1></body></html>'
}

// Widget HTML laden
let parentWidgetHtml: string
try {
  parentWidgetHtml = readFileSync(resolve(__dirname, '../widgets/parent-course-widget.html'), 'utf-8')
} catch {
  parentWidgetHtml = '<html><body><h1>Widget not found</h1></body></html>'
}

// Router erstellen und Routen registrieren
const router = new Router()
registerRoutes(router)

// Embed HTML generator for public iframe widgets
function generateEmbedHtml(slug: string, type: string, _url: string): string {
  const apiBase = '' // relative to same origin
  const brandColor = '#B5533A'

  if (type === 'calendar') {
    return `<!DOCTYPE html>
<html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kurskalender</title>
<link href="https://cdn.jsdelivr.net/npm/tailwindcss@3/dist/tailwind.min.css" rel="stylesheet">
<style>
  body{margin:0;font-family:Inter,system-ui,sans-serif;background:#fff}
  .cal-slot{padding:8px 12px;border-left:4px solid ${brandColor};background:#FFF9F5;border-radius:8px;margin-bottom:8px}
  .day-header{font-weight:700;color:#3C2225;font-size:14px;margin-bottom:6px;margin-top:16px}
  .time{font-size:12px;color:#64748B}.title{font-weight:600;color:#1f2937;font-size:14px}
  .meta{font-size:12px;color:#64748B;margin-top:2px}
  .empty{text-align:center;padding:40px;color:#64748B}
  .loading{text-align:center;padding:40px;color:#64748B}
</style>
</head><body>
<div id="app" class="p-4"><div class="loading">Kalender wird geladen...</div></div>
<script>
(async()=>{
  const slug='${slug}'
  const app=document.getElementById('app')
  try{
    const r=await fetch('${apiBase}/api/providers/by-slug/'+slug+'/activities')
    if(!r.ok){app.innerHTML='<div class="empty">Kein Anbieter gefunden.</div>';return}
    const{data}=await r.json()
    const published=data.filter(a=>a.status==='published'&&a.schedule)
    if(!published.length){app.innerHTML='<div class="empty">Aktuell keine Kurse verf\\u00fcgbar.</div>';return}
    const days=['MO','DI','MI','DO','FR','SA','SO']
    const dayNames={MO:'Montag',DI:'Dienstag',MI:'Mittwoch',DO:'Donnerstag',FR:'Freitag',SA:'Samstag',SO:'Sonntag',
      TU:'Dienstag',WE:'Mittwoch',TH:'Donnerstag',SU:'Sonntag'}
    const byDay={}
    published.forEach(a=>{
      if(a.schedule.type==='recurring'&&a.schedule.slots){
        a.schedule.slots.forEach(s=>{
          const d=s.day;if(!byDay[d])byDay[d]=[]
          byDay[d].push({title:a.title,start:s.startTime,end:s.endTime,cat:a.category,age:a.ageRange?.min+'-'+a.ageRange?.max+' J.',price:a.pricing?.[0]?.amount?((a.pricing[0].amount/100).toFixed(0)+'\\u20ac'):'',color:a.color||'${brandColor}'})
        })
      }
    })
    let html=''
    days.forEach(d=>{
      if(!byDay[d]||!byDay[d].length)return
      html+='<div class="day-header">'+(dayNames[d]||d)+'</div>'
      byDay[d].sort((a,b)=>a.start.localeCompare(b.start)).forEach(ev=>{
        html+='<div class="cal-slot" style="border-color:'+ev.color+'"><div class="title">'+ev.title+'</div><div class="time">'+ev.start+' \\u2013 '+ev.end+' Uhr</div><div class="meta">'+[ev.cat,ev.age,ev.price].filter(Boolean).join(' \\u00b7 ')+'</div></div>'
      })
    })
    app.innerHTML=html||'<div class="empty">Aktuell keine Kurse verf\\u00fcgbar.</div>'
  }catch(e){app.innerHTML='<div class="empty">Fehler beim Laden.</div>'}
})()
</script></body></html>`
  }

  if (type === 'courses') {
    return `<!DOCTYPE html>
<html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kursliste</title>
<style>
  body{margin:0;font-family:Inter,system-ui,sans-serif;background:#fff}
  .course{padding:16px;border:1px solid #F2E6E2;border-radius:12px;margin-bottom:12px}
  .course-title{font-weight:700;color:#3C2225;font-size:16px}
  .course-meta{font-size:13px;color:#64748B;margin-top:4px}
  .badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:#FFEFE1;color:${brandColor}}
  .empty{text-align:center;padding:40px;color:#64748B}
</style>
</head><body>
<div id="app" style="padding:16px"><div style="text-align:center;padding:40px;color:#64748B">Wird geladen...</div></div>
<script>
(async()=>{
  const slug='${slug}'
  const app=document.getElementById('app')
  try{
    const r=await fetch('${apiBase}/api/providers/by-slug/'+slug+'/activities')
    if(!r.ok){app.innerHTML='<div class="empty">Kein Anbieter gefunden.</div>';return}
    const{data}=await r.json()
    const published=data.filter(a=>a.status==='published')
    if(!published.length){app.innerHTML='<div class="empty">Aktuell keine Kurse.</div>';return}
    app.innerHTML=published.map(a=>'<div class="course"><div class="course-title">'+a.title+'</div><div class="course-meta"><span class="badge">'+a.category+'</span> '+(a.ageRange?.min||'?')+'-'+(a.ageRange?.max||'?')+' Jahre \\u00b7 '+(a.duration||'?')+' Min.'+(a.pricing?.[0]?.amount?' \\u00b7 '+(a.pricing[0].amount/100).toFixed(0)+'\\u20ac':'')+'</div>'+(a.description?'<p style="font-size:13px;color:#3C2225;margin-top:8px">'+a.description.substring(0,150)+(a.description.length>150?'...':'')+'</p>':'')+'</div>').join('')
  }catch(e){app.innerHTML='<div class="empty">Fehler beim Laden.</div>'}
})()
</script></body></html>`
  }

  return `<!DOCTYPE html><html><body><p>Widget-Typ "${type}" nicht gefunden. Verfügbar: calendar, courses</p></body></html>`
}

// Server starten
const server = createServer((req, res) => {
  const url = req.url ?? '/'

  // Frontend: Root-URL → Dashboard HTML ausliefern
  const path = url.split('?')[0]
  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(dashboardHtml)
    return
  }

  // Admin Dashboard
  if (path === '/admin' || path === '/admin/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(adminHtml)
    return
  }

  // Embed: Public embeddable widgets (calendar, courses, etc.)
  if (path.startsWith('/embed/')) {
    const parts = path.split('/').filter(Boolean) // ['embed', slug, type]
    const slug = parts[1] || ''
    const embedType = parts[2] || 'calendar'
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(generateEmbedHtml(slug, embedType, url))
    return
  }

  // Widget: Parent-Course-Widget ausliefern
  if (url.startsWith('/widget/')) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      // No X-Frame-Options header = allow embedding from any origin
      // Content-Security-Policy can restrict if needed later
    })
    res.end(parentWidgetHtml)
    return
  }

  // POST/PUT/PATCH/DELETE → markDirty für Auto-Save (nur im In-Memory-Modus)
  if (!USE_SUPABASE && req.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    // Nach Response markieren wir dirty
    const origEnd = res.end.bind(res)
    res.end = function (...args: Parameters<typeof res.end>) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        import('../domain/persistence').then(({ markDirty }) => markDirty())
      }
      return origEnd(...args)
    } as typeof res.end
  }

  // Alles andere → API Router
  router.handle(req, res)
})

const modeLabel = USE_SUPABASE ? 'Supabase' : 'In-Memory'

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
┌─────────────────────────────────────────────────┐
│  Urban Kids Club – Provider Dashboard           │
│  http://0.0.0.0:${PORT}                           │
│                                                 │
│  Dashboard: http://localhost:${PORT}               │
│  API:       http://localhost:${PORT}/api/health    │
│  Widget:    http://localhost:${PORT}/widget/       │
│                                                 │
│  Modus:      ${modeLabel.padEnd(35)}│
│  Persistence: ${USE_SUPABASE ? 'Supabase (extern)' : hasPersistedData ? 'Daten geladen' : 'Neuer Start (Demo-Daten)'}${' '.repeat(Math.max(0, 34 - (USE_SUPABASE ? 'Supabase (extern)' : hasPersistedData ? 'Daten geladen' : 'Neuer Start (Demo-Daten)').length))}│
│  Auto-Save:  ${USE_SUPABASE ? 'n/a (Supabase)' : 'aktiv'}${' '.repeat(Math.max(0, 35 - (USE_SUPABASE ? 'n/a (Supabase)' : 'aktiv').length))}│
└─────────────────────────────────────────────────┘
  `)
})
