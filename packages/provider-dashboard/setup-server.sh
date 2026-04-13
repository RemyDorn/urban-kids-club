#!/bin/bash
# Setup-Script fuer Urban Kids Club Dashboard auf Hetzner
# Ausfuehren als root: bash setup-server.sh

set -e

echo "=== Dashboard Setup ==="

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

[Install]
WantedBy=multi-user.target
SERVICEEOF

echo "[OK] Systemd Service erstellt"

# 2. Caddy Config erweitern - app.socialy.club hinzufuegen
cat > /opt/n8n/Caddyfile << 'CADDYEOF'
{$N8N_DOMAIN} {
  reverse_proxy n8n:5678
}

app.socialy.club {
  reverse_proxy localhost:3000
}
CADDYEOF

echo "[OK] Caddyfile erweitert"

# 3. Data-Verzeichnis sicherstellen
mkdir -p /opt/urban-kids-club/packages/provider-dashboard/data

# 4. Services starten
systemctl daemon-reload
systemctl enable dashboard.service
systemctl start dashboard.service

echo "[OK] Dashboard Service gestartet"

# 5. Caddy neu laden (Docker)
cd /opt/n8n
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile

echo "[OK] Caddy neu geladen"

# 6. Status pruefen
sleep 2
systemctl status dashboard.service --no-pager

echo ""
echo "=== Setup fertig! ==="
echo "Dashboard: https://app.socialy.club"
