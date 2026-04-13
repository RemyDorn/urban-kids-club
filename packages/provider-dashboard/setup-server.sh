#!/bin/bash
# Setup-Script fuer Urban Kids Club Dashboard auf Hetzner
# Ausfuehren als root: bash setup-server.sh

set -e

echo "=== Dashboard Setup ==="

# 0. Host-IP ermitteln (fuer Caddy reverse_proxy aus Docker heraus)
# Nutze die oeffentliche IP des Servers - zuverlaessiger als Docker Gateway
HOST_IP=$(hostname -I | awk '{print $1}')
echo "[OK] Host IP: $HOST_IP"

# 1. Systemd Service erstellen
cat > /etc/systemd/system/dashboard.service << 'SERVICEEOF'
[Unit]
Description=Urban Kids Club Dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/urban-kids-club/packages/provider-dashboard
ExecStart=/usr/local/bin/tsx src/api/server.ts
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=USE_SUPABASE=true
Environment=SUPABASE_URL=https://yuilhiqnrjuuqoqggihm.supabase.co
Environment=SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1aWxoaXFucmp1dXFvcWdnaWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNzUxMDAsImV4cCI6MjA5MDc1MTEwMH0.8dnGBOapmuTwEUy0VG-VnSgIAgRf10F4L1wi9gcE0iw
Environment=SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1aWxoaXFucmp1dXFvcWdnaWhtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE3NTEwMCwiZXhwIjoyMDkwNzUxMTAwfQ.VNF_-e1TImCGdUvmaEvdOhb1Zbfq0WIJqCtpIgy82hw

[Install]
WantedBy=multi-user.target
SERVICEEOF

echo "[OK] Systemd Service erstellt"

# 2. Caddy Config erweitern - app.socialy.club hinzufuegen
cat > /opt/n8n/Caddyfile << CADDYEOF
{\$N8N_DOMAIN} {
  reverse_proxy n8n:5678
}

app.socialy.club {
  reverse_proxy ${HOST_IP}:3000
}
CADDYEOF

echo "[OK] Caddyfile erweitert (reverse_proxy -> ${HOST_IP}:3000)"

# 3. Data-Verzeichnis sicherstellen
mkdir -p /opt/urban-kids-club/packages/provider-dashboard/data

# 4. Services starten
systemctl daemon-reload
systemctl enable dashboard.service
systemctl start dashboard.service

echo "[OK] Dashboard Service gestartet"

# 5. Caddy neu laden (Docker)
cd /opt/n8n
docker compose restart caddy

echo "[OK] Caddy neu gestartet"

# 6. Status pruefen
sleep 3
systemctl status dashboard.service --no-pager

echo ""
echo "=== Setup fertig! ==="
echo "Dashboard: https://app.socialy.club"
