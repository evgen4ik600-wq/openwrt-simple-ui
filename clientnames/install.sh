#!/bin/sh
set -eu

BASE='https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui/easyroute-stable/clientnames'
TMP='/tmp/clientnames-install'

say() { printf '%s\n' "$*"; }
fail() { printf 'ОШИБКА: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = '0' ] || fail 'Запустите установщик от root.'
[ -f /etc/openwrt_release ] || fail 'Это не OpenWrt.'

VER="$(. /etc/openwrt_release; printf '%s' "${DISTRIB_RELEASE:-unknown}")"
case "$VER" in 25.12*) ;; *) fail "Стабильная версия рассчитана на OpenWrt 25.12.x. Сейчас: $VER" ;; esac

[ -f /www/luci-static/resources/view/status/include/60_wifi.js ] || fail 'Не найден штатный Wi-Fi блок LuCI.'
[ -r /usr/share/libubox/jshn.sh ] || fail 'Не найден jshn.'
command -v uci >/dev/null 2>&1 || fail 'Не найден uci.'
command -v wget >/dev/null 2>&1 || fail 'Не найден wget.'

rm -rf "$TMP"
mkdir -p "$TMP"

FILES='files/usr/libexec/rpcd/luci.clientnames files/usr/share/rpcd/acl.d/luci-clientnames.json files/www/luci-static/resources/view/status/include/61_clientnames.js'
for f in $FILES; do
	mkdir -p "$TMP/$(dirname "$f")"
	wget -qO "$TMP/$f" "$BASE/$f" || fail "Не удалось скачать $f"
	[ -s "$TMP/$f" ] || fail "Пустой файл $f"
done

sh -n "$TMP/files/usr/libexec/rpcd/luci.clientnames" || fail 'Ошибка синтаксиса RPC.'

mkdir -p /etc/config
[ -f /etc/config/clientnames ] || : > /etc/config/clientnames

for f in $FILES; do
	dst="/${f#files/}"
	mkdir -p "$(dirname "$dst")"
	cp "$TMP/$f" "$dst"
done

chmod 0755 /usr/libexec/rpcd/luci.clientnames

/etc/init.d/rpcd restart >/dev/null 2>&1 || true
rm -f /tmp/luci-indexcache 2>/dev/null || true
rm -f /tmp/luci-modulecache/* 2>/dev/null || true

say ''
say 'ГОТОВО.'
say 'Штатные файлы LuCI не заменялись.'
say 'Откройте: Статус -> Обзор -> Подключённые клиенты.'
say 'В колонке «Хост» появится кнопка ✎ для переименования.'
say 'Пользовательские имена хранятся в /etc/config/clientnames.'
