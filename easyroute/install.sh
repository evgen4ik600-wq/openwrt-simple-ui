#!/bin/sh
set -eu

BASE_URL='https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui/easyroute-v1/easyroute/files'
TMP='/tmp/easyroute-install'
BACKUP='/etc/easyroute-backup'

say() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = '0' ] || die 'запусти установщик от root'
[ -r /etc/openwrt_release ] || die 'это не OpenWrt'
. /etc/openwrt_release
case "${DISTRIB_RELEASE:-}" in 25.12*) ;; *) die "поддерживается OpenWrt 25.12.x; найдено: ${DISTRIB_RELEASE:-unknown}" ;; esac
command -v apk >/dev/null 2>&1 || die 'apk не найден'
command -v uci >/dev/null 2>&1 || die 'uci не найден'
command -v wget >/dev/null 2>&1 || die 'wget не найден'
command -v awg >/dev/null 2>&1 || die 'AmneziaWG не установлен'
uci -q get network.AWG >/dev/null 2>&1 || die "не найден сетевой интерфейс UCI 'AWG'"

FREE_KB="$(df -k /overlay 2>/dev/null | awk 'NR==2 {print $4}')"
[ -n "$FREE_KB" ] || FREE_KB=0
say "Свободно во flash: ${FREE_KB} КБ"
[ "$FREE_KB" -ge 1200 ] || die 'нужно хотя бы 1200 КБ свободной flash-памяти'

rm -rf "$TMP"
mkdir -p "$TMP" "$BACKUP"
cp -pf /etc/config/pbr "$BACKUP/pbr.before-easyroute" 2>/dev/null || true
cp -pf /etc/config/dhcp "$BACKUP/dhcp.before-easyroute" 2>/dev/null || true
cp -pf /etc/config/firewall "$BACKUP/firewall.before-easyroute" 2>/dev/null || true

say '[1/8] Обновляю список пакетов...'
apk update >/dev/null || die 'apk update завершился ошибкой'

say '[2/8] Устанавливаю минимальный движок маршрутизации PBR...'
apk add pbr >/dev/null || die 'не удалось установить pbr'

if ! dnsmasq --version 2>/dev/null | grep -q ' nftset '; then
	say '[3/8] Включаю поддержку доменов (dnsmasq-full)...'
	apk add dnsmasq-full >/dev/null || die 'не удалось установить dnsmasq-full'
	/etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
else
	say '[3/8] dnsmasq уже поддерживает nftset.'
fi

dnsmasq --version 2>/dev/null | grep -q ' nftset ' || die 'dnsmasq запущен без nftset; установка остановлена'

say '[4/8] Настраиваю PBR для AWG...'
uci -q set pbr.config.enabled='1'
uci -q set pbr.config.resolver_set='dnsmasq.nftset'
uci -q set pbr.config.strict_enforcement='0'
uci -q set pbr.config.ipv6_enabled='1'
if ! uci -q get pbr.config.supported_interface 2>/dev/null | tr ' ' '\n' | grep -qx 'AWG'; then
	uci -q add_list pbr.config.supported_interface='AWG'
fi
uci commit pbr

say '[5/8] Проверяю firewall для AWG...'
. /lib/functions.sh
AWG_ZONE_SECTION=''
AWG_ZONE_NAME=''
LAN_ZONE_NAME=''
FWD_FOUND=0
find_awg_zone() {
	local sec="$1" name nets n
	config_get name "$sec" name
	config_get nets "$sec" network
	for n in $nets; do
		if [ "$n" = 'AWG' ]; then AWG_ZONE_SECTION="$sec"; AWG_ZONE_NAME="$name"; fi
	done
}
find_lan_zone() {
	local sec="$1" name nets n
	config_get name "$sec" name
	config_get nets "$sec" network
	for n in $nets; do
		if [ "$n" = 'lan' ]; then LAN_ZONE_NAME="$name"; fi
	done
}
config_load firewall
config_foreach find_awg_zone zone
config_foreach find_lan_zone zone
[ -n "$LAN_ZONE_NAME" ] || die 'не найдена firewall-зона LAN'
if [ -z "$AWG_ZONE_NAME" ]; then
	AWG_ZONE_SECTION="$(uci add firewall zone)"
	AWG_ZONE_NAME='easyroute_vpn'
	uci set "firewall.$AWG_ZONE_SECTION.name=$AWG_ZONE_NAME"
	uci add_list "firewall.$AWG_ZONE_SECTION.network=AWG"
	uci set "firewall.$AWG_ZONE_SECTION.input=REJECT"
	uci set "firewall.$AWG_ZONE_SECTION.output=ACCEPT"
	uci set "firewall.$AWG_ZONE_SECTION.forward=REJECT"
	uci set "firewall.$AWG_ZONE_SECTION.easyroute=1"
fi
uci set "firewall.$AWG_ZONE_SECTION.masq=1"
uci set "firewall.$AWG_ZONE_SECTION.masq6=1"
uci set "firewall.$AWG_ZONE_SECTION.mtu_fix=1"
find_fwd() {
	local sec="$1" src dst
	config_get src "$sec" src
	config_get dst "$sec" dest
	[ "$src" = "$LAN_ZONE_NAME" ] && [ "$dst" = "$AWG_ZONE_NAME" ] && FWD_FOUND=1
}
config_load firewall
config_foreach find_fwd forwarding
if [ "$FWD_FOUND" -ne 1 ]; then
	f="$(uci add firewall forwarding)"
	uci set "firewall.$f.src=$LAN_ZONE_NAME"
	uci set "firewall.$f.dest=$AWG_ZONE_NAME"
	uci set "firewall.$f.easyroute=1"
fi
uci commit firewall
/etc/init.d/firewall reload >/dev/null 2>&1 || die 'не удалось применить firewall'

say '[6/8] Устанавливаю минимальный интерфейс LuCI...'
for rel in \
	'www/luci-static/resources/view/network/easyroute.js' \
	'usr/share/luci/menu.d/easyroute.json' \
	'usr/share/rpcd/acl.d/easyroute.json'
do
	mkdir -p "$TMP/$(dirname "$rel")"
	wget -qO "$TMP/$rel" "$BASE_URL/$rel" || die "не удалось скачать $rel"
	[ -s "$TMP/$rel" ] || die "скачан пустой файл $rel"
done

mkdir -p /www/luci-static/resources/view/network /usr/share/luci/menu.d /usr/share/rpcd/acl.d
cp -f "$TMP/www/luci-static/resources/view/network/easyroute.js" /www/luci-static/resources/view/network/easyroute.js
cp -f "$TMP/usr/share/luci/menu.d/easyroute.json" /usr/share/luci/menu.d/easyroute.json
cp -f "$TMP/usr/share/rpcd/acl.d/easyroute.json" /usr/share/rpcd/acl.d/easyroute.json
chmod 0644 /www/luci-static/resources/view/network/easyroute.js /usr/share/luci/menu.d/easyroute.json /usr/share/rpcd/acl.d/easyroute.json

say '[7/8] Перезапускаю службы...'
rm -f /tmp/luci-indexcache 2>/dev/null || true
rm -rf /tmp/luci-modulecache 2>/dev/null || true
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
/etc/init.d/pbr enable >/dev/null 2>&1 || true
/etc/init.d/pbr restart >/tmp/easyroute-pbr.log 2>&1 || {
	cat /tmp/easyroute-pbr.log >&2
	die 'PBR не запустился'
}

say '[8/8] Финальная проверка...'
[ -s /www/luci-static/resources/view/network/easyroute.js ] || die 'LuCI view отсутствует'
[ -s /usr/share/luci/menu.d/easyroute.json ] || die 'LuCI menu отсутствует'
[ -s /usr/share/rpcd/acl.d/easyroute.json ] || die 'LuCI ACL отсутствует'
/etc/init.d/pbr status >/dev/null 2>&1 || die 'PBR не работает после установки'
dnsmasq --version 2>/dev/null | grep -q ' nftset ' || die 'nftset недоступен'

HANDSHAKE="$(awg show AWG latest-handshakes 2>/dev/null | awk 'BEGIN{m=0} {if ($NF>m)m=$NF} END{print m+0}')"
LAN_IP="$(uci -q get network.lan.ipaddr || echo 192.168.1.1)"
FREE_AFTER="$(df -k /overlay 2>/dev/null | awk 'NR==2 {print $4}')"
USED=$((FREE_KB - FREE_AFTER))
[ "$USED" -lt 0 ] && USED=0

rm -rf "$TMP"
say ''
say '=== EasyRoute установлен ==='
say "Использовано flash примерно: ${USED} КБ"
if [ "$HANDSHAKE" -gt 0 ]; then
	say 'AWG: handshake есть'
else
	say 'AWG: интерфейс найден, но свежий handshake не подтверждён'
fi
say "Открой: http://${LAN_IP}/cgi-bin/luci/admin/network/easyroute"
say 'Дальше: + Добавить или Загрузить TXT -> выбрать AWG -> Сохранить.'
