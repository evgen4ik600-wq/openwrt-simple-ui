#!/bin/sh
set -eu
URL='https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui/easyroute-stable/easyroute/install.sh'
TMP='/tmp/openwrt-easyroute-install.sh'
wget -qO "$TMP" "$URL"
[ -s "$TMP" ] || { echo 'Не удалось скачать EasyRoute installer.' >&2; exit 1; }
exec sh "$TMP"
