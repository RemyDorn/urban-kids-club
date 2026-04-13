#!/bin/bash
# ============================================================
# Urban Kids Club – Deployment auf Hetzner
# ============================================================
# Nutzung:
#   1. SSH-Zugang zum Hetzner-Server einrichten
#   2. Domain (app.socialy.club) auf Server-IP zeigen lassen
#   3. ./deploy.sh                     → Erstmaliges Setup + Deploy
#   4. ./deploy.sh update              → Nur Code updaten + neu bauen
#   5. ./deploy.sh logs                → Logs anzeigen
#   6. ./deploy.sh backup              → Daten-Backup erstellen
# ============================================================

set -euo pipefail

# --- Konfiguration ---
SERVER_USER="${DEPLOY_USER:-root}"
SERVER_HOST="${DEPLOY_HOST:-}"         # z.B. 168.119.x.x (Hetzner IP)
REMOTE_DIR="/opt/urban-kids-club"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

# Farben
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# --- Prüfungen ---
if [ -z "$SERVER_HOST" ]; then
  error "DEPLOY_HOST nicht gesetzt. Nutzung: DEPLOY_HOST=168.119.x.x ./deploy.sh"
fi

SSH_CMD="ssh -o StrictHostKeyChecking=accept-new ${SERVER_USER}@${SERVER_HOST}"

# ============================================================
# Funktion: Erstmaliges Server-Setup
# ============================================================
setup_server() {
  info "Erstmaliges Server-Setup auf ${SERVER_HOST}..."

  $SSH_CMD << 'SETUP_EOF'
    set -euo pipefail

    # Docker installieren (falls nicht vorhanden)
    if ! command -v docker &> /dev/null; then
      echo "[Setup] Docker installieren..."
      curl -fsSL https://get.docker.com | sh
      systemctl enable docker
      systemctl start docker
    fi

    # Docker Compose Plugin (falls nicht vorhanden)
    if ! docker compose version &> /dev/null; then
      echo "[Setup] Docker Compose Plugin installieren..."
      apt-get update && apt-get install -y docker-compose-plugin
    fi

    # Verzeichnis erstellen
    mkdir -p /opt/urban-kids-club

    echo "[Setup] Server-Setup abgeschlossen ✓"
SETUP_EOF
}

# ============================================================
# Funktion: Code zum Server übertragen
# ============================================================
sync_code() {
  info "Code übertragen..."

  # Relevante Dateien zum Server kopieren
  rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude 'dist' \
    --exclude 'data' \
    --exclude '.git' \
    --exclude '*.backup.json' \
    "${LOCAL_DIR}/" \
    "${SERVER_USER}@${SERVER_HOST}:${REMOTE_DIR}/"

  info "Code übertragen ✓"
}

# ============================================================
# Funktion: Container bauen und starten
# ============================================================
deploy() {
  info "Container bauen und starten..."

  $SSH_CMD << DEPLOY_EOF
    set -euo pipefail
    cd ${REMOTE_DIR}

    # Container bauen
    docker compose build --no-cache

    # Alte Container stoppen + neue starten
    docker compose down
    docker compose up -d

    # Status prüfen
    sleep 5
    docker compose ps

    echo ""
    echo "============================================"
    echo "  Deploy abgeschlossen!"
    echo "  Dashboard: https://app.socialy.club"
    echo "  Health:    https://app.socialy.club/api/health"
    echo "============================================"
DEPLOY_EOF

  info "Deploy erfolgreich ✓"
}

# ============================================================
# Funktion: Nur Update (ohne Setup)
# ============================================================
update() {
  info "Update: Code übertragen + Container neu bauen..."
  sync_code

  $SSH_CMD << DEPLOY_EOF
    set -euo pipefail
    cd ${REMOTE_DIR}

    # Nur Dashboard neu bauen (Caddy bleibt)
    docker compose build dashboard
    docker compose up -d dashboard

    sleep 3
    docker compose ps
DEPLOY_EOF

  info "Update abgeschlossen ✓"
}

# ============================================================
# Funktion: Logs anzeigen
# ============================================================
show_logs() {
  $SSH_CMD "cd ${REMOTE_DIR} && docker compose logs -f --tail=100"
}

# ============================================================
# Funktion: Daten-Backup
# ============================================================
backup() {
  BACKUP_DIR="${LOCAL_DIR}/backups"
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  mkdir -p "${BACKUP_DIR}"

  info "Daten-Backup erstellen..."

  # Daten vom Server holen
  rsync -avz \
    "${SERVER_USER}@${SERVER_HOST}:${REMOTE_DIR}/data/" \
    "${BACKUP_DIR}/backup_${TIMESTAMP}/"

  # Vor dem Backup: Save erzwingen
  $SSH_CMD "cd ${REMOTE_DIR} && docker compose exec dashboard wget -qO- http://localhost:3000/api/health" || true

  info "Backup erstellt: ${BACKUP_DIR}/backup_${TIMESTAMP}/ ✓"
}

# ============================================================
# Funktion: Status anzeigen
# ============================================================
status() {
  $SSH_CMD "cd ${REMOTE_DIR} && docker compose ps && echo '' && docker compose logs --tail=20 dashboard"
}

# ============================================================
# Main
# ============================================================
case "${1:-deploy}" in
  setup)
    setup_server
    sync_code
    deploy
    ;;
  deploy|"")
    sync_code
    deploy
    ;;
  update)
    update
    ;;
  logs)
    show_logs
    ;;
  backup)
    backup
    ;;
  status)
    status
    ;;
  *)
    echo "Nutzung: $0 {deploy|update|logs|backup|status|setup}"
    exit 1
    ;;
esac
