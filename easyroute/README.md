# EasyRoute for OpenWrt

Минималистичная маршрутизация выбранных доменов, IP и CIDR через **AmneziaWG 3.1**.

Цель проекта: после чистой установки OpenWrt выполнить **одну команду**, затем только добавить своё AWG-подключение и списки маршрутов.

## Для какой системы

Стабильная версия сейчас рассчитана на:

- OpenWrt **25.12.x**
- LuCI
- firewall4 / nftables
- пакетный менеджер apk
- AmneziaWG 3.1

Проект сделан с учётом роутеров с небольшим объёмом flash. Нет Python, Node.js, базы данных, отдельного web-сервера и тяжёлого frontend.

## Установка на чистую OpenWrt

Подключитесь к роутеру по SSH и выполните одну команду:

```sh
wget -qO- https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui/main/openwrt-easyroute-install.sh | sh
```

Установщик автоматически:

1. проверит OpenWrt и свободную flash;
2. установит поддержку **AmneziaWG 3.1**;
3. установит LuCI-протокол AmneziaWG;
4. установит русскую локализацию AmneziaWG, если она доступна в закреплённой сборке;
5. установит `dnsmasq-full` с поддержкой `nftset`;
6. установит EasyRoute;
7. создаст резервные копии важных конфигов;
8. проверит shell/ACL/LuCI-файлы;
9. проверит конфигурацию firewall и dnsmasq до применения;
10. включит EasyRoute при загрузке.

**AWG-подключение установщик специально не создаёт.** Ключи и параметры вашего VPN он не знает и не изменяет.

## Что сделать после установки

### 1. Добавить своё AmneziaWG 3.1 подключение

Откройте:

**Сеть → Интерфейсы → Добавить новый интерфейс**

Выберите:

**AmneziaWG VPN**

Импортируйте ваш конфиг AmneziaWG 3.1 и сохраните интерфейс.

Можно назвать его `AWG`. Если имя будет другим, EasyRoute пытается автоматически определить первый интерфейс с протоколом `amneziawg`.

Перед маршрутизацией убедитесь, что у AWG появился handshake.

### 2. Добавить маршруты

Откройте:

**Сеть → Маршруты VPN**

Нажмите:

**+ Добавить**

Можно вставить список вручную или загрузить TXT.

Пример:

```text
youtube.com
googlevideo.com
ytimg.com
104.18.0.0/16
```

Нажмите:

**Сохранить и применить**

Только адреса из списка пойдут через AWG. Остальной интернет останется через обычный WAN.

## Формат TXT

По одной записи в строке.

Поддерживаются:

```text
example.com
domain:example.com
full:api.example.com
1.2.3.4
1.2.3.0/24
2001:db8::1
2001:db8::/32
```

Поддерживаются и простые Keenetic/RockBlack-строки:

```text
route add 104.16.0.0 mask 255.240.0.0 0.0.0.0
```

Комментарии:

```text
# YouTube
youtube.com
googlevideo.com
```

На текущем этапе `keyword:`, `regexp:` и `include:` не применяются автоматически: они считаются неподдерживаемыми строками, чтобы не создавать неправильные маршруты.

## Как работает

Домены:

```text
домен → dnsmasq nftset → nftables set → mark 0x66 → table 166 → AWG
```

IP/CIDR:

```text
IP/CIDR → nftables set → mark 0x66 → table 166 → AWG
```

Если AWG ещё не настроен, EasyRoute устанавливается нормально и ждёт появления AmneziaWG-интерфейса.

## Flash

EasyRoute хранит только ваши списки и небольшой набор shell/LuCI-файлов.

Для одного TXT действует лимит **256 КБ**. При сохранении EasyRoute оставляет не менее **1 МБ** свободного места во flash.

## Повторный запуск / обновление

Эту же команду можно выполнить повторно:

```sh
wget -qO- https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui/main/openwrt-easyroute-install.sh | sh
```

Созданные списки EasyRoute сохраняются.

## Удаление

```sh
wget -qO- https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui/main/easyroute/uninstall.sh | sh
```

Удаление EasyRoute не удаляет пакеты AmneziaWG и не удаляет ваши VPN-ключи.
