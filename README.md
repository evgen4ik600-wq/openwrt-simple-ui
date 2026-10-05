# OpenWrt Simple UI 1.1.1

Лёгкий интерфейс для OpenWrt 25.12.x в логике KeeneticOS 5.1.x: основные функции вынесены в понятный раздел **«Домашняя сеть»**, а штатная LuCI остаётся доступна как **«Расширенные настройки»**.

## Что входит

- Обзор: Интернет, Wi‑Fi, устройства, AmneziaWG, память.
- Интернет: состояние WAN и DNS.
- Wi‑Fi: имя сети, пароль, защита, включение/выключение точки.
- Устройства: простой список DHCP-клиентов.
- VPN и маршруты:
  - автоматическое определение AmneziaWG / WireGuard;
  - GeoSite-категории;
  - GeoIP-наборы;
  - свои домены и IP/CIDR;
  - автоматическое обновление раз в сутки;
  - DNS interception для обычного TCP/UDP 53;
  - собственные nftables sets и policy routing без PBR.
- Система: модель, OpenWrt, RAM и свободная flash.

## Оптимизация для маленькой flash

Проект не ставит PassWall, Xray, sing-box или другие тяжёлые движки.

GeoSite/GeoIP скачиваются **только для выбранных категорий** и хранятся в `/tmp` (RAM), а не во flash. Большие страновые GeoIP-списки по умолчанию выключены.

Для динамической маршрутизации доменов используется `dnsmasq-full` с nftset.

## Безопасность установки

Версия 1.1.1 использует **зафиксированный commit** для всех внутренних файлов установки. Это исключает ситуацию, когда GitHub CDN отдаёт старую версию одного из helper-скриптов.

Firewall helper больше не использует `/lib/functions.sh` / `config_load`; он работает через прямые UCI-вызовы.

Перед включением маршрутизации установщик автоматически проверяет:
- OpenWrt;
- наличие `nft`, `ip`, `dnsmasq`;
- nftset;
- состояние VPN;
- основной default route;
- валидность firewall4;
- свободную RAM и flash.

Если критическая проверка не проходит, smart routing не включается и обычный WAN сохраняется.

## Установка

Для текущей версии:

```sh
wget -qO- https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui/main/i111.sh | sh
```

После установки:

**LuCI → Домашняя сеть → Обзор**

## Удаление

```sh
wget -qO- https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui/main/uninstall.sh | sh
```

## Источник списков

GeoSite/GeoIP text lists: MetaCubeX/meta-rules-dat.
