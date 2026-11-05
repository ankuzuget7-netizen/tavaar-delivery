#!/usr/bin/env bash
set -Eeuo pipefail

# Automated production installer for Tavaar Delivery on Ubuntu 22.04 or Debian 13.
# Run as root on a fresh VPS. Secrets are requested interactively and stored only in
# /etc/tavaar.env with mode 600. No secret values are embedded in this file.

APP_NAME="tavaar"
APP_USER="tavaar"
APP_DIR="/opt/tavaar"
ENV_FILE="/etc/tavaar.env"
DOMAIN="tavaar.online"
WWW_DOMAIN="www.tavaar.online"
API_PORT="3000"
WEB_ROOT="${APP_DIR}/web-dist"
SYSTEMD_UNIT="tavaar-api.service"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"
SOURCE_DIR="$(pwd)"
REPO_URL=""
BUNDLE_URL=""
SKIP_WEBHOOKS="false"
LE_EMAIL=""

usage() {
  cat <<'USAGE'
Usage:
  sudo bash scripts/install-tavaar-ubuntu22.sh [options]

Options:
  --source-dir DIR   Project directory to deploy (default: current directory)
  --repo URL         Clone the project into /opt/tavaar before deployment
  --bundle-url URL   Download a tar.gz project bundle before deployment
  --domain NAME      Domain name (default: tavaar.online)
  --email EMAIL      Let's Encrypt notification email
  --skip-webhooks    Configure the app but do not register Telegram/MAX webhooks
  -h, --help         Show this help

The script must run as root on Ubuntu 22.04 or Debian 13. It never prints or commits secret values.
USAGE
}

log() { printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-dir) SOURCE_DIR="${2:?Missing value for --source-dir}"; shift 2 ;;
    --repo) REPO_URL="${2:?Missing value for --repo}"; shift 2 ;;
    --bundle-url) BUNDLE_URL="${2:?Missing value for --bundle-url}"; shift 2 ;;
    --domain) DOMAIN="${2:?Missing value for --domain}"; WWW_DOMAIN="www.${DOMAIN}"; shift 2 ;;
    --email) LE_EMAIL="${2:?Missing value for --email}"; shift 2 ;;
    --skip-webhooks) SKIP_WEBHOOKS="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[[ "$(id -u)" == "0" ]] || die "Run this script as root: sudo bash scripts/install-tavaar-ubuntu22.sh"
[[ -r /etc/os-release ]] || die "/etc/os-release is missing"
# shellcheck disable=SC1091
. /etc/os-release
case "${ID:-}" in
  ubuntu)
    [[ "${VERSION_ID:-}" == "22.04" ]] \
      || die "This script supports Ubuntu 22.04; detected ${ID:-unknown} ${VERSION_ID:-unknown}"
    ;;
  debian)
    [[ "${VERSION_ID:-}" == "13" ]] \
      || die "This script supports Debian 13 (Trixie); detected ${ID:-unknown} ${VERSION_ID:-unknown}"
    ;;
  *)
    die "This script supports Ubuntu 22.04 or Debian 13; detected ${ID:-unknown} ${VERSION_ID:-unknown}"
    ;;
esac

if [[ -z "$LE_EMAIL" ]]; then
  read -r -p "Email for Let's Encrypt renewal notices: " LE_EMAIL
fi
[[ "$LE_EMAIL" == *@*.* ]] || die "A valid email address is required for Let's Encrypt"

if [[ -n "$REPO_URL" ]]; then
  log "Cloning/updating source repository"
  rm -rf /tmp/tavaar-source
  git clone --depth 1 "$REPO_URL" /tmp/tavaar-source
  SOURCE_DIR="/tmp/tavaar-source"
fi

if [[ -n "$BUNDLE_URL" ]]; then
  log "Downloading project bundle"
  rm -rf /tmp/tavaar-source
  mkdir -p /tmp/tavaar-source
  curl -fL --retry 3 --connect-timeout 15 --max-time 300 "$BUNDLE_URL" -o /tmp/tavaar-project.tar.gz
  tar -xzf /tmp/tavaar-project.tar.gz -C /tmp/tavaar-source
  SOURCE_DIR="/tmp/tavaar-source"
fi

[[ -f "$SOURCE_DIR/package.json" ]] || die "No package.json found in $SOURCE_DIR"
[[ -f "$SOURCE_DIR/pnpm-lock.yaml" ]] || die "No pnpm-lock.yaml found in $SOURCE_DIR"

log "Checking DNS for ${DOMAIN}"
DNS_IPS="$(getent ahostsv4 "$DOMAIN" | awk '{print $1}' | sort -u || true)"
if [[ -z "$DNS_IPS" ]]; then
  die "${DOMAIN} has no IPv4 DNS record yet. Point A records for @ and www to this VPS and retry."
fi
printf 'Resolved %s to: %s\n' "$DOMAIN" "$DNS_IPS"

log "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git rsync build-essential nginx certbot python3-certbot-nginx ufw

if command -v openresty >/dev/null 2>&1 || systemctl list-unit-files | grep -q '^openresty\.service'; then
  if systemctl is-active --quiet openresty; then
    die "OpenResty is already active on this server. Stop/reconfigure it first; refusing to take over ports 80/443 automatically."
  fi
fi

log "Installing Node.js 20+ and pnpm"
if ! command -v node >/dev/null 2>&1; then
  apt-get install -y nodejs npm
fi
if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(\".\")[0]')" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
command -v node >/dev/null 2>&1 || die "Node.js installation failed"
[[ "$(node -p 'process.versions.node.split(\".\")[0]')" -ge 20 ]] \
  || die "Node.js 20 or newer is required; detected $(node --version)"
if command -v corepack >/dev/null 2>&1; then
  corepack enable
  corepack prepare pnpm@9.12.0 --activate
else
  npm install --global pnpm@9.12.0
fi

log "Creating application user and directory"
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi
install -d -o "$APP_USER" -g "$APP_USER" -m 0755 "$APP_DIR"

log "Syncing application source into ${APP_DIR}"
rsync -a --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude web-dist \
  --exclude .env \
  --exclude .env.* \
  --exclude .git \
  "$SOURCE_DIR/" "$APP_DIR/"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# Safe single-quote escaping for dotenv values.
env_quote() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\'/\'\\\'\'}"
  printf "'%s'" "$value"
}

prompt_secret() {
  local key="$1" description="$2" current=""
  if [[ -f "$ENV_FILE" ]]; then
    current="$(grep -E "^${key}=" "$ENV_FILE" | head -1 || true)"
  fi
  if [[ -n "$current" ]]; then
    printf '%s is already configured in %s.\n' "$key" "$ENV_FILE"
    return
  fi
  local value
  read -r -s -p "$description: " value
  printf '\n'
  [[ -n "$value" ]] || die "$key cannot be empty"
  printf '%s=%s\n' "$key" "$(env_quote "$value")" >> "$ENV_FILE"
}

set_env_value() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  if [[ -f "$ENV_FILE" ]]; then
    grep -v -E "^${key}=" "$ENV_FILE" > "$tmp" || true
  fi
  printf '%s=%s\n' "$key" "$(env_quote "$value")" >> "$tmp"
  install -o "$APP_USER" -g "$APP_USER" -m 0600 "$tmp" "$ENV_FILE"
  rm -f "$tmp"
}

log "Collecting protected production settings"
if [[ ! -f "$ENV_FILE" ]]; then
  install -o "$APP_USER" -g "$APP_USER" -m 0600 /dev/null "$ENV_FILE"
fi
set_env_value "NODE_ENV" "production"
set_env_value "PORT" "$API_PORT"
prompt_secret "DATABASE_URL" "MySQL DATABASE_URL"
prompt_secret "MANUS_PROJECT_ID" "MANUS_PROJECT_ID"
prompt_secret "MANUS_OAUTH_API_URL" "MANUS_OAUTH_API_URL"
prompt_secret "MANUS_JWT_SECRET" "Production JWT secret (at least 32 characters)"
prompt_secret "TG_BOT_TOKEN" "Telegram bot token"
prompt_secret "MAX_BOT_TOKEN" "MAX bot token"
prompt_secret "TG_BOT_WEBHOOK_SECRET" "Telegram webhook secret"
prompt_secret "MAX_BOT_WEBHOOK_SECRET" "MAX webhook secret"
chown "$APP_USER:$APP_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"

set +a
set -a
. "$ENV_FILE"
set +a
[[ "${MANUS_JWT_SECRET#????????????????????????????????}" != "${MANUS_JWT_SECRET}" ]] \
  || die "MANUS_JWT_SECRET must be at least 32 characters"
[[ "${TG_BOT_WEBHOOK_SECRET}" =~ ^[A-Za-z0-9_-]{5,256}$ ]] \
  || die "TG_BOT_WEBHOOK_SECRET must contain 5-256 letters, digits, _ or -"
[[ "${MAX_BOT_WEBHOOK_SECRET}" =~ ^[A-Za-z0-9_-]{5,256}$ ]] \
  || die "MAX_BOT_WEBHOOK_SECRET must contain 5-256 letters, digits, _ or -"

log "Installing Node dependencies and applying database migrations"
run_as_app() {
  runuser -u "$APP_USER" -- env HOME="$APP_DIR" PATH="/usr/local/bin:/usr/bin:/bin" "$@"
}
run_as_app bash -lc "cd '$APP_DIR' && pnpm install --frozen-lockfile"
run_as_app bash -lc "cd '$APP_DIR' && set -a && . '$ENV_FILE' && set +a && pnpm exec drizzle-kit migrate"

log "Building API and Expo Web"
run_as_app bash -lc "cd '$APP_DIR' && pnpm check && pnpm build"
run_as_app bash -lc "cd '$APP_DIR' && rm -rf web-dist && EXPO_PUBLIC_API_BASE_URL='https://${DOMAIN}' pnpm exec expo export --platform web --output-dir web-dist"
[[ -f "$WEB_ROOT/index.html" ]] || die "Expo Web export did not produce $WEB_ROOT/index.html"
if grep -RaqE '127\.0\.0\.1:3000|localhost:3000' "$WEB_ROOT"; then
  die "The Web bundle contains a localhost API URL; refusing to publish it."
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

log "Creating systemd API service"
cat > "/etc/systemd/system/${SYSTEMD_UNIT}" <<EOF
[Unit]
Description=Tavaar Delivery API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/node ${APP_DIR}/dist/index.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$SYSTEMD_UNIT"
sleep 2
systemctl is-active --quiet "$SYSTEMD_UNIT" || { journalctl -u "$SYSTEMD_UNIT" -n 80 --no-pager; die "API service failed to start"; }
curl -fsS --max-time 10 "http://127.0.0.1:${API_PORT}/api/health" >/dev/null \
  || { journalctl -u "$SYSTEMD_UNIT" -n 80 --no-pager; die "API health check failed"; }

log "Configuring Nginx"
install -d -o "$APP_USER" -g "$APP_USER" -m 0755 "$WEB_ROOT"
cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${WWW_DOMAIN};

    root ${WEB_ROOT};
    index index.html;
    client_max_body_size 50m;

    location /api/ws {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120;
        proxy_send_timeout 120;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
rm -f /etc/nginx/sites-enabled/default
ln -sfn "$NGINX_SITE" "/etc/nginx/sites-enabled/${DOMAIN}"
nginx -t
systemctl enable nginx
systemctl reload nginx

log "Opening firewall and requesting Let's Encrypt certificate"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
certbot --nginx -d "$DOMAIN" -d "$WWW_DOMAIN" --redirect --agree-tos --no-eff-email -m "$LE_EMAIL" --non-interactive
nginx -t
systemctl reload nginx
certbot renew --dry-run

if [[ "$SKIP_WEBHOOKS" != "true" ]]; then
  log "Registering Telegram webhook"
  set +e
  telegram_result="$(runuser -u "$APP_USER" -- env ENV_FILE="$ENV_FILE" DOMAIN="$DOMAIN" python3 - <<'PY'
import json, os, urllib.request
from pathlib import Path

def load_env(path):
    values = {}
    for raw in Path(path).read_text().splitlines():
        if not raw or raw.startswith('#') or '=' not in raw:
            continue
        key, value = raw.split('=', 1)
        values[key] = value.strip().strip("'").strip('"')
    return values

env = load_env(os.environ['ENV_FILE'])
payload = json.dumps({
    'url': f"https://{os.environ['DOMAIN']}/api/bots/telegram/webhook",
    'secret_token': env['TG_BOT_WEBHOOK_SECRET'],
    'allowed_updates': ['message'],
}).encode()
req = urllib.request.Request(
    f"https://api.telegram.org/bot{env['TG_BOT_TOKEN']}/setWebhook",
    data=payload,
    headers={'Content-Type': 'application/json'},
    method='POST',
)
with urllib.request.urlopen(req, timeout=20) as response:
    print(response.read().decode())
PY
)"
  telegram_status=$?
  set -e
  [[ "$telegram_status" == "0" ]] || die "Telegram webhook registration failed: $telegram_result"
  printf '%s\n' "$telegram_result"

  log "Registering MAX webhook subscription"
  max_result="$(runuser -u "$APP_USER" -- env ENV_FILE="$ENV_FILE" DOMAIN="$DOMAIN" python3 - <<'PY'
import json, os, ssl, urllib.request
from pathlib import Path

def load_env(path):
    values = {}
    for raw in Path(path).read_text().splitlines():
        if not raw or raw.startswith('#') or '=' not in raw:
            continue
        key, value = raw.split('=', 1)
        values[key] = value.strip().strip("'").strip('"')
    return values

env = load_env(os.environ['ENV_FILE'])
ca = Path('/opt/tavaar/resources/certs/russian_trusted_ca_bundle.pem')
context = ssl.create_default_context(cafile=str(ca)) if ca.exists() else ssl.create_default_context()
payload = json.dumps({
    'url': f"https://{os.environ['DOMAIN']}/api/bots/max/webhook",
    'update_types': ['message_created', 'bot_started'],
    'secret': env['MAX_BOT_WEBHOOK_SECRET'],
}).encode()
req = urllib.request.Request(
    'https://platform-api2.max.ru/subscriptions',
    data=payload,
    headers={'Authorization': env['MAX_BOT_TOKEN'], 'Content-Type': 'application/json'},
    method='POST',
)
with urllib.request.urlopen(req, timeout=30, context=context) as response:
    print(response.read().decode())
PY
)"
  max_status=$?
  set -e
  [[ "$max_status" == "0" ]] || die "MAX webhook registration failed: $max_result"
  printf '%s\n' "$max_result"
else
  log "Webhook registration skipped by --skip-webhooks"
fi

log "Final checks"
curl -fsS --max-time 15 "https://${DOMAIN}/api/health"
printf '\n'
systemctl --no-pager --full status "$SYSTEMD_UNIT" | sed -n '1,12p'
printf '\nNginx: '; systemctl is-active nginx
printf 'API: '; systemctl is-active "$SYSTEMD_UNIT"
printf 'HTTPS: '; curl -sSI --max-time 15 "https://${DOMAIN}/" | head -1
printf '\nDeployment completed for https://%s\n' "$DOMAIN"
