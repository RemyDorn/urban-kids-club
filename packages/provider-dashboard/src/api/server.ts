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

// Portal HTML laden
let portalHtml: string
try {
  portalHtml = readFileSync(resolve(__dirname, '../frontend/portal.html'), 'utf-8')
} catch {
  portalHtml = '<html><body><h1>Portal not found</h1></body></html>'
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
  // Sanitize slug to prevent XSS — only allow alphanumeric, hyphens, underscores
  slug = slug.replace(/[^a-zA-Z0-9_-]/g, '')
  const apiBase = '' // relative to same origin
  const brandColor = '#B5533A'

  if (type === 'booking-success') {
    return `<!DOCTYPE html>
<html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff}
.success{text-align:center;padding:40px;max-width:400px}
.check{width:64px;height:64px;border-radius:50%;background:#059669;color:#fff;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 20px;animation:pop 0.4s ease}
@keyframes pop{0%{transform:scale(0)}50%{transform:scale(1.2)}100%{transform:scale(1)}}
h2{color:#1f2937;font-size:20px;margin-bottom:8px}
p{color:#64748b;font-size:14px;line-height:1.6}
</style>
</head><body>
<div class="success">
  <div class="check">✓</div>
  <h2>Buchung bestätigt!</h2>
  <p>Vielen Dank für Ihre Buchung. Sie erhalten in Kürze eine Bestätigung per E-Mail.</p>
</div>
<div id="conversion-pixels"></div>
</body></html>`
  }

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
const ML=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
const DL=['Mo','Di','Mi','Do','Fr','Sa','So']
const DLong=['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag']
let courses=[],curMonth=new Date().getMonth(),curYear=new Date().getFullYear(),selDate=null

try{
  const r=await fetch('/api/providers/by-slug/'+slug+'/activities')
  if(!r.ok){app.innerHTML='<div class="empty-state">Anbieter nicht gefunden.</div>';return}
  const{data}=await r.json()
  courses=data.filter(a=>a.status==='published'&&a.schedule?.slots)
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
      if(DN[s.day]===dow){
        // Check if any block covers this specific date
        const hasBlockForDate=(a.blockDateRanges||[]).some(r=>ds>=r.start&&ds<=r.end)
        res.push({title:a.title,start:s.startTime,end:s.endTime,cat:a.category,age:(a.ageRange?.min||0)+'-'+(a.ageRange?.max||0)+' J.',price:a.pricing?.[0]?.amount?a.pricing[0].amount.toFixed(0)+'€':'',color:a.color||BC,desc:a.description||'',hasActiveBlock:hasBlockForDate})
      }
    })
  })
  // Deduplicate: same title+start+end on same date
  const seen=new Set()
  return res.filter(e=>{const k=e.title+e.start+e.end;if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>a.start.localeCompare(b.start))
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
      slotsHtml+=evts.map(e=>{
        const hasBlock=e.hasActiveBlock
        if (hasBlock) {
          return '<div class="slot-card"><div class="slot-time">'+esc(e.start)+' Uhr</div><div class="slot-info"><div class="slot-title">'+esc(e.title)+'</div><div class="slot-meta">'+esc(e.start)+' – '+esc(e.end)+' Uhr · <span class="slot-badge">'+esc(e.cat)+'</span> · '+esc(e.age)+(e.price?' · '+esc(e.price):'')+'</div></div><button class="book-btn" data-title="'+esc(e.title)+'" data-date="'+selDate+'" data-time="'+esc(e.start)+'" onclick="window._bookCourse(this.dataset.title,this.dataset.date,this.dataset.time)">Buchen</button></div>'
        } else {
          return '<div class="slot-card"><div class="slot-time">'+esc(e.start)+' Uhr</div><div class="slot-info"><div class="slot-title">'+esc(e.title)+'</div><div class="slot-meta">'+esc(e.start)+' – '+esc(e.end)+' Uhr · <span class="slot-badge">'+esc(e.cat)+'</span> · '+esc(e.age)+'</div></div><button class="book-btn" style="background:#6b7280" data-title="'+esc(e.title)+'" data-date="'+selDate+'" onclick="window._waitlistCourse(this.dataset.title,this.dataset.date)">Warteliste</button></div>'
        }
      }).join('')
    }else{slotsHtml+='<div class="empty-state">Keine Kurse an diesem Tag.</div>'}
    slotsHtml+='</div>'
  }
  app.innerHTML='<div class="cal-wrap"><div class="cal-header"><button onclick="window._navMonth(-1)">‹</button><h2>'+ML[curMonth]+' '+curYear+'</h2><button onclick="window._navMonth(1)">›</button></div><div class="cal-days">'+DL.map(d=>'<span>'+d+'</span>').join('')+'</div><div class="cal-grid">'+cells+'</div>'+slotsHtml+'<div class="powered">Powered by <a href="https://urbankids.club" target="_blank">Urban Kids Club</a></div></div>'
}
window._navMonth=function(dir){curMonth+=dir;if(curMonth>11){curMonth=0;curYear++}if(curMonth<0){curMonth=11;curYear--};selDate=null;render()}
window._selectDay=function(ds){selDate=selDate===ds?null:ds;render()}
window._waitlistCourse=async function(title,date){
  const sd=new Date(+date.split('-')[0],+date.split('-')[1]-1,+date.split('-')[2])
  const dateStr=sd.getDate()+'. '+ML[sd.getMonth()]+' '+sd.getFullYear()
  const course=courses.find(c=>c.title===title)
  if(!course){alert('Kurs nicht gefunden');return}
  window._wlActId=course.id
  window._wlTitle=title
  window._wlDate=dateStr
  // Use same multi-step booking UI but for waitlist
  var html='<div class="book-modal"><div class="book-modal-inner">'+
    '<h3>Warteliste</h3>'+
    '<p style="margin-bottom:16px;color:#64748b;font-size:13px">'+esc(title)+' — '+dateStr+'<br>Dieser Kurs hat aktuell noch keinen festen Termin. Trag dich gerne ein — wir geben dir Bescheid, sobald es losgeht!</p>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><input id="wlChildFirst" placeholder="Vorname Kind *"><input id="wlChildLast" placeholder="Nachname Kind *"></div>'+
    '<input id="wlChildYear" type="number" placeholder="Geburtsjahr Kind (z.B. 2019) *" min="2010" max="2025">'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><input id="wlParentFirst" placeholder="Vorname Elternteil *"><input id="wlParentLast" placeholder="Nachname Elternteil *"></div>'+
    '<input id="wlEmail" type="email" placeholder="E-Mail-Adresse *">'+
    '<input id="wlPhone" type="tel" placeholder="Telefon (optional)">'+
    '<div class="btn-row">'+
    '<button class="btn-send" onclick="window._submitWaitlist()">Auf Warteliste eintragen</button>'+
    '<button class="btn-cancel" onclick="var m=document.querySelector(String.fromCharCode(46,98,111,111,107,45,109,111,100,97,108));if(m)m.remove()">Abbrechen</button>'+
    '</div></div></div>'
  app.insertAdjacentHTML('beforeend',html)
}
window._submitWaitlist=async function(){
  var activityId=window._wlActId
  var f=function(s){var el=document.getElementById(s);return el?el.value.trim():''}
  var childFirst=f('wlChildFirst'),childLast=f('wlChildLast'),childYear=f('wlChildYear')
  var parentFirst=f('wlParentFirst'),parentLast=f('wlParentLast'),email=f('wlEmail'),phone=f('wlPhone')
  if(!childFirst||!childLast||!childYear||!parentFirst||!parentLast||!email){alert('Bitte alle Pflichtfelder ausfüllen');return}
  var btn=document.querySelector('.book-modal .btn-send')
  if(btn){btn.textContent='Wird eingetragen...';btn.disabled=true}
  try{
    var r=await fetch('/api/widget/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:slug,activityId:activityId,child:{firstName:childFirst,lastName:childLast,birthYear:parseInt(childYear)},parent:{firstName:parentFirst,lastName:parentLast,email:email,phone:phone}})})
    var data=await r.json()
    var modal=document.querySelector('.book-modal')
    if(modal)modal.remove()
    app.insertAdjacentHTML('beforeend','<div class="book-modal"><div class="book-modal-inner" style="text-align:center"><div style="font-size:48px;margin-bottom:12px">✅</div><h3>'+(data.alreadyExists?'Bereits eingetragen':'Auf der Warteliste!')+'</h3><p style="margin:12px 0;color:#64748b;font-size:13px">'+(data.alreadyExists?'Du bist bereits auf der Warteliste für diesen Kurs.':'Super! Wir benachrichtigen dich, sobald ein Kursblock verfügbar ist.')+'</p><button class="btn-send" onclick="var m=document.querySelector(String.fromCharCode(46,98,111,111,107,45,109,111,100,97,108));if(m)m.remove()">Alles klar</button></div></div>')
  }catch(e){alert('Verbindungsfehler');if(btn){btn.textContent='Auf Warteliste eintragen';btn.disabled=false}}
}
window._bookCourse=async function(title,date,time){
  const sd=new Date(+date.split('-')[0],+date.split('-')[1]-1,+date.split('-')[2])
  const dateStr=sd.getDate()+'. '+ML[sd.getMonth()]+' '+sd.getFullYear()
  window._checkoutDate=date // Store booked date (YYYY-MM-DD)

  // Find activity ID from courses array
  const course=courses.find(c=>c.title===title)
  if(!course){alert('Kurs nicht gefunden');return}

  // Fetch activity checkout details
  let actData
  try{
    const r=await fetch('/api/checkout/activity/'+course.id)
    actData=await r.json()
  }catch(e){alert('Fehler beim Laden der Kursdaten');return}

  const act=actData.activity
  const prov=actData.provider
  const cancel=actData.cancellation
  const price=act.pricing?.[0]?.amount||0
  const priceStr=price.toFixed(2).replace('.',',')+' €'
  const hasOnline=act.paymentOnline&&(prov.stripeConnected||prov.paypalConnected)
  const hasOnsite=act.paymentOnsite

  let step=1
  const m=document.createElement('div');m.className='book-modal'
  m.onclick=function(e){if(e.target===m)m.remove()}

  function renderStep(){
    let html='<div class="book-modal-inner" style="max-width:400px">'
    html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h3 style="font-size:16px;font-weight:700;color:#1f2937;margin:0">'+esc(title)+'</h3><button onclick="this.closest(\\'.book-modal\\').remove()" style="background:none;border:none;font-size:20px;color:#94a3b8;cursor:pointer">×</button></div>'
    html+='<p style="font-size:13px;color:#64748b;margin-bottom:16px">'+dateStr+' um '+esc(time)+' Uhr · '+priceStr+'</p>'

    // Progress bar
    const totalSteps=hasOnline&&hasOnsite?4:3
    html+='<div style="display:flex;gap:4px;margin-bottom:20px">'
    for(let i=1;i<=totalSteps;i++){
      html+='<div style="flex:1;height:3px;border-radius:2px;background:'+(i<=step?'${brandColor}':'#e2e8f0')+'"></div>'
    }
    html+='</div>'

    if(step===1){
      var ck=window._checkoutChild||{};var cp=window._checkoutParent||{}
      html+='<div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:12px">Kind</div>'
      html+='<div style="display:flex;gap:8px;margin-bottom:8px"><input id="ckFirst" placeholder="Vorname" value="'+(ck.firstName||'')+'" style="flex:1;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none" required><input id="ckLast" placeholder="Nachname" value="'+(ck.lastName||'')+'" style="flex:1;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none" required></div>'
      html+='<input id="ckYear" type="number" placeholder="Geburtsjahr (z.B. 2020)" value="'+(ck.birthYear||'')+'" min="2005" max="2026" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;margin-bottom:16px">'
      html+='<div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:12px">Elternteil</div>'
      html+='<div style="display:flex;gap:8px;margin-bottom:8px"><input id="cpFirst" placeholder="Vorname" value="'+(cp.firstName||'')+'" style="flex:1;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none" required><input id="cpLast" placeholder="Nachname" value="'+(cp.lastName||'')+'" style="flex:1;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none" required></div>'
      html+='<input id="cpEmail" type="email" placeholder="E-Mail" value="'+(cp.email||'')+'" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;margin-bottom:8px" required>'
      html+='<input id="cpPhone" type="tel" placeholder="Telefon" value="'+(cp.phone||'')+'" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;margin-bottom:16px" required>'
      html+='<button id="btnNext1" style="width:100%;padding:12px;border:none;border-radius:10px;background:${brandColor};color:#fff;font-weight:600;font-size:14px;cursor:pointer">Weiter</button>'
    }

    if(step===2&&hasOnline&&hasOnsite){
      html+='<button id="btnBack2" style="margin-bottom:12px;padding:6px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#64748b;font-size:12px;cursor:pointer">← Zurück</button>'
      html+='<div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:12px">Zahlungsart wählen</div>'
      if(hasOnline){
        html+='<button class="pay-opt" data-method="online" style="width:100%;padding:14px 16px;border:2px solid #e2e8f0;border-radius:12px;background:#fff;cursor:pointer;display:flex;align-items:center;gap:12px;margin-bottom:8px;transition:all 0.2s"><span style="font-size:24px">💳</span><div style="text-align:left"><div style="font-weight:600;font-size:14px;color:#1f2937">Jetzt online bezahlen</div><div style="font-size:12px;color:#64748b">'+(prov.stripeConnected?'Kreditkarte, Apple Pay':'')+(prov.stripeConnected&&prov.paypalConnected?' oder ':'')+(prov.paypalConnected?'PayPal':'')+'</div></div></button>'
      }
      if(hasOnsite){
        html+='<button class="pay-opt" data-method="onsite" style="width:100%;padding:14px 16px;border:2px solid #e2e8f0;border-radius:12px;background:#fff;cursor:pointer;display:flex;align-items:center;gap:12px;margin-bottom:8px;transition:all 0.2s"><span style="font-size:24px">🏠</span><div style="text-align:left"><div style="font-weight:600;font-size:14px;color:#1f2937">Vor Ort bezahlen</div><div style="font-size:12px;color:#64748b">Zahlung beim ersten Termin</div></div></button>'
      }
    }

    // AGB step (step 2 if only one payment method, step 3 if both)
    const agbStep=hasOnline&&hasOnsite?3:2
    if(step===agbStep){
      const payLabel=window._checkoutPayMethod==='onsite'?'Vor Ort bezahlen':'Online bezahlen ('+priceStr+')'
      html+='<button id="btnBackAgb" style="margin-bottom:12px;padding:6px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#64748b;font-size:12px;cursor:pointer">← Zurück</button>'
      html+='<div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:12px">Bestätigung</div>'
      const pkg=act.pricing?.[0]
      const pkgSize=pkg?.packageSize||0
      const pkgLabel=pkg?.label||''
      const slot=act.schedule?.slots?.[0]
      const dayMap={MO:'Montags',TU:'Dienstags',WE:'Mittwochs',TH:'Donnerstags',FR:'Freitags',SA:'Samstags',SU:'Sonntags'}
      const dayName=slot?dayMap[slot.day]||slot.day:''
      const duration=slot?(parseInt(slot.endTime)-parseInt(slot.startTime))*60+((parseInt(slot.endTime.split(':')[1])||0)-(parseInt(slot.startTime.split(':')[1])||0)):0
      let detailLines='<div>'+esc(title)+'</div>'
      detailLines+='<div style="color:#64748b">'+dateStr+' · '+esc(time)+' Uhr</div>'
      if(pkgSize>1){
        detailLines+='<div style="color:#64748b;margin-top:4px">'+pkgSize+' Termine · '+(dayName?dayName+' · ':'')+(slot?slot.startTime+'–'+slot.endTime+' Uhr':'')+'</div>'
        detailLines+='<div style="background:#FFF9F5;border:1px solid #F2E6E2;border-radius:8px;padding:8px 10px;margin-top:6px;font-size:12px;color:#92400e">Dieser Kurs umfasst <strong>'+pkgSize+' Termine</strong>'+(pkgLabel?' ('+esc(pkgLabel)+')':'')+ '. Der Gesamtpreis von <strong>'+priceStr+'</strong> gilt für alle '+pkgSize+' Termine.</div>'
      }
      detailLines+='<div style="font-weight:700;margin-top:6px">'+priceStr+'</div>'
      if(pkgSize>1){
        detailLines+='<div style="color:#64748b;font-size:12px;margin-top:6px">Falls du mal nicht kannst — kein Stress! Sag rechtzeitig Bescheid und wir verschieben deinen Termin.</div>'
      }
      html+='<div style="background:#f8fafc;border-radius:10px;padding:12px;margin-bottom:16px;font-size:13px;color:#374151">'+detailLines+'</div>'
      html+='<label style="display:flex;align-items:start;gap:8px;margin-bottom:10px;cursor:pointer"><input type="checkbox" id="agbCheck" style="margin-top:3px"><span style="font-size:12px;color:#374151">Ich stimme den <a href="#" style="color:${brandColor}">AGB</a> zu.</span></label>'
      if(cancel.custom_text){
        html+='<label style="display:flex;align-items:start;gap:8px;margin-bottom:16px;cursor:pointer"><input type="checkbox" id="stornoCheck" style="margin-top:3px"><span style="font-size:12px;color:#374151">'+esc(cancel.custom_text)+'</span></label>'
      }
      html+='<button id="btnSubmit" style="width:100%;padding:12px;border:none;border-radius:10px;background:${brandColor};color:#fff;font-weight:600;font-size:14px;cursor:pointer">'+(window._checkoutPayMethod==='onsite'?'Verbindlich buchen':'Kostenpflichtig buchen')+'</button>'
    }

    html+='</div>'
    m.innerHTML=html

    // Attach event handlers
    if(step===1){
      m.querySelector('#btnNext1').onclick=function(){
        const ckF=m.querySelector('#ckFirst').value.trim()
        const ckL=m.querySelector('#ckLast').value.trim()
        const ckY=m.querySelector('#ckYear').value
        const cpF=m.querySelector('#cpFirst').value.trim()
        const cpL=m.querySelector('#cpLast').value.trim()
        const cpE=m.querySelector('#cpEmail').value.trim()
        const cpP=m.querySelector('#cpPhone').value.trim()
        if(!ckF||!ckL||!ckY||!cpF||!cpL||!cpE||!cpP){alert('Bitte alle Felder ausfüllen.');return}
        window._checkoutChild={firstName:ckF,lastName:ckL,birthYear:parseInt(ckY)}
        window._checkoutParent={firstName:cpF,lastName:cpL,email:cpE,phone:cpP}
        if(!hasOnline){window._checkoutPayMethod='onsite'}
        else if(!hasOnsite){window._checkoutPayMethod='stripe'}
        step=2;renderStep()
      }
    }
    if(step===2&&hasOnline&&hasOnsite){
      var backBtn2=m.querySelector('#btnBack2')
      if(backBtn2) backBtn2.onclick=function(){step=1;renderStep()}
      m.querySelectorAll('.pay-opt').forEach(btn=>{
        btn.onmouseover=function(){this.style.borderColor='${brandColor}'}
        btn.onmouseout=function(){this.style.borderColor='#e2e8f0'}
        btn.onclick=function(){
          window._checkoutPayMethod=this.dataset.method==='online'?(prov.stripeConnected?'stripe':'paypal'):'onsite'
          step=3;renderStep()
        }
      })
    }
    var backBtnAgb=m.querySelector('#btnBackAgb')
    if(backBtnAgb) backBtnAgb.onclick=function(){step=step-1;renderStep()}
    if(step===agbStep){
      m.querySelector('#btnSubmit').onclick=async function(){
        if(!m.querySelector('#agbCheck').checked){alert('Bitte AGB akzeptieren.');return}
        if(cancel.custom_text&&!m.querySelector('#stornoCheck')?.checked){alert('Bitte Stornierungsbedingungen akzeptieren.');return}
        this.textContent='Wird verarbeitet...'
        this.disabled=true
        try{
          const r=await fetch('/api/checkout/create-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:slug,activityId:course.id,blockId:course.blockId||null,bookedDate:window._checkoutDate||null,child:window._checkoutChild,parent:window._checkoutParent,paymentMethod:window._checkoutPayMethod})})
          const data=await r.json()
          if(!r.ok){var errMsg=data.error||'Fehler beim Buchen';if(errMsg.includes('Warteliste')||errMsg.includes('warteliste')||errMsg.includes('voll')){m.querySelector('.book-modal-inner').innerHTML='<div style="text-align:center;padding:24px"><div style="width:56px;height:56px;border-radius:50%;background:#f59e0b;color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 16px">📋</div><h3 style="font-size:18px;font-weight:700;color:#1f2937;margin-bottom:8px">Auf der Warteliste!</h3><p style="font-size:13px;color:#64748b;line-height:1.6">'+errMsg+'</p><button onclick="this.closest(\\'.book-modal\\').remove()" style="margin-top:16px;padding:10px 24px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#374151;font-size:13px;cursor:pointer">Schließen</button></div>'}else{alert(errMsg);this.textContent='Erneut versuchen';this.disabled=false}return}
          if(data.redirect){window.top.location.href=data.redirect}
          else{m.querySelector('.book-modal-inner').innerHTML='<div style="text-align:center;padding:24px"><div style="width:56px;height:56px;border-radius:50%;background:#059669;color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 16px">✓</div><h3 style="font-size:18px;font-weight:700;color:#1f2937;margin-bottom:8px">Buchung bestätigt!</h3><p style="font-size:13px;color:#64748b">Vielen Dank! Sie erhalten eine Bestätigung per E-Mail.</p><button onclick="this.closest(\\'.book-modal\\').remove()" style="margin-top:16px;padding:10px 24px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#374151;font-size:13px;cursor:pointer">Schließen</button></div>'}
        }catch(e){alert('Netzwerkfehler');this.textContent='Erneut versuchen';this.disabled=false}
      }
    }
  }

  document.body.appendChild(m)
  renderStep()
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
  function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
  try{
    const r=await fetch('${apiBase}/api/providers/by-slug/'+slug+'/activities')
    if(!r.ok){app.innerHTML='<div class="empty">Kein Anbieter gefunden.</div>';return}
    const{data}=await r.json()
    const published=data.filter(a=>a.status==='published')
    if(!published.length){app.innerHTML='<div class="empty">Aktuell keine Kurse.</div>';return}
    app.innerHTML=published.map(a=>'<div class="course"><div class="course-title">'+esc(a.title)+'</div><div class="course-meta"><span class="badge">'+esc(a.category)+'</span> '+(a.ageRange?.min||'?')+'-'+(a.ageRange?.max||'?')+' Jahre · '+(a.duration||'?')+' Min.'+(a.pricing?.[0]?.amount?' · '+a.pricing[0].amount+'€':'')+'</div>'+(a.description?'<p style="font-size:13px;color:#3C2225;margin-top:8px">'+esc(a.description.substring(0,150))+(a.description.length>150?'...':'')+'</p>':'')+'</div>').join('')
  }catch(e){app.innerHTML='<div class="empty">Fehler beim Laden.</div>'}
})()
</script></body></html>`
  }

  return `<!DOCTYPE html><html><body><p>Widget-Typ "${type}" nicht gefunden. Verfügbar: calendar, courses</p></body></html>`
}

// QR Check-in Page – mobile-optimized two-step flow
function generateCheckinHtml(providerId: string): string {
  const safeId = providerId.replace(/[^a-zA-Z0-9-]/g, '')
  const rawUrl = process.env.APP_PUBLIC_URL || ''
  const apiBase = rawUrl.replace(/[^a-zA-Z0-9:/.@_-]/g, '')
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Check-in</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;min-height:100vh;background:linear-gradient(135deg,#faf9f8 0%,#f0ebe6 100%);display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#fff;border-radius:24px;box-shadow:0 8px 32px rgba(0,0,0,0.08);max-width:420px;width:100%;padding:40px 32px;text-align:center}
.logo{width:56px;height:56px;background:#D4956A;border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:28px;color:#fff}
h1{font-size:22px;color:#3C2225;margin-bottom:8px;font-weight:700}
.subtitle{color:#8B7355;font-size:14px;margin-bottom:28px}
.input-group{text-align:left;margin-bottom:16px}
.input-group label{display:block;font-size:13px;font-weight:500;color:#3C2225;margin-bottom:6px}
.input-group input[type=email]{width:100%;padding:14px 16px;border:2px solid #e8e0d8;border-radius:12px;font-size:16px;font-family:inherit;outline:none;transition:border-color .2s}
.input-group input[type=email]:focus{border-color:#D4956A}
.btn{width:100%;padding:16px;background:#D4956A;color:#fff;border:none;border-radius:14px;font-size:16px;font-weight:600;cursor:pointer;transition:background .2s;margin-top:8px;font-family:inherit}
.btn:hover{background:#c4854a}
.btn:disabled{background:#ccc;cursor:not-allowed}
.child-list{text-align:left;margin:20px 0}
.child-item{display:flex;align-items:center;gap:12px;padding:14px 16px;border:2px solid #e8e0d8;border-radius:14px;margin-bottom:10px;cursor:pointer;transition:all .2s}
.child-item:hover{border-color:#D4956A;background:#faf5f0}
.child-item.selected{border-color:#D4956A;background:#fdf4ed}
.child-item.already{border-color:#a7f3d0;background:#ecfdf5;cursor:default;opacity:.7}
.child-cb{width:22px;height:22px;border-radius:6px;border:2px solid #ccc;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px;transition:all .2s}
.child-item.selected .child-cb{background:#D4956A;border-color:#D4956A;color:#fff}
.child-item.already .child-cb{background:#059669;border-color:#059669;color:#fff}
.child-info{flex:1}
.child-name{font-weight:600;font-size:15px;color:#3C2225}
.child-course{font-size:13px;color:#8B7355;margin-top:2px}
.child-payment{font-size:12px;margin-top:4px}
.paid{color:#059669}.unpaid{color:#d97706}
.result-item{padding:16px;border-radius:14px;margin-bottom:10px;display:flex;align-items:center;gap:12px}
.result-ok{background:#ecfdf5;border:1px solid #a7f3d0}
.result-pay{background:#fffbeb;border:1px solid #fde68a}
.result-icon{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.result-ok .result-icon{background:#d1fae5;color:#059669}
.result-pay .result-icon{background:#fef3c7;color:#d97706}
.result-text{flex:1}
.result-text .title{font-weight:600;font-size:14px;color:#1f2937}
.result-text .detail{font-size:13px;color:#6b7280;margin-top:2px}
.error-msg{color:#ef4444;font-size:14px;margin-top:16px;padding:12px;background:#fef2f2;border-radius:10px}
.spinner{display:none;width:24px;height:24px;border:3px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin .6s linear infinite;margin:0 auto}
@keyframes spin{to{transform:rotate(360deg)}}
.footer{font-size:11px;color:#94a3b8;margin-top:24px}
</style></head><body>
<div class="card" id="card">

  <!-- Step 1: Email -->
  <div id="step1">
    <div class="logo">📋</div>
    <h1>Check-in</h1>
    <p class="subtitle">Gib deine E-Mail-Adresse ein</p>
    <form id="emailForm">
      <div class="input-group">
        <label for="email">E-Mail-Adresse</label>
        <input type="email" id="email" placeholder="deine@email.de" required autocomplete="email" inputmode="email">
      </div>
      <button type="submit" class="btn" id="lookupBtn">
        <span id="lookupText">Weiter</span>
        <div class="spinner" id="lookupSpinner"></div>
      </button>
    </form>
    <div id="lookupError"></div>
  </div>

  <!-- Step 2: Select children (hidden initially) -->
  <div id="step2" style="display:none">
    <div class="logo">👋</div>
    <h1>Willkommen!</h1>
    <p class="subtitle">Wähle aus, wen du einchecken möchtest</p>
    <div id="childList" class="child-list"></div>
    <button onclick="doCheckin()" class="btn" id="checkinBtn">
      <span id="checkinText">Einchecken</span>
      <div class="spinner" id="checkinSpinner"></div>
    </button>
  </div>

  <div class="footer">Powered by Urban Kids Club</div>
</div>

<script>
const PID='${safeId}',API='${apiBase}';
let _email='',_bookings=[];

document.getElementById('emailForm').addEventListener('submit',async function(e){
  e.preventDefault();
  _email=document.getElementById('email').value.trim();
  if(!_email)return;
  const btn=document.getElementById('lookupBtn'),txt=document.getElementById('lookupText'),sp=document.getElementById('lookupSpinner');
  btn.disabled=true;txt.style.display='none';sp.style.display='block';
  document.getElementById('lookupError').innerHTML='';
  try{
    const r=await fetch(API+'/api/public/checkin/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({providerId:PID,email:_email})});
    const d=(await r.json()).data;
    if(!d.success){
      document.getElementById('lookupError').innerHTML='<div class="error-msg">'+esc(d.error)+'</div>';
      btn.disabled=false;txt.style.display='';sp.style.display='none';return;
    }
    _bookings=d.bookings;
    renderChildren();
    document.getElementById('step1').style.display='none';
    document.getElementById('step2').style.display='';
  }catch(err){
    document.getElementById('lookupError').innerHTML='<div class="error-msg">Verbindungsfehler. Bitte versuche es erneut.</div>';
    btn.disabled=false;txt.style.display='';sp.style.display='none';
  }
});

function renderChildren(){
  const el=document.getElementById('childList');
  let html='';
  for(let i=0;i<_bookings.length;i++){
    const b=_bookings[i];
    const done=b.alreadyCheckedIn;
    const cls=done?'child-item already':'child-item'+(b._selected?' selected':'');
    html+='<div class="'+cls+'" '+(done?'':'onclick="toggleChild('+i+')"')+'>';
    html+='<div class="child-cb">'+(done?'✓':(b._selected?'✓':''))+'</div>';
    html+='<div class="child-info">';
    html+='<div class="child-name">'+esc(b.childName)+'</div>';
    html+='<div class="child-course">'+esc(b.activityTitle)+'</div>';
    if(done){
      html+='<div class="child-payment paid">Bereits eingecheckt ✓</div>';
    }else if(b.paymentStatus==='paid'){
      html+='<div class="child-payment paid">Bezahlt ✓</div>';
    }else{
      html+='<div class="child-payment unpaid">'+b.amountDue.toFixed(2).replace('.',',')+' € offen</div>';
    }
    html+='</div></div>';
  }
  el.innerHTML=html;
  // Update button state
  const anySelected=_bookings.some(function(b){return b._selected&&!b.alreadyCheckedIn});
  document.getElementById('checkinBtn').disabled=!anySelected;
}

function toggleChild(i){
  if(_bookings[i].alreadyCheckedIn)return;
  _bookings[i]._selected=!_bookings[i]._selected;
  renderChildren();
}

async function doCheckin(){
  const ids=_bookings.filter(function(b){return b._selected&&!b.alreadyCheckedIn}).map(function(b){return b.bookingId});
  if(!ids.length)return;
  const btn=document.getElementById('checkinBtn'),txt=document.getElementById('checkinText'),sp=document.getElementById('checkinSpinner');
  btn.disabled=true;txt.style.display='none';sp.style.display='block';
  try{
    const r=await fetch(API+'/api/public/checkin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({providerId:PID,email:_email,bookingIds:ids})});
    const d=(await r.json()).data;
    if(!d.success){
      alert(d.error||'Fehler');btn.disabled=false;txt.style.display='';sp.style.display='none';return;
    }
    // Show confirmation
    const card=document.getElementById('card');
    let items='',hasUnpaid=false;
    for(const item of d.checkedIn){
      const isPaid=item.paymentStatus==='paid';
      if(!isPaid)hasUnpaid=true;
      items+='<div class="result-item '+(isPaid?'result-ok':'result-pay')+'">';
      items+='<div class="result-icon">'+(isPaid?'✓':'💳')+'</div>';
      items+='<div class="result-text">';
      items+='<div class="title">'+esc(item.activityTitle)+'</div>';
      items+='<div class="detail">'+esc(item.childName)+' — ';
      items+=isPaid?'Alles erledigt — viel Spaß! 🎉':'Noch '+item.amountDue.toFixed(2).replace('.',',')+' € offen. Kurz vor Ort begleichen — dann kann\\'s losgehen! 💪';
      items+='</div></div></div>';
    }
    card.innerHTML='<div class="logo" style="background:'+(hasUnpaid?'#d97706':'#059669')+'">'+(hasUnpaid?'💳':'✓')+'</div>'+
      '<h1>'+(hasUnpaid?'Fast geschafft!':'Du bist drin!')+'</h1>'+
      '<p class="subtitle">'+(hasUnpaid?'Nur noch eine Kleinigkeit…':'Check-in erfolgreich — hab eine tolle Zeit!')+'</p>'+
      '<div style="text-align:left;margin-top:20px">'+items+'</div>'+
      (d.redirectUrl?'<p style="color:#94a3b8;font-size:12px;margin-top:16px">Du wirst in 5 Sekunden weitergeleitet...</p>':'')+
      '<div class="footer">Powered by Urban Kids Club</div>';
    if(d.redirectUrl)setTimeout(function(){window.location.href=d.redirectUrl},5000);
  }catch(err){
    alert('Verbindungsfehler');btn.disabled=false;txt.style.display='';sp.style.display='none';
  }
}

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
</script>
</body></html>`
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

  // Parent Portal
  if (path === '/portal' || path === '/portal/' || path.startsWith('/portal/?')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(portalHtml)
    return
  }

  // QR Check-in: Public page for parents to check in via QR code
  if (path.startsWith('/checkin/')) {
    const providerId = path.split('/')[2] || ''
    if (providerId) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(generateCheckinHtml(providerId))
      return
    }
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

  // Auto-expire waitlist offers every 15 minutes (Supabase mode only)
  if (USE_SUPABASE) {
    setInterval(async () => {
      try {
        const resp = await fetch(`http://localhost:${PORT}/api/admin/jobs/expire-waitlist`, { method: 'POST' })
        const data = await resp.json() as any
        if (data.data?.expired > 0 || data.data?.offered > 0) {
          console.log(`[AutoOffer] Expired: ${data.data.expired}, Offered to next: ${data.data.offered}`)
        }
      } catch (e) { /* silent */ }
    }, 15 * 60 * 1000) // every 15 minutes
    console.log('  [AutoOffer] Waitlist auto-expire job running every 15 minutes')

    // Send course reminders daily at ~17:00 DE time (check every 30 min)
    let lastReminderDate = ''
    setInterval(async () => {
      try {
        const nowDE = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
        const hour = nowDE.getHours()
        const todayStr = nowDE.toISOString().slice(0, 10)
        // Send between 17:00-17:29 DE time, once per day
        if (hour === 17 && lastReminderDate !== todayStr) {
          lastReminderDate = todayStr
          const resp = await fetch(`http://localhost:${PORT}/api/admin/jobs/send-reminders`, { method: 'POST' })
          const data = await resp.json() as any
          if (data.data?.sent > 0) {
            console.log(`[Reminder] Sent ${data.data.sent} reminders for ${data.data.date}`)
          }
        }
      } catch (e) { /* silent */ }
    }, 30 * 60 * 1000) // check every 30 minutes
    console.log('  [Reminder] Course reminder job active (daily at 17:00 DE)')
  }
})
