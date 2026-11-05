#!/usr/bin/env bash
set -Eeuo pipefail

# Lightweight bootstrapper for Debian 13/Ubuntu 22.04.
# It downloads the project archive as small parallel parts, verifies the SHA-256,
# then launches the full installer. It contains no application secrets.

[[ "$(id -u)" == "0" ]] || { echo "Запустите команду от имени root." >&2; exit 1; }

BASE="https://files.manuscdn.com/user_upload_by_module/session_file/310519664061431992"
INSTALLER_URL="${BASE}/EYbfUBOcPVQEhCHO.sh"
ARCHIVE_SHA256="b6f1f35133f7b3e22b5a7ff52af1dfd9abdbd50236cda0e83d2ccd412cb9f614"

URLS=(
  "${BASE}/RBDyyOqrvZCuNdCj.part-00"
  "${BASE}/EAGLhGsEmNrIULSM.part-01"
  "${BASE}/xyeGMEHeoetcoxOG.part-02"
  "${BASE}/bRAAgClCclbFUWJR.part-03"
  "${BASE}/IjQzCkYwLXWvdHHO.part-04"
  "${BASE}/cFFTledAvWImVMZY.part-05"
  "${BASE}/uKzCBjWoIcBFsRXz.part-06"
  "${BASE}/pprgjVoBkOlixpsY.part-07"
)

TMP_DIR="$(mktemp -d /tmp/tavaar-install.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

printf '[1/4] Скачивание %s небольших частей параллельно...\n' "${#URLS[@]}"
for i in "${!URLS[@]}"; do
  printf '%s\n' "$i ${URLS[$i]}"
done | xargs -P 8 -n 2 bash -c '
  i="$1"; url="$2"
  curl -fsSL --retry 5 --retry-delay 2 --connect-timeout 15 --max-time 120 "$url" -o "$0/part-$(printf "%02d" "$i")"
' "$TMP_DIR"

printf '[2/4] Сборка и проверка архива...\n'
cat "$TMP_DIR"/part-* > "$TMP_DIR/project.tar.gz"
printf '%s  %s\n' "$ARCHIVE_SHA256" "$TMP_DIR/project.tar.gz" | sha256sum -c -
tar -tzf "$TMP_DIR/project.tar.gz" >/dev/null

printf '[3/4] Скачивание основного установщика...\n'
curl -fsSL --retry 5 --retry-delay 2 --connect-timeout 15 --max-time 120 "$INSTALLER_URL" -o "$TMP_DIR/install-tavaar.sh"
chmod 700 "$TMP_DIR/install-tavaar.sh"
bash -n "$TMP_DIR/install-tavaar.sh"

printf '[4/4] Запуск установки приложения...\n'
exec bash "$TMP_DIR/install-tavaar.sh" --bundle-url "file://$TMP_DIR/project.tar.gz" "$@"
