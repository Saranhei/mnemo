#!/usr/bin/env bash
#
# Compila e instala Mnemo en tu Mac, iPhone y iPad con un solo comando.
#
# Uso (desde la carpeta del proyecto, en la app Terminal de tu Mac):
#   ./scripts/build.sh mac            Compila e instala en /Applications de esta Mac
#   ./scripts/build.sh ios            Compila e instala en todos los iPhone/iPad conectados
#   ./scripts/build.sh ios "iPad"     ...solo en el dispositivo con ese nombre
#   ./scripts/build.sh all            Mac + iPhone/iPad
#   ./scripts/build.sh test           Corre los tests
#   ./scripts/build.sh team           Muestra tu Team ID (para Local.xcconfig)
#   ./scripts/build.sh open           Genera el proyecto y lo abre en Xcode
#
# Requisitos: Xcode instalado y tu Apple ID agregado en Xcode → Settings → Accounts.
# No pide ni guarda contraseñas: la firma la hace Xcode con la cuenta que ya tenés iniciada.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BUILD_DIR="$ROOT/build"
DERIVED="$BUILD_DIR/DerivedData"
LOG="$BUILD_DIR/xcodebuild.log"
PROJECT="Mnemo.xcodeproj"
SCHEME="Mnemo"

bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
info()  { printf "\033[36m▸ %s\033[0m\n" "$*"; }
ok()    { printf "\033[32m✔ %s\033[0m\n" "$*"; }
warn()  { printf "\033[33m⚠ %s\033[0m\n" "$*"; }
fail()  { printf "\033[31m✘ %s\033[0m\n" "$*" >&2; exit 1; }

# ─────────────────────────── Verificaciones ───────────────────────────

check_xcode() {
  [[ "$(uname)" == "Darwin" ]] || fail "Este script tiene que correr en una Mac."
  command -v xcodebuild >/dev/null || fail "No encuentro Xcode. Instalalo desde la Mac App Store y abrilo una vez."
  if [[ "$(xcode-select -p)" == *CommandLineTools* ]]; then
    fail "Xcode no está seleccionado. Corré:  sudo xcode-select -s /Applications/Xcode.app"
  fi
  xcodebuild -runFirstLaunch >/dev/null 2>&1 || true
}

check_xcodegen() {
  if command -v xcodegen >/dev/null; then return; fi
  if command -v brew >/dev/null; then
    info "Instalando XcodeGen (genera el proyecto de Xcode)…"
    brew install xcodegen
  else
    fail "Falta XcodeGen. Instalá Homebrew (https://brew.sh) y volvé a correr el script, o: brew install xcodegen"
  fi
}

check_local_config() {
  local cfg="Config/Local.xcconfig"
  if [[ ! -f "$cfg" ]]; then
    cp Config/Local.xcconfig.example "$cfg"
    warn "Creé $cfg. Abrilo, completá DEVELOPMENT_TEAM y BUNDLE_ID_PREFIX, y volvé a correr el script."
    warn "Tu Team ID lo ves con:  ./scripts/build.sh team"
    exit 1
  fi
  if grep -Eq '^DEVELOPMENT_TEAM *= *(XXXXXXXXXX)? *$' "$cfg"; then
    fail "Completá DEVELOPMENT_TEAM en $cfg (ver: ./scripts/build.sh team)."
  fi
  if grep -Eq '^BUNDLE_ID_PREFIX *= *com\.tunombre *$' "$cfg"; then
    fail "Cambiá BUNDLE_ID_PREFIX en $cfg por algo tuyo (ej. com.mishu). Tiene que ser único."
  fi
}

generate_project() {
  info "Generando $PROJECT…"
  xcodegen generate --quiet
  mkdir -p "$BUILD_DIR"
}

# Corre xcodebuild guardando el log completo y traduce los errores más comunes.
run_xcodebuild() {
  if ! xcodebuild -project "$PROJECT" -scheme "$SCHEME" -derivedDataPath "$DERIVED" \
        -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
        "$@" >"$LOG" 2>&1; then
    explain_failure
  fi
}

explain_failure() {
  echo
  grep -E "error:|No Accounts|No profiles|requires a provisioning|Signing for" "$LOG" | head -15 || true
  echo
  if grep -q "No Accounts" "$LOG"; then
    fail "Xcode no tiene tu Apple ID. Abrí Xcode → Settings → Accounts → + → Apple ID, y reintentá."
  elif grep -qiE "iCloud|CloudKit|aps-environment|Push Notifications" "$LOG"; then
    fail "Problema de firma con iCloud. Si tu cuenta es gratuita, poné MNEMO_ICLOUD = NO en Config/Local.xcconfig."
  elif grep -qiE "provisioning|signing" "$LOG"; then
    fail "Problema de firma. Revisá DEVELOPMENT_TEAM y que BUNDLE_ID_PREFIX sea único. Log completo: $LOG"
  else
    fail "La compilación falló. Log completo: $LOG (mandame las líneas con 'error:')"
  fi
}

# ─────────────────────────────── Acciones ───────────────────────────────

build_mac() {
  info "Compilando para Mac (puede tardar unos minutos la primera vez)…"
  run_xcodebuild -configuration Release -destination "generic/platform=macOS" build
  local app="$DERIVED/Build/Products/Release/Mnemo.app"
  [[ -d "$app" ]] || fail "No encontré la app compilada en $app"

  info "Instalando en /Applications…"
  osascript -e 'tell application "Mnemo" to quit' >/dev/null 2>&1 || true
  rm -rf "/Applications/Mnemo.app"
  ditto "$app" "/Applications/Mnemo.app"
  ok "Mnemo instalada en tu Mac (Aplicaciones → Mnemo)."
}

ensure_ios_platform() {
  if ! xcodebuild -showsdks 2>/dev/null | grep -q iphoneos; then
    info "Descargando el soporte de iOS para Xcode (una sola vez, varios GB)…"
    xcodebuild -downloadPlatform iOS
  fi
}

# Imprime "UDID<TAB>identificador<TAB>nombre" de cada iPhone/iPad emparejado.
list_ios_devices() {
  local json="$BUILD_DIR/devices.json"
  xcrun devicectl list devices --json-output "$json" >/dev/null 2>&1 || { echo ""; return; }
  /usr/bin/python3 - "$json" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
for d in data.get("result", {}).get("devices", []):
    hw = d.get("hardwareProperties", {})
    conn = d.get("connectionProperties", {})
    if hw.get("platform") != "iOS" or conn.get("pairingState") != "paired":
        continue
    print("\t".join([hw.get("udid", ""), d.get("identifier", ""), d.get("deviceProperties", {}).get("name", "")]))
PY
}

build_ios() {
  local only_name="${1:-}"
  ensure_ios_platform

  local devices
  devices="$(list_ios_devices)"
  if [[ -n "$only_name" ]]; then
    devices="$(printf "%s\n" "$devices" | awk -F'\t' -v n="$only_name" '$3 == n')"
  fi
  if [[ -z "$devices" ]]; then
    warn "No encontré iPhone/iPad emparejados${only_name:+ con el nombre \"$only_name\"}."
    cat <<'EOF'
  1. Conectá el iPhone/iPad con un cable USB y desbloquealo.
  2. Tocá "Confiar en esta computadora".
  3. En el dispositivo: Ajustes → Privacidad y seguridad → Modo de desarrollador → activar (reinicia).
  4. Volvé a correr:  ./scripts/build.sh ios
  (Después del primer emparejamiento también funciona por Wi-Fi en la misma red.)
EOF
    exit 1
  fi

  local app="$DERIVED/Build/Products/Release-iphoneos/Mnemo.app"
  local installed=0
  while IFS=$'\t' read -r udid identifier name; do
    [[ -z "$udid" ]] && continue
    info "Compilando para \"$name\"…"
    # Compilar con el dispositivo como destino hace que Xcode lo registre en tu cuenta.
    run_xcodebuild -configuration Release -destination "platform=iOS,id=$udid" build
    info "Instalando en \"$name\"…"
    if xcrun devicectl device install app --device "$identifier" "$app" >>"$LOG" 2>&1; then
      ok "Instalada en \"$name\"."
      installed=$((installed + 1))
    else
      warn "No se pudo instalar en \"$name\" (¿está desbloqueado y en la misma red?). Ver $LOG"
    fi
  done <<<"$devices"

  if (( installed > 0 )); then
    echo
    bold "Primera vez en cada dispositivo:"
    echo "  Ajustes → General → VPN y gestión de dispositivos → tu Apple ID → Confiar."
    if ! grep -Eq '^MNEMO_ICLOUD *= *YES' Config/Local.xcconfig; then
      echo "  Con cuenta gratuita de Apple la app deja de abrir a los 7 días: volvé a correr este script."
    fi
  fi
}

run_tests() {
  info "Corriendo tests en la Mac…"
  run_xcodebuild -destination "platform=macOS" test
  ok "Tests OK."
}

show_team() {
  check_xcode
  bold "Equipos de Apple configurados en Xcode:"
  local found=0
  # Certificados de desarrollo del llavero: el campo OU es el Team ID.
  while read -r line; do
    found=1; echo "  $line"
  done < <(security find-certificate -a -c "Apple Development" -p 2>/dev/null \
            | awk '/BEGIN/{c=""} {c=c $0 "\n"} /END/{print c | "openssl x509 -noout -subject"; close("openssl x509 -noout -subject")}' \
            | sed -nE 's/.*OU ?= ?([A-Z0-9]{10}).*CN ?= ?([^,\/]+).*/\1   (\2)/p; s/.*CN ?= ?([^,\/]+).*OU ?= ?([A-Z0-9]{10}).*/\2   (\1)/p' \
            | sort -u)
  if (( found == 0 )); then
    warn "No encontré certificados todavía."
    echo "  Abrí Xcode → Settings → Accounts → + → Apple ID. Después tocá 'Manage Certificates…' → + → Apple Development."
    echo "  Volvé a correr:  ./scripts/build.sh team"
  else
    echo "Copiá el código de 10 caracteres en DEVELOPMENT_TEAM de Config/Local.xcconfig."
  fi
}

# ─────────────────────────────── Main ───────────────────────────────

cmd="${1:-}"
case "$cmd" in
  team)
    show_team ;;
  mac|ios|all|test|open)
    check_xcode
    check_xcodegen
    check_local_config
    generate_project
    case "$cmd" in
      mac)  build_mac ;;
      ios)  build_ios "${2:-}" ;;
      all)  build_mac; build_ios "${2:-}" ;;
      test) run_tests ;;
      open) open "$PROJECT" ;;
    esac ;;
  *)
    sed -n '3,15p' "$0" | sed 's/^# \{0,1\}//'
    exit 1 ;;
esac
