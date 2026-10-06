#!/bin/sh
set -eu
BASE='https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui/easyroute-stable'
TMP='/tmp/r4ag-bootstrap'
echo '=== Xiaomi Mi Router 4A Gigabit: bootstrap ==='
wget -qO "$TMP" "$BASE/openwrt-easyroute-install.sh"
[ -s "$TMP" ] || { echo 'Не удалось скачать основной установщик.' >&2; exit 1; }
sh "$TMP"
echo
echo '=== Проверка EEPROM 5 ГГц ==='
wget -qO "$TMP" "$BASE/r4ag/prepare-5g-factory.sh"
[ -s "$TMP" ] || { echo 'Не удалось скачать EEPROM helper.' >&2; exit 1; }
sh "$TMP"
echo
echo 'Bootstrap завершён.'
