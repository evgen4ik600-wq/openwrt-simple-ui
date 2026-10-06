# EasyRoute for OpenWrt

Минималистичная маршрутизация выбранных доменов/IP/CIDR через уже настроенный AmneziaWG.

Поддержка: OpenWrt 25.12.x+, firewall4/nftables, dnsmasq-full nftset, AmneziaWG.

## Установка

```sh
wget -qO- https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui/main/easyroute/install.sh | sh
```

После установки: **Сеть → Маршруты VPN**.

TXT: по одной записи в строке. Поддерживаются домены, IPv4/IPv6, CIDR, `domain:`, `full:` и простые строки Keenetic `route add ... mask ...`.

## Удаление

```sh
wget -qO- https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui/main/easyroute/uninstall.sh | sh
```
