#!/usr/bin/env python3
"""
Phase 1d: HEUTE + ZU TUN Cards + Sidebar-Counter mit echten Daten

1. HTML: Mockup-agenda-items + todo-items rauswerfen, IDs für Container vergeben
2. JS-Hook erweitern: echte Daten laden + rendern
3. Mockup-Sub-Headline-Text "Heute: 3 Termine · 2 offene..." beibehalten als Fallback,
   JS überschreibt mit echten Counts
"""
import os
import re
from pathlib import Path

TARGET = os.environ.get('UKC_TARGET', 'sandbox')
BASE = Path('/opt/urban-kids-club-prod-v2' if TARGET == 'prod' else '/opt/urban-kids-club-v2')
PD = BASE / 'packages' / 'provider-dashboard' / 'src'
DV3 = PD / 'frontend' / 'dashboard-v3.html'

src = DV3.read_text(encoding='utf-8')

# ============================================================
# 1. HEUTE-Card: Mockup-agenda-items raus, Container rein
# ============================================================
# Find: <div class="card">...<div class="card-title">Heute · <em>Freitag</em></div>...</div>
HEUTE_OLD = re.compile(
    r'<div class="card">\s*<div class="card-head">\s*<div class="card-title">Heute · <em[^>]*>[^<]*</em></div>\s*<a [^>]*>Voller Kalender →</a>\s*</div>'
    r'(.*?)'  # alle agenda-items
    r'(?=\s*</div>\s*\n\s*<!-- Zu Tun)',
    re.DOTALL
)

HEUTE_NEW = '''<div class="card" id="phTodayCard">
          <div class="card-head">
            <div class="card-title">Heute · <em id="phTodayWeekday">Heute</em></div>
            <a href="#" class="card-link" onclick="window.location.href='/v3'; return false">Voller Kalender →</a>
          </div>
          <div id="phTodayList"><div style="padding:30px;color:var(--muted);text-align:center;font-size:13px">Lade Termine…</div></div>
        '''

m = HEUTE_OLD.search(src)
if m:
    src = src[:m.start()] + HEUTE_NEW + src[m.end():]
    print(f'OK Step 1: HEUTE-Card cleaned ({m.end() - m.start()} → {len(HEUTE_NEW)} chars)')
else:
    print('SKIP Step 1: HEUTE-Card Anchor nicht gefunden')

# ============================================================
# 2. ZU TUN-Card: Mockup-todo-items raus, Container rein
# ============================================================
ZUTUN_OLD = re.compile(
    r'<div class="card">\s*<div class="card-head">\s*<div class="card-title">Zu <em[^>]*>tun</em></div>\s*<a [^>]*>Alle →</a>\s*</div>'
    r'(.*?)'
    r'(?=\s*</div>\s*</div>)',  # closes card + grid-2
    re.DOTALL
)

ZUTUN_NEW = '''<div class="card" id="phTodoCard">
          <div class="card-head">
            <div class="card-title">Zu <em>tun</em></div>
            <a href="#" class="card-link" onclick="window.location.href='/postfach-preview'; return false">Alle →</a>
          </div>
          <div id="phTodoList"><div style="padding:30px;color:var(--muted);text-align:center;font-size:13px">Lade Aufgaben…</div></div>
        '''

m = ZUTUN_OLD.search(src)
if m:
    src = src[:m.start()] + ZUTUN_NEW + src[m.end():]
    print(f'OK Step 2: ZU TUN-Card cleaned ({m.end() - m.start()} → {len(ZUTUN_NEW)} chars)')
else:
    print('SKIP Step 2: ZU TUN-Card Anchor nicht gefunden')

# ============================================================
# 3. JS-Hook erweitern: nach "Backend-Wiring komplett" einen Block für Today + Todo + Counter
# ============================================================
JS_PHASE1D_BLOCK = '''
    // ============================================================
    // Phase 1d: Heute-Liste + Zu-Tun-Liste + Sidebar-Counter
    // ============================================================

    // Heutige Sessions laden
    let todaySessions = [];
    try {
      const r = await api('/attendance/today');
      todaySessions = (r.data?.sessions || r.data || r.sessions || []);
    } catch (e) { console.warn('[v3] /api/attendance/today failed', e); }

    const todayList = document.getElementById('phTodayList');
    if (todayList) {
      if (!todaySessions.length) {
        todayList.innerHTML = '<div style="padding:30px;color:var(--muted);text-align:center;font-size:13px">Heute keine Termine.</div>';
      } else {
        todayList.innerHTML = todaySessions.slice(0, 5).map(s => {
          const time = s.startsAt || s.startTime || s.time || '';
          const hour = time ? new Date(time).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}) : '—';
          const dur = s.durationMin || s.duration || 60;
          const title = s.activityTitle || s.title || s.activityName || '—';
          const room = s.locationName || s.room || s.roomName || '';
          const booked = s.bookedCount ?? s.attendees ?? 0;
          const cap = s.capacity ?? 0;
          const isFull = cap > 0 && booked >= cap;
          const isAlmost = cap > 0 && booked / cap >= 0.8 && !isFull;
          const statusCls = isFull ? 'full' : isAlmost ? 'warn' : 'ok';
          const statusLabel = isFull ? 'Ausgebucht' : isAlmost ? 'Fast voll' : 'Alles gut';
          return '<div class="agenda-item"><div class="agenda-time"><div class="agenda-time-hour">' + hour + '</div><div class="agenda-time-min">' + dur + ' Min</div></div><div class="agenda-body"><div class="agenda-name">' + title + '</div><div class="agenda-meta"><strong>' + booked + ' von ' + cap + '</strong> Teilnehmer' + (room ? ' · ' + room : '') + '</div></div><span class="agenda-status ' + statusCls + '">' + statusLabel + '</span></div>';
        }).join('');
      }
    }

    // Zu-Tun-Liste: Trials + open Invoices + unread Messages
    const todos = [];
    try {
      const r = await api('/providers/' + cp.id + '/trials');
      const trials = r.data || r.trials || r || [];
      const pending = trials.filter(t => t.status === 'pending' || t.status === 'requested' || t.status === 'open' || !t.status);
      if (pending.length > 0) {
        todos.push({
          icon: '!',
          iconCls: 'warn',
          title: pending.length + ' offene Probestund' + (pending.length === 1 ? 'e' : 'en'),
          meta: 'Anfrage prüfen und bestätigen',
        });
      }
    } catch (e) { console.warn('[v3] trials load failed', e); }

    try {
      const r = await api('/providers/' + cp.id + '/invoices?status=open');
      const openInv = r.data || r.invoices || r || [];
      if (openInv.length > 0) {
        const overdue = openInv.filter(i => i.dueAt && new Date(i.dueAt) < new Date());
        if (overdue.length > 0) {
          todos.push({
            icon: '€',
            iconCls: 'err',
            title: overdue.length + ' überfällige Rechnung' + (overdue.length === 1 ? '' : 'en'),
            meta: 'Mahnung versenden',
          });
        }
        const dueOpen = openInv.length - overdue.length;
        if (dueOpen > 0) {
          todos.push({
            icon: '€',
            iconCls: 'info',
            title: dueOpen + ' offene Rechnung' + (dueOpen === 1 ? '' : 'en'),
            meta: 'Zahlungseingang prüfen',
          });
        }
      }
    } catch (e) { console.warn('[v3] invoices load failed', e); }

    let unreadMessages = 0;
    try {
      const r = await api('/providers/' + cp.id + '/messages?unread=true');
      unreadMessages = r.unreadCount ?? (r.data || r.messages || r || []).length;
      if (unreadMessages > 0) {
        todos.push({
          icon: '✉',
          iconCls: 'info',
          title: unreadMessages + ' ungelesene Nachricht' + (unreadMessages === 1 ? '' : 'en'),
          meta: 'Postfach öffnen',
        });
      }
    } catch (e) { console.warn('[v3] messages load failed', e); }

    const todoList = document.getElementById('phTodoList');
    if (todoList) {
      if (!todos.length) {
        todoList.innerHTML = '<div style="padding:30px;color:var(--muted);text-align:center;font-size:13px">Alles erledigt 🎉</div>';
      } else {
        todoList.innerHTML = todos.slice(0, 6).map(t => {
          return '<div class="todo-item"><div class="todo-icon ' + (t.iconCls || '') + '">' + t.icon + '</div><div class="todo-body"><div class="todo-title">' + t.title + '</div><div class="todo-meta">' + t.meta + '</div></div></div>';
        }).join('');
      }
    }

    // KPI "Heute zu tun" mit echtem Count
    const statTodo = document.querySelectorAll('.stats .stat')[3];
    if (statTodo) {
      const v = statTodo.querySelector('.stat-value');
      const d = statTodo.querySelector('.stat-delta');
      if (v) v.innerHTML = todos.length + ' <em>Aufgabe' + (todos.length === 1 ? '' : 'n') + '</em>';
      if (d) d.textContent = todos.length === 0 ? 'Alles erledigt' : todos.length + ' offen';
    }

    // Sub-Headline mit echten Counts
    const sub = document.querySelector('.page-sub');
    if (sub) {
      const parts = [];
      if (todaySessions.length > 0) parts.push(todaySessions.length + ' Termin' + (todaySessions.length === 1 ? '' : 'e') + ' heute');
      if (todos.length > 0) parts.push(todos.length + ' offene Aufgabe' + (todos.length === 1 ? '' : 'n'));
      sub.textContent = parts.length > 0 ? 'Heute: ' + parts.join(' · ') + '.' : 'Heute: alles ruhig.';
    }

    // Sidebar-Counter für Postfach + Probestunden
    document.querySelectorAll('button.nav-item .badge').forEach(el => {
      const btn = el.closest('.nav-item');
      const onclick = btn.getAttribute('onclick') || '';
      if (onclick.includes('postfach-preview')) el.textContent = unreadMessages || 0;
      else if (onclick.includes('probestunden-preview')) {
        const trialsCnt = todos.find(t => t.title.includes('Probestund'));
        el.textContent = trialsCnt ? parseInt(trialsCnt.title) : 0;
      }
    });

'''

# Insert vor "console.log('[v3] Backend-Wiring komplett'..."
ANCHOR = "console.log('[v3] Backend-Wiring komplett'"
if ANCHOR in src and 'Phase 1d:' not in src:
    src = src.replace(ANCHOR, JS_PHASE1D_BLOCK + '\n    ' + ANCHOR, 1)
    print('OK Step 3: JS-Hook Phase 1d Block eingefügt')
elif 'Phase 1d:' in src:
    print('SKIP Step 3: Phase 1d-Block ist schon im File')
else:
    print('SKIP Step 3: ANCHOR nicht gefunden')

# Sanity
print(f'\nTag-Balance: <button>={src.count("<button")}/{src.count("</button>")}, <script>={src.count("<script")}/{src.count("</script>")}, <div>={src.count("<div")}/{src.count("</div>")}')

DV3.write_text(src, encoding='utf-8')
print(f'\nOK: dashboard-v3.html geschrieben ({len(src)} bytes)')
