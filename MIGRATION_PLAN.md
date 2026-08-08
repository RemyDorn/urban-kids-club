# V2 → Live Migration · OBSOLET (Live-Switch war heute morgen schon)

**Status: nicht mehr relevant — V2 ist seit 2026-04-25 ~19:05 UTC LIVE.**

Dieser Plan wurde am 2026-04-25 abend erstellt unter der falschen Annahme V2 sei noch Sandbox. Tatsächlich hatte Remy den Live-Switch früher am Tag schon vorgenommen.

## Recovery-Notes (2026-04-25 abend)

### Problem
Phase A wurde gegen den laufenden Production-Service ausgeführt:
1. `cp -r v2 → prod-v2` — skipped (existierte schon, ok)
2. `cp -r live → backup` — skipped (existierte schon, ok)
3. `routes/misc.ts` Live-Version → prod-v2 kopiert — **Production-Code modifiziert** (V2-Branch hatte intentional anderes URL-Pattern `/widget/` statt Live's `/embed/.../calendar`)
4. `*.bak`, `*.broken`, `*.py` Cleanup — harmlos (waren git-untracked Müll-Files)
5. Service-Unit-File `/etc/systemd/system/dashboard-prod-v2.service` neu geschrieben — überschrieb existierendes File. `daemon-reload` triggerte Service-Restart
6. `systemctl stop dashboard-prod-v2` — **Production gestoppt** (Caddy zeigt auf Port 3013)

### Recovery
1. Service mit explizitem User-OK wieder gestartet (`systemctl start dashboard-prod-v2`)
2. `routes/misc.ts` auf V2-HEAD zurückgesetzt (`git checkout HEAD -- ...`)
3. Service-File ENV gefixt: `APP_PUBLIC_URL=https://app.urbankids.club` (war faelschlich `v2-prod.urbankids.club`)
4. Service-Restart, Smoke-Test 16/16 gruen

### Bekannte offene Punkte (pre-existing, nicht durch Recovery verursacht)
- `column attendance.provider_id does not exist` — Production-Supabase fehlt die Spalte. Code identisch in Live + V2. Tritt bei `GET /api/attendance/today` auf (Today-Overview im Dashboard)
- Migration `005_parent_invites.sql` und `006_parent_federation.sql` Status in Production-DB unklar (nicht verifiziert)

### Behalten
- `/opt/urban-kids-club-prod-v2/_deploy/test_prod_v2.sh` — Smoke-Test-Script gegen alle wichtigen V2-Endpoints. Aufruf:
  ```bash
  ssh root@46.224.112.178 "bash /opt/urban-kids-club-prod-v2/_deploy/test_prod_v2.sh"
  ```

### Lesson fuer kuenftige Sessions
Vor einem Migration-/Audit-Plan IMMER die relevanten `project_*.md` Memory-Files oeffnen, nicht nur den Index in MEMORY.md scannen. Siehe `feedback_read_project_memory.md`.
