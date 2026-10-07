#!/bin/sh
set -eu

REPO_BASE='https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui/easyroute-stable/easyroute'
AWG_INSTALL_URL='https://raw.githubusercontent.com/Slava-Shchipunov/awg-openwrt/03b62269e2edc168504f057cffaafda11b25ed92/amneziawg-install.sh'
TMP='/tmp/easyroute-install'
BACKUP='/etc/easyroute/backup'

say() { printf '%s\n' "$*"; }
fail() { printf 'ОШИБКА: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = '0' ] || fail 'Запустите установщик от root.'
[ -f /etc/openwrt_release ] || fail 'Это не OpenWrt.'

VER="$(. /etc/openwrt_release; printf '%s' "${DISTRIB_RELEASE:-unknown}")"
case "$VER" in
    24.10*|25.12*) ;;
    *) fail "Эта стабильная сборка проверена для OpenWrt 24.10.x и 25.12.x. Сейчас: $VER" ;;
esac

if command -v apk >/dev/null 2>&1; then
    PKG='apk'
elif command -v opkg >/dev/null 2>&1; then
    PKG='opkg'
else
    fail 'Не найден менеджер пакетов apk/opkg.'
fi
command -v uci >/dev/null 2>&1 || fail 'Не найден uci.'
command -v fw4 >/dev/null 2>&1 || fail 'Не найден firewall4.'
command -v nft >/dev/null 2>&1 || fail 'Не найден nftables.'
command -v ip >/dev/null 2>&1 || fail 'Не найдена команда ip.'
command -v wget >/dev/null 2>&1 || fail 'Не найден wget.'
[ -r /usr/share/libubox/jshn.sh ] || fail 'Не найден jshn (libubox).'
[ -d /www/luci-static/resources/view ] || fail 'LuCI не установлен. Используйте образ OpenWrt с LuCI.'

AUTO_INC="$(uci -q get firewall.@defaults[0].auto_includes 2>/dev/null || echo 1)"
[ "$AUTO_INC" != '0' ] || fail 'В firewall отключён auto_includes. Включите его перед установкой.'

FREE_KB="$(df -k /overlay 2>/dev/null | awk 'NR==2{print $4}')"
[ -n "$FREE_KB" ] || FREE_KB="$(df -k / 2>/dev/null | awk 'NR==2{print $4}')"
MIN_KB=700
if ! dnsmasq --version 2>/dev/null | grep -q ' nftset '; then MIN_KB=$((MIN_KB+600)); fi
pkg_has() {
    case "$PKG" in
        apk) apk info -e "$1" >/dev/null 2>&1 ;;
        opkg) opkg status "$1" 2>/dev/null | grep -q '^Status: install' ;;
    esac
}
if ! command -v awg >/dev/null 2>&1 || ! pkg_has kmod-amneziawg || ! pkg_has luci-proto-amneziawg; then
    MIN_KB=$((MIN_KB+1600))
fi
[ "${FREE_KB:-0}" -ge "$MIN_KB" ] || fail "Слишком мало свободной flash: ${FREE_KB:-0} КБ. Для безопасной установки нужно минимум ${MIN_KB} КБ."

say "EasyRoute v1.0.0 bootstrap: OpenWrt $VER, свободно $((FREE_KB/1024)) МБ"

# Устанавливаем поддержку AmneziaWG 3.1, но НЕ создаём VPN-подключение.
if ! command -v awg >/dev/null 2>&1 || ! pkg_has kmod-amneziawg || ! pkg_has luci-proto-amneziawg; then
    say 'Устанавливаю поддержку AmneziaWG 3.1...'
    AWG_SCRIPT='/tmp/easyroute-amneziawg-install.sh'
    wget -qO "$AWG_SCRIPT" "$AWG_INSTALL_URL" || fail 'Не удалось скачать установщик AmneziaWG.'
    [ -s "$AWG_SCRIPT" ] || fail 'Установщик AmneziaWG пустой.'
    sh -n "$AWG_SCRIPT" || fail 'Ошибка синтаксиса установщика AmneziaWG.'
    if ! printf 'y\n' | sh "$AWG_SCRIPT" -n; then
        fail 'Не удалось установить AmneziaWG 3.1.'
    fi
    rm -f "$AWG_SCRIPT"
else
    say 'AmneziaWG уже установлен — пропускаю.'
fi

command -v awg >/dev/null 2>&1 || fail 'После установки не найдена команда awg.'
awg --version 2>/dev/null | grep -q 'v3\.1' || fail "Ожидалась AmneziaWG 3.1, получено: $(awg --version 2>/dev/null || echo unknown)"

if ! dnsmasq --version 2>/dev/null | grep -q ' nftset '; then
    say 'Устанавливаю dnsmasq-full (нужен nftset)...'
    if [ "$PKG" = 'apk' ]; then
        apk -U add dnsmasq-full >/tmp/easyroute-pkg.log 2>&1
    else
        opkg update >/tmp/easyroute-pkg.log 2>&1 && opkg install dnsmasq-full >>/tmp/easyroute-pkg.log 2>&1
    fi || {
        cat /tmp/easyroute-pkg.log >&2 || true
        fail 'Не удалось установить dnsmasq-full.'
    }
fi

dnsmasq --version 2>/dev/null | grep -q ' nftset ' || fail 'dnsmasq установлен без поддержки nftset.'

# Если VPN уже настроен — используем его. На чистой системе оставляем имя AWG как безопасный placeholder.
EXISTING="$(uci -q get easyroute.main.interface 2>/dev/null || true)"
IFACE=''
if [ -n "$EXISTING" ] && [ "$(uci -q get "network.$EXISTING.proto" 2>/dev/null || true)" = 'amneziawg' ]; then
    IFACE="$EXISTING"
fi
[ -n "$IFACE" ] || IFACE="$(uci show network 2>/dev/null | sed -n "s/^network\.\([^.=]*\)\.proto='amneziawg'$/\1/p" | head -n1)"
[ -n "$IFACE" ] || IFACE="${EXISTING:-AWG}"

rm -rf "$TMP"; mkdir -p "$TMP"
FILES='files/usr/libexec/easyroute files/usr/libexec/easyroute-url-update files/usr/libexec/rpcd/luci.easyroute files/etc/init.d/easyroute files/etc/hotplug.d/iface/95-easyroute files/usr/share/luci/menu.d/luci-app-easyroute.json files/usr/share/rpcd/acl.d/luci-app-easyroute.json files/www/luci-static/resources/view/easyroute/routes.js'
for f in $FILES; do
    mkdir -p "$TMP/$(dirname "$f")"
    wget -qO "$TMP/$f" "$REPO_BASE/$f" || fail "Не удалось скачать $f"
    [ -s "$TMP/$f" ] || fail "Пустой файл $f"
done

# Локальные проверки до копирования в систему.
sh -n "$TMP/files/usr/libexec/easyroute" || fail 'Ошибка синтаксиса easyroute.'
sh -n "$TMP/files/usr/libexec/easyroute-url-update" || fail 'Ошибка синтаксиса URL updater.'
sh -n "$TMP/files/usr/libexec/rpcd/luci.easyroute" || fail 'Ошибка синтаксиса RPC.'
sh -n "$TMP/files/etc/init.d/easyroute" || fail 'Ошибка синтаксиса init.'
sh -n "$TMP/files/etc/hotplug.d/iface/95-easyroute" || fail 'Ошибка синтаксиса hotplug.'
grep -q '"admin/network/easyroute"' "$TMP/files/usr/share/luci/menu.d/luci-app-easyroute.json" || fail 'Повреждён файл меню LuCI.'
grep -q '"luci-app-easyroute"' "$TMP/files/usr/share/rpcd/acl.d/luci-app-easyroute.json" || fail 'Повреждён ACL.'

mkdir -p /etc/easyroute/lists "$BACKUP"
if [ ! -f "$BACKUP/.created" ]; then
    cp -p /etc/dnsmasq.conf "$BACKUP/dnsmasq.conf" 2>/dev/null || true
    cp -p /etc/config/firewall "$BACKUP/firewall" 2>/dev/null || true
    cp -p /etc/config/dhcp "$BACKUP/dhcp" 2>/dev/null || true
    cp -p /etc/config/network "$BACKUP/network" 2>/dev/null || true
    date > "$BACKUP/.created"
fi

for f in $FILES; do
    dst="/${f#files/}"
    mkdir -p "$(dirname "$dst")"
    cp "$TMP/$f" "$dst"
done
chmod 0755 /usr/libexec/easyroute /usr/libexec/easyroute-url-update /usr/libexec/rpcd/luci.easyroute /etc/init.d/easyroute /etc/hotplug.d/iface/95-easyroute

if [ ! -f /etc/config/easyroute ]; then
    cat > /etc/config/easyroute <<EOF2
config main 'main'
    option interface '$IFACE'

EOF2
else
    uci -q get easyroute.main >/dev/null 2>&1 || uci set easyroute.main=main
    uci set "easyroute.main.interface=$IFACE"
    uci commit easyroute
fi

/etc/init.d/easyroute enable

# URL-списки: cron проверяет каждый час, а каждый список обновляется только
# когда прошёл его update_interval (по умолчанию 86400 секунд = 24 часа).
CRON='/etc/crontabs/root'
mkdir -p /etc/crontabs
touch "$CRON"
awk '
  $0=="# EASYROUTE-URL-UPDATE-BEGIN" {skip=1; next}
  $0=="# EASYROUTE-URL-UPDATE-END" {skip=0; next}
  skip!=1 {print}
' "$CRON" > /tmp/easyroute-cron.$
{
    cat /tmp/easyroute-cron.$
    echo '# EASYROUTE-URL-UPDATE-BEGIN'
    echo '17 * * * * /usr/libexec/easyroute-url-update due >/tmp/easyroute-url-update.log 2>&1'
    echo '# EASYROUTE-URL-UPDATE-END'
} > "$CRON"
rm -f /tmp/easyroute-cron.$
/etc/init.d/cron enable >/dev/null 2>&1 || true
/etc/init.d/cron restart >/dev/null 2>&1 || true

/etc/init.d/rpcd restart >/dev/null 2>&1 || true
rm -f /tmp/luci-indexcache 2>/dev/null || true
rm -f /tmp/luci-modulecache/* 2>/dev/null || true

if ! out="$(/usr/libexec/easyroute apply 2>&1)"; then
    printf '%s\n' "$out" >&2
    fail 'Файлы установлены, но первичная проверка/применение не прошла.'
fi

FREE2="$(df -k /overlay 2>/dev/null | awk 'NR==2{print $4}')"
[ -n "$FREE2" ] || FREE2="$(df -k / 2>/dev/null | awk 'NR==2{print $4}')"

DETECTED="$(uci show network 2>/dev/null | sed -n "s/^network\.\([^.=]*\)\.proto='amneziawg'$/\1/p" | head -n1)"

say ''
say 'ГОТОВО.'
say 'Установлено:'
say '  ✓ AmneziaWG 3.1'
say '  ✓ LuCI-протокол AmneziaWG'
say '  ✓ dnsmasq-full + nftset'
say '  ✓ EasyRoute'
say '  ✓ URL-списки с автообновлением каждые 24 часа'
say "Свободно во flash: $((FREE2/1024)) МБ"
say ''
if [ -n "$DETECTED" ]; then
    say "Найдено AWG-подключение: $DETECTED"
    say 'Откройте LuCI: Сеть -> Маршруты VPN и добавляйте списки.'
else
    say 'Остался только один шаг: создать/импортировать ваше AWG 3.1 подключение в LuCI.'
    say 'LuCI -> Сеть -> Интерфейсы -> Добавить новый интерфейс -> AmneziaWG VPN.'
    say 'После поднятия AWG EasyRoute подхватит интерфейс автоматически.'
    say 'Затем: Сеть -> Маршруты VPN -> Добавить список/TXT.'
fi
