#!/bin/sh
set -eu

REPO_BASE='https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui/main/easyroute'
TMP='/tmp/easyroute-install'
BACKUP='/etc/easyroute/backup'

say() { printf '%s\n' "$*"; }
fail() { printf 'ОШИБКА: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = '0' ] || fail 'Запустите установщик от root.'
[ -f /etc/openwrt_release ] || fail 'Это не OpenWrt.'

VER="$(. /etc/openwrt_release; printf '%s' "${DISTRIB_RELEASE:-unknown}")"
case "$VER" in 25.12*|26.*|27.*) ;; *) fail "Поддерживается OpenWrt 25.12.x и новее. Сейчас: $VER" ;; esac

command -v apk >/dev/null 2>&1 || fail 'Не найден apk.'
command -v uci >/dev/null 2>&1 || fail 'Не найден uci.'
command -v fw4 >/dev/null 2>&1 || fail 'Не найден firewall4.'
command -v nft >/dev/null 2>&1 || fail 'Не найден nftables.'
command -v ip >/dev/null 2>&1 || fail 'Не найдена команда ip.'
command -v wget >/dev/null 2>&1 || fail 'Не найден wget.'
[ -r /usr/share/libubox/jshn.sh ] || fail 'Не найден jshn (libubox).'
[ -d /www/luci-static/resources/view ] || fail 'LuCI не установлен.'
AUTO_INC="$(uci -q get firewall.@defaults[0].auto_includes 2>/dev/null || echo 1)"
[ "$AUTO_INC" != '0' ] || fail 'В firewall отключён auto_includes. Включите его перед установкой.'

IFACE="$(uci show network 2>/dev/null | sed -n "s/^network\.\([^.=]*\)\.proto='amneziawg'$/\1/p" | head -n1)"
[ -n "$IFACE" ] || { ip link show AWG >/dev/null 2>&1 && IFACE='AWG'; }
[ -n "$IFACE" ] || fail 'AmneziaWG-интерфейс не найден. Сначала создайте рабочий AWG.'

FREE_KB="$(df -k /overlay 2>/dev/null | awk 'NR==2{print $4}')"
[ -n "$FREE_KB" ] || FREE_KB="$(df -k / 2>/dev/null | awk 'NR==2{print $4}')"
MIN_KB=700
if ! dnsmasq --version 2>/dev/null | grep -q ' nftset '; then MIN_KB=1200; fi
[ "${FREE_KB:-0}" -ge "$MIN_KB" ] || fail "Слишком мало свободной flash: ${FREE_KB:-0} КБ. Нужно минимум ${MIN_KB} КБ."

say "EasyRoute: OpenWrt $VER, интерфейс $IFACE, свободно $((FREE_KB/1024)) МБ"

if ! dnsmasq --version 2>/dev/null | grep -q ' nftset '; then
    say 'Устанавливаю dnsmasq-full (нужен nftset)...'
    apk --update-cache add dnsmasq-full >/tmp/easyroute-apk.log 2>&1 || {
        cat /tmp/easyroute-apk.log >&2 || true
        fail 'Не удалось установить dnsmasq-full.'
    }
fi

dnsmasq --version 2>/dev/null | grep -q ' nftset ' || fail 'dnsmasq установлен без поддержки nftset.'

rm -rf "$TMP"; mkdir -p "$TMP"
FILES='files/usr/libexec/easyroute files/usr/libexec/rpcd/luci.easyroute files/etc/init.d/easyroute files/etc/hotplug.d/iface/95-easyroute files/usr/share/luci/menu.d/luci-app-easyroute.json files/usr/share/rpcd/acl.d/luci-app-easyroute.json files/www/luci-static/resources/view/easyroute/routes.js'
for f in $FILES; do
    mkdir -p "$TMP/$(dirname "$f")"
    wget -qO "$TMP/$f" "$REPO_BASE/$f" || fail "Не удалось скачать $f"
    [ -s "$TMP/$f" ] || fail "Пустой файл $f"
done

sh -n "$TMP/files/usr/libexec/easyroute" || fail 'Ошибка синтаксиса easyroute.'
sh -n "$TMP/files/usr/libexec/rpcd/luci.easyroute" || fail 'Ошибка синтаксиса RPC.'
sh -n "$TMP/files/etc/init.d/easyroute" || fail 'Ошибка синтаксиса init.'
sh -n "$TMP/files/etc/hotplug.d/iface/95-easyroute" || fail 'Ошибка синтаксиса hotplug.'

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
chmod 0755 /usr/libexec/easyroute /usr/libexec/rpcd/luci.easyroute /etc/init.d/easyroute /etc/hotplug.d/iface/95-easyroute

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
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
rm -f /tmp/luci-indexcache /tmp/luci-modulecache/* 2>/dev/null || true

if ! out="$(/usr/libexec/easyroute apply 2>&1)"; then
    printf '%s\n' "$out" >&2
    fail 'Файлы установлены, но первичная проверка/применение не прошла.'
fi

FREE2="$(df -k /overlay 2>/dev/null | awk 'NR==2{print $4}')"
[ -n "$FREE2" ] || FREE2="$(df -k / 2>/dev/null | awk 'NR==2{print $4}')"
say ''
say 'ГОТОВО.'
say "Откройте LuCI: Сеть -> Маршруты VPN"
say "AWG: $IFACE"
say "Свободно во flash: $((FREE2/1024)) МБ"
say 'Добавьте список вручную или загрузите TXT и нажмите «Сохранить и применить».'
