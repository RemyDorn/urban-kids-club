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
  if(!courses.length){app.innerHTML='<div class="empty-state">Aktuell keine Kurse verfügbar.</div>';return}
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
  const html='<div class="book-modal"><div class="book-modal-inner">'+
    '<h3>Warteliste: '+esc(title)+'</h3>'+
    '<p>'+dateStr+' — Aktuell kein Kursblock verfügbar. Tragen Sie sich ein und wir benachrichtigen Sie, sobald der Kurs startet.</p>'+
    '<input id="wlChildFirst" placeholder="Vorname Kind *" required>'+
    '<input id="wlChildLast" placeholder="Nachname Kind *" required>'+
    '<input id="wlChildYear" type="number" placeholder="Geburtsjahr Kind *" min="2010" max="2025" required>'+
    '<input id="wlParentFirst" placeholder="Vorname Elternteil *" required>'+
    '<input id="wlParentLast" placeholder="Nachname Elternteil *" required>'+
    '<input id="wlEmail" type="email" placeholder="E-Mail *" required>'+
    '<input id="wlPhone" placeholder="Telefon (optional)">'+
    '<div class="btn-row">'+
    '<button class="btn-send" onclick="window._submitWaitlist(\''+course.id+'\')">Auf Warteliste eintragen</button>'+
    '<button class="btn-cancel" onclick="this.closest(\'.book-modal\').remove()">Abbrechen</button>'+
    '</div></div></div>'
  app.insertAdjacentHTML('beforeend',html)
}
window._submitWaitlist=async function(activityId){
  const f=s=>document.getElementById(s)?.value?.trim()||''
  const childFirst=f('wlChildFirst'),childLast=f('wlChildLast'),childYear=f('wlChildYear')
  const parentFirst=f('wlParentFirst'),parentLast=f('wlParentLast'),email=f('wlEmail'),phone=f('wlPhone')
  if(!childFirst||!childLast||!childYear||!parentFirst||!parentLast||!email){alert('Bitte alle Pflichtfelder ausfüllen');return}
  try{
    const r=await fetch('/api/checkout/create-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:slug,activityId:activityId,child:{firstName:childFirst,lastName:childLast,birthYear:parseInt(childYear)},parent:{firstName:parentFirst,lastName:parentLast,email:email,phone:phone},paymentMethod:'onsite'})})
    const data=await r.json()
    document.querySelector('.book-modal').remove()
    if(data.error&&data.error.includes('Warteliste')){
      app.insertAdjacentHTML('beforeend','<div class="book-modal"><div class="book-modal-inner" style="text-align:center"><div style="font-size:32px;margin-bottom:12px">✅</div><h3>Auf der Warteliste!</h3><p style="margin:12px 0">Sie werden benachrichtigt, sobald ein Kursblock verfügbar ist.</p><button class="btn-send" onclick="this.closest(\'.book-modal\').remove()">OK</button></div></div>')
    } else if(data.success){
      app.insertAdjacentHTML('beforeend','<div class="book-modal"><div class="book-modal-inner" style="text-align:center"><div style="font-size:32px;margin-bottom:12px">✅</div><h3>Buchung bestätigt!</h3><p style="margin:12px 0">Vielen Dank für Ihre Buchung.</p><button class="btn-send" onclick="this.closest(\'.book-modal\').remove()">OK</button></div></div>')
    } else {
      alert(data.error||'Fehler')
    }
  }catch(e){alert('Verbindungsfehler')}
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
      html+='<div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:12px">Kind</div>'
      html+='<div style="display:flex;gap:8px;margin-bottom:8px"><input id="ckFirst" placeholder="Vorname" style="flex:1;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none" required><input id="ckLast" placeholder="Nachname" style="flex:1;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none" required></div>'
      html+='<input id="ckYear" type="number" placeholder="Geburtsjahr (z.B. 2020)" min="2005" max="2026" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;margin-bottom:16px">'
      html+='<div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:12px">Elternteil</div>'
      html+='<div style="display:flex;gap:8px;margin-bottom:8px"><input id="cpFirst" placeholder="Vorname" style="flex:1;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none" required><input id="cpLast" placeholder="Nachname" style="flex:1;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none" required></div>'
      html+='<input id="cpEmail" type="email" placeholder="E-Mail" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;margin-bottom:8px" required>'
      html+='<input id="cpPhone" type="tel" placeholder="Telefon" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;margin-bottom:16px" required>'
      html+='<button id="btnNext1" style="width:100%;padding:12px;border:none;border-radius:10px;background:${brandColor};color:#fff;font-weight:600;font-size:14px;cursor:pointer">Weiter</button>'
    }

    if(step===2&&hasOnline&&hasOnsite){
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
      m.querySelectorAll('.pay-opt').forEach(btn=>{
        btn.onmouseover=function(){this.style.borderColor='${brandColor}'}
        btn.onmouseout=function(){this.style.borderColor='#e2e8f0'}
        btn.onclick=function(){
          window._checkoutPayMethod=this.dataset.method==='online'?(prov.stripeConnected?'stripe':'paypal'):'onsite'
          step=3;renderStep()
        }
      })
    }
    if(step===agbStep){
      m.querySelector('#btnSubmit').onclick=async function(){
        if(!m.querySelector('#agbCheck').checked){alert('Bitte AGB akzeptieren.');return}
        if(cancel.custom_text&&!m.querySelector('#stornoCheck')?.checked){alert('Bitte Stornierungsbedingungen akzeptieren.');return}
        this.textContent='Wird verarbeitet...'
        this.disabled=true
        try{
          const r=await fetch('/api/checkout/create-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:slug,activityId:course.id,blockId:course.blockId||null,bookedDate:window._checkoutDate||null,child:window._checkoutChild,parent:window._checkoutParent,paymentMethod:window._checkoutPayMethod})})
          const data=await r.json()
          if(!r.ok){alert(data.error||'Fehler beim Buchen');this.textContent='Erneut versuchen';this.disabled=false;return}
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
