#!/usr/bin/env bash
set -Eeuo pipefail

# Run once from the hosting provider's VPS web console as root.
# Usage:
#   TAVAAR_SSH_PUBLIC_KEY='ssh-ed25519 AAAA... comment' bash setup-tavaar-remote-admin.sh
# No private key is accepted or stored by this script.

DEPLOY_USER="tavaar-deploy"
APP_DIR="/opt/tavaar"
ENV_FILE="/etc/tavaar.env"
WRAPPER="/usr/local/sbin/tavaar-deploy"
SUDOERS="/etc/sudoers.d/tavaar-deploy"
KEY="${TAVAAR_SSH_PUBLIC_KEY:-}"

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
log() { printf '\n[%s] %s\n' "$(date '+%F %T')" "$*"; }

[[ "$(id -u)" == 0 ]] || fail 'Запустите скрипт от root через консоль хостинга.'
[[ -n "$KEY" ]] || fail 'Не задан TAVAAR_SSH_PUBLIC_KEY. Используйте только публичный ssh-ed25519 ключ.'
[[ "$KEY" =~ ^ssh-ed25519[[:space:]]+[A-Za-z0-9+/=]+([[:space:]].*)?$ ]] || fail 'Разрешён только корректный ssh-ed25519 публичный ключ.'
command -v sshd >/dev/null || fail 'Пакет OpenSSH Server не установлен.'
command -v visudo >/dev/null || fail 'Пакет sudo не установлен.'

log 'Создаём отдельного пользователя без root-доступа по паролю'
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash --comment 'Tavaar deployment user' "$DEPLOY_USER"
fi
passwd --lock "$DEPLOY_USER" >/dev/null 2>&1 || true
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0700 "/home/$DEPLOY_USER/.ssh"
printf '%s\n' "$KEY" > "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 0600 "/home/$DEPLOY_USER/.ssh/authorized_keys"

log 'Создаём root-owned безопасный wrapper для обновления Tavaar'
cat > "$WRAPPER" <<'WRAPPER'
#!/usr/bin/env bash
set -Eeuo pipefail
APP_DIR="/opt/tavaar"
ENV_FILE="/etc/tavaar.env"
WEB_ROOT="$APP_DIR/web-dist"
APP_USER="tavaar"

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ "$(id -u)" == 0 ]] || fail 'wrapper must run as root'
[[ -d "$APP_DIR" ]] || fail "$APP_DIR not found"

case "${1:-}" in
  status)
    systemctl --no-pager --full status tavaar-app.service 2>/dev/null || systemctl --no-pager --full status tavaar-api.service
    systemctl --no-pager --full status nginx
    ;;
  logs)
    journalctl -u tavaar-app.service -u tavaar-api.service -n 120 --no-pager
    tail -80 /var/log/nginx/error.log 2>/dev/null || true
    ;;
  deploy)
    cd "$APP_DIR"
    git pull --ff-only origin main
    runuser -u "$APP_USER" -- env HOME="$APP_DIR" bash -lc "cd '$APP_DIR' && pnpm install --frozen-lockfile"
    runuser -u "$APP_USER" -- env HOME="$APP_DIR" bash -lc "cd '$APP_DIR' && pnpm check"
    runuser -u "$APP_USER" -- env HOME="$APP_DIR" bash -lc "cd '$APP_DIR' && pnpm build"
    runuser -u "$APP_USER" -- env HOME="$APP_DIR" bash -lc "cd '$APP_DIR' && EXPO_PUBLIC_API_BASE_URL='https://tavaar.online' pnpm exec expo export --platform web --output-dir web-dist"
    test -s "$WEB_ROOT/index.html" || fail 'web-dist/index.html missing'
    test -s "$WEB_ROOT/manus-routes.json" || fail 'web-dist/manus-routes.json missing'
    chown -R "$APP_USER:$APP_USER" "$WEB_ROOT"
    find "$WEB_ROOT" -type d -exec chmod 755 {} \;
    find "$WEB_ROOT" -type f -exec chmod 644 {} \;
    systemctl restart tavaar-app.service 2>/dev/null || systemctl restart tavaar-api.service
    nginx -t
    systemctl reload nginx
    curl -fsS --max-time 15 http://127.0.0.1:3000/api/health
    printf '\nDeployment completed.\n'
    ;;
  restart)
    systemctl restart tavaar-app.service 2>/dev/null || systemctl restart tavaar-api.service
    nginx -t
    systemctl reload nginx
    ;;
  *)
    printf 'Usage: %s {status|logs|deploy|restart}\n' "$0"
    exit 2
    ;;
esac
WRAPPER
chown root:root "$WRAPPER"
chmod 0755 "$WRAPPER"

log 'Ограничиваем sudo только безопасным wrapper'
cat > "$SUDOERS" <<EOF
Defaults:$DEPLOY_USER !authenticate
$DEPLOY_USER ALL=(root) NOPASSWD: $WRAPPER
EOF
chmod 0440 "$SUDOERS"
visudo -cf "$SUDOERS"

log 'Усиливаем SSH без отключения текущего root-сеанса'
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/60-tavaar-deploy.conf <<EOF
# Managed for Tavaar deploy user. Existing users and root policy are preserved.
Match User $DEPLOY_USER
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    PubkeyAuthentication yes
    AuthenticationMethods publickey
EOF
sshd -t
systemctl reload ssh 2>/dev/null || systemctl reload sshd

log 'Готово'
printf '%s\n' "Пользователь: $DEPLOY_USER"
printf '%s\n' "Команды после подключения: sudo $WRAPPER status | sudo $WRAPPER logs | sudo $WRAPPER deploy"
printf '%s\n' 'Root-пароль не использовался, приватный ключ не сохранялся.'
