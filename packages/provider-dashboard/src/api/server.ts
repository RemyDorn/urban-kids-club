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
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;background:transparent;color:#1f2937}
.cal-wrap{max-width:420px;margin:0 auto;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);background:#fff;border:1px solid #f0ebe8}
.cal-header{display:flex;align-items:center;justify-content:space-between;padding:20px 24px 16px;background:linear-gradient(135deg,#3C2225 0%,#5a3538 100%)}
.cal-header h2{font-size:17px;font-weight:700;color:#fff;letter-spacing:-0.3px}
.cal-header button{width:32px;height:32px;border-radius:8px;border:none;background:rgba(255,255,255,0.15);color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s}
.cal-header button:hover{background:rgba(255,255,255,0.25)}
.cal-days{display:grid;grid-template-columns:repeat(7,1fr);padding:12px 16px 4px;gap:0}
.cal-days span{text-align:center;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;padding:4px 0}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);padding:0 16px 12px;gap:4px}
.cal-cell{position:relative;aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:12px;cursor:default;font-size:14px;font-weight:500;color:#64748b;transition:all 0.2s}
.cal-cell.other{color:#d1d5db}
.cal-cell.today{background:#FFF9F5;font-weight:700;color:#3C2225}
.cal-cell.has-course{cursor:pointer;color:#1f2937;font-weight:600}
.cal-cell.has-course:hover{background:${brandColor}12;transform:scale(1.08)}
.cal-cell.has-course .dot{width:6px;height:6px;border-radius:50%;background:${brandColor};margin-top:3px}
.cal-cell.selected{background:${brandColor};color:#fff;border-radius:12px;transform:scale(1.05);box-shadow:0 2px 8px ${brandColor}40}
.cal-cell.selected .dot{background:#fff}
.cal-cell.past{color:#d1d5db}
.cal-cell.past .dot{background:#d1d5db}
.slots-panel{padding:0 20px 20px;animation:slideUp 0.25s ease}
@keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.slots-date{font-size:13px;font-weight:600;color:#64748b;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.3px}
.slot-card{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;border:1px solid #f0ebe8;margin-bottom:8px;transition:all 0.2s;background:#fff}
.slot-card:hover{border-color:${brandColor};background:#FFF9F5;transform:translateX(4px)}
.slot-time{min-width:80px;font-size:13px;font-weight:700;color:${brandColor}}
.slot-info{flex:1}
.slot-title{font-size:14px;font-weight:600;color:#1f2937}
.slot-meta{font-size:12px;color:#94a3b8;margin-top:2px}
.slot-badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;background:${brandColor}15;color:${brandColor}}
.empty-state{text-align:center;padding:24px;color:#94a3b8;font-size:13px}
.book-btn{padding:8px 16px;border-radius:8px;border:none;background:${brandColor};color:#fff;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s;letter-spacing:0.3px}
.book-btn:hover{opacity:0.85;transform:scale(1.03)}
.book-modal{position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:100;animation:fadeIn 0.2s}
.book-modal-inner{background:#fff;border-radius:16px;padding:24px;max-width:360px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.15)}
.book-modal h3{font-size:16px;font-weight:700;color:#1f2937;margin-bottom:4px}
.book-modal p{font-size:13px;color:#64748b;margin-bottom:16px}
.book-modal input,.book-modal textarea{width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;font-family:inherit;margin-bottom:10px;outline:none;transition:border 0.2s}
.book-modal input:focus,.book-modal textarea:focus{border-color:${brandColor}}
.book-modal .btn-row{display:flex;gap:8px;margin-top:4px}
.book-modal .btn-send{flex:1;padding:10px;border:none;border-radius:10px;background:${brandColor};color:#fff;font-weight:600;font-size:13px;cursor:pointer;transition:opacity 0.2s}
.book-modal .btn-send:hover{opacity:0.85}
.book-modal .btn-cancel{padding:10px 16px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#64748b;font-size:13px;cursor:pointer}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.powered{text-align:center;padding:8px;font-size:10px;color:#c4b5ab}
.powered a{color:#94a3b8;text-decoration:none}
</style>
</head><body>
<div id="app"><div style="text-align:center;padding:60px;color:#94a3b8;font-size:13px">Wird geladen...</div></div>
<script>
(async()=>{
const slug='${slug}',app=document.getElementById('app'),BC='${brandColor}'
function esc(s){if(!s)return'';const d=document.createElement('div');d.textContent=s;return d.innerHTML}
const DN={MO:1,TU:2,WE:3,TH:4,FR:5,SA:6,SU:0,DI:2,MI:3,DO:4,SO:0}
const ML=['Januar','Februar','M\\u00e4rz','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
const DL=['Mo','Di','Mi','Do','Fr','Sa','So']
const DLong=['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag']
let courses=[],curMonth=new Date().getMonth(),curYear=new Date().getFullYear(),selDate=null

try{
  const r=await fetch('/api/providers/by-slug/'+slug+'/activities')
  if(!r.ok){app.innerHTML='<div class="empty-state">Anbieter nicht gefunden.</div>';return}
  const{data}=await r.json()
  courses=data.filter(a=>a.status==='published'&&a.schedule?.slots)
  if(!courses.length){app.innerHTML='<div class="empty-state">Aktuell keine Kurse verf\\u00fcgbar.</div>';return}
  render()
}catch(e){app.innerHTML='<div class="empty-state">Fehler beim Laden.</div>'}

function fmtD(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function getCoursesForDate(d){
  const dow=d.getDay(),ds=fmtD(d),res=[]
  courses.forEach(a=>{
    if(a.schedule.type!=='recurring')return
    const sd=a.schedule.startDate||'',ed=a.schedule.endDate||'9999-12-31'
    if(ds<sd||ds>ed)return
    a.schedule.slots.forEach(s=>{
      if(DN[s.day]===dow)res.push({title:a.title,start:s.startTime,end:s.endTime,cat:a.category,age:(a.ageRange?.min||0)+'-'+(a.ageRange?.max||0)+' J.',price:a.pricing?.[0]?.amount?Math.round(a.pricing[0].amount/100)+'\\u20ac':'',color:a.color||BC,desc:a.description||''})
    })
  })
  return res.sort((a,b)=>a.start.localeCompare(b.start))
}
function render(){
  const today=new Date(),todayStr=fmtD(today)
  const first=new Date(curYear,curMonth,1)
  const startDay=(first.getDay()+6)%7
  const daysInMonth=new Date(curYear,curMonth+1,0).getDate()
  const prevDays=new Date(curYear,curMonth,0).getDate()
  let cells=''
  for(let i=startDay-1;i>=0;i--){cells+='<div class="cal-cell other">'+(prevDays-i)+'</div>'}
  for(let d=1;d<=daysInMonth;d++){
    const dt=new Date(curYear,curMonth,d),ds=fmtD(dt)
    const evts=getCoursesForDate(dt)
    const isPast=ds<todayStr
    const isToday=ds===todayStr
    const isSel=selDate===ds
    const cls=['cal-cell']
    if(isPast)cls.push('past')
    if(isToday)cls.push('today')
    if(evts.length&&!isPast)cls.push('has-course')
    if(isSel)cls.push('selected')
    const dot=evts.length?'<div class="dot"></div>':''
    const click=evts.length&&!isPast?' onclick="window._selectDay(\\'' +ds+ '\\')"':''
    cells+='<div class="'+cls.join(' ')+'"'+click+'>'+d+dot+'</div>'
  }
  const remaining=7-((startDay+daysInMonth)%7)
  if(remaining<7){for(let i=1;i<=remaining;i++){cells+='<div class="cal-cell other">'+i+'</div>'}}
  let slotsHtml=''
  if(selDate){
    const sd=new Date(+selDate.split('-')[0],+selDate.split('-')[1]-1,+selDate.split('-')[2])
    const dayName=DLong[(sd.getDay()+6)%7]
    const evts=getCoursesForDate(sd)
    slotsHtml='<div class="slots-panel"><div class="slots-date">'+dayName+', '+sd.getDate()+'. '+ML[sd.getMonth()]+'</div>'
    if(evts.length){
      slotsHtml+=evts.map(e=>'<div class="slot-card"><div class="slot-time">'+esc(e.start)+' Uhr</div><div class="slot-info"><div class="slot-title">'+esc(e.title)+'</div><div class="slot-meta">'+esc(e.start)+' \\u2013 '+esc(e.end)+' Uhr \\u00b7 <span class="slot-badge">'+esc(e.cat)+'</span> \\u00b7 '+esc(e.age)+(e.price?' \\u00b7 '+esc(e.price):'')+'</div></div><button class="book-btn" data-title="'+esc(e.title)+'" data-date="'+selDate+'" data-time="'+esc(e.start)+'" onclick="window._bookCourse(this.dataset.title,this.dataset.date,this.dataset.time)">Buchen</button></div>').join('')
    }else{slotsHtml+='<div class="empty-state">Keine Kurse an diesem Tag.</div>'}
    slotsHtml+='</div>'
  }
  app.innerHTML='<div class="cal-wrap"><div class="cal-header"><button onclick="window._navMonth(-1)">\\u2039</button><h2>'+ML[curMonth]+' '+curYear+'</h2><button onclick="window._navMonth(1)">\\u203a</button></div><div class="cal-days">'+DL.map(d=>'<span>'+d+'</span>').join('')+'</div><div class="cal-grid">'+cells+'</div>'+slotsHtml+'<div class="powered">Powered by <a href="https://urbankids.club" target="_blank">Urban Kids Club</a></div></div>'
}
window._navMonth=function(dir){curMonth+=dir;if(curMonth>11){curMonth=0;curYear++}if(curMonth<0){curMonth=11;curYear--};selDate=null;render()}
window._selectDay=function(ds){selDate=selDate===ds?null:ds;render()}
window._bookCourse=function(title,date,time){
  const sd=new Date(+date.split('-')[0],+date.split('-')[1]-1,+date.split('-')[2])
  const dateStr=sd.getDate()+'. '+ML[sd.getMonth()]+' '+sd.getFullYear()
  const m=document.createElement('div');m.className='book-modal'
  m.onclick=function(e){if(e.target===m)m.remove()}
  m.innerHTML='<div class="book-modal-inner"><h3>'+title+'</h3><p>'+dateStr+' um '+time+' Uhr</p><input id="bkName" placeholder="Ihr Name" required><input id="bkEmail" type="email" placeholder="E-Mail-Adresse" required><input id="bkPhone" placeholder="Telefon (optional)"><textarea id="bkMsg" rows="2" placeholder="Nachricht (optional)"></textarea><div class="btn-row"><button class="btn-cancel" onclick="this.closest(\\'.book-modal\\').remove()">Abbrechen</button><button class="btn-send" id="bkSend">Anfrage senden</button></div></div>'
  document.body.appendChild(m)
  document.getElementById('bkSend').onclick=async function(){
    const name=document.getElementById('bkName').value.trim()
    const email=document.getElementById('bkEmail').value.trim()
    if(!name||!email){alert('Bitte Name und E-Mail ausf\\u00fcllen.');return}
    this.textContent='Wird gesendet...'
    this.disabled=true
    try{
      await fetch('/api/widget/booking-inquiry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:slug,course:title,date:date,time:time,name:name,email:email,phone:document.getElementById('bkPhone').value,message:document.getElementById('bkMsg').value})})
      m.querySelector('.book-modal-inner').innerHTML='<div style="text-align:center;padding:20px"><div style="font-size:32px;margin-bottom:12px">\\u2705</div><h3 style="color:#059669">Anfrage gesendet!</h3><p style="color:#64748b;margin-top:8px">Wir melden uns schnellstm\\u00f6glich bei Ihnen.</p><button class="btn-cancel" style="margin-top:16px" onclick="this.closest(\\'.book-modal\\').remove()">Schlie\\u00dfen</button></div>'
    }catch(e){alert('Fehler beim Senden. Bitte versuchen Sie es erneut.');this.textContent='Anfrage senden';this.disabled=false}
  }
}
// Apply URL customization params
const params=new URLSearchParams(window.location.search)
if(params.get('color')){document.documentElement.style.setProperty('--brand',params.get('color'));document.querySelectorAll('.cal-header').forEach(h=>{h.style.background='linear-gradient(135deg,'+params.get('color')+' 0%,'+params.get('color')+'cc 100%)'})}
if(params.get('radius')){document.querySelector('.cal-wrap').style.borderRadius=params.get('radius')}
if(params.get('font')){document.body.style.fontFamily=params.get('font')+',system-ui,sans-serif'}
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
