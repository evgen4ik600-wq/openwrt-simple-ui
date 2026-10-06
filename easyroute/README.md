# EasyRoute for OpenWrt 25.12

Минималистичный интерфейс для маршрутизации доменов/IP через AmneziaWG на OpenWrt.

## Что делает

- одна страница LuCI: **Сеть → Маршруты VPN**;
- ручной ввод доменов/IP/CIDR;
- импорт `.txt`;
- маршрут через `AWG` или обычный `WAN`;
- включение/выключение, редактирование и удаление правил;
- использует `pbr` + `dnsmasq-full`/nftset, не меняет ключи и параметры AmneziaWG.

## Поддерживаемый импорт TXT

- `chatgpt.com`
- `104.18.0.0/16`
- IPv6 / IPv6 CIDR
- `domain:example.com`, `full:example.com` (V2Fly)
- `route add 104.16.0.0 mask 255.240.0.0 0.0.0.0` (Keenetic/RockBlack)
- комментарии `# ...`

`regexp:`, `keyword:` и `include:` сознательно не импортируются.

## Установка

```sh
wget -qO- https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui/easyroute-v1/easyroute/install.sh | sh
```

## Удаление

```sh
wget -qO- https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui/easyroute-v1/easyroute/uninstall.sh | sh
```
