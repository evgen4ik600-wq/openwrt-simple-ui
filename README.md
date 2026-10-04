# OpenWrt Simple UI

Упрощённый интерфейс поверх LuCI для OpenWrt.

Первая версия добавляет отдельный раздел **«Простой режим»** с основными экранами:

- Главная
- Интернет
- Wi‑Fi
- Устройства
- VPN
- Система
- Расширенные настройки

## Для какой системы сделано

Текущая версия тестово ориентирована на:

- OpenWrt 25.12.x
- LuCI
- AmneziaWG / WireGuard
- `apk` package manager

Проект не заменяет LuCI и не меняет прошивку. Это дополнительный пользовательский интерфейс поверх существующего OpenWrt.

## Установка

```sh
wget -qO- https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui/main/install.sh | sh
```

После установки обновите страницу LuCI и откройте:

**Простой режим → Главная**

## Обновление

После изменения `install.sh` в репозитории повторно выполните ту же команду:

```sh
wget -qO- https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui/main/install.sh | sh
```

## Удаление

```sh
wget -qO- https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui/main/uninstall.sh | sh
```

## Важно

Текущая версия — ранняя тестовая.

`install.sh`:

- не меняет конфигурацию WAN;
- не меняет настройки Wi‑Fi;
- не меняет конфигурацию AmneziaWG;
- отключает только старые правила экспериментального SmartRoute, если они присутствуют;
- оставляет стандартную LuCI доступной.

Перед крупными изменениями рекомендуется сделать резервную копию OpenWrt.
