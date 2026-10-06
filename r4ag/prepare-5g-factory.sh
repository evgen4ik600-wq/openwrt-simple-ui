#!/bin/sh
set -eu

OUT='/tmp/r4ag-eeprom'
mkdir -p "$OUT"

fail() { echo "ОШИБКА: $*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || fail "Запустите от root."
command -v ubus >/dev/null 2>&1 || fail "Не найден ubus."
command -v jsonfilter >/dev/null 2>&1 || fail "Не найден jsonfilter."
command -v hexdump >/dev/null 2>&1 || fail "Не найден hexdump."

MODEL="$(ubus call system board 2>/dev/null | jsonfilter -e '@.model' 2>/dev/null || true)"
[ "$MODEL" = "Xiaomi Mi Router 4A Gigabit Edition" ] || fail "Этот скрипт только для Xiaomi Mi Router 4A Gigabit Edition v1. Сейчас: $MODEL"

find_mtd() {
    awk -v n="$1" '$4=="\"" n "\""{gsub(":","",$1); print "/dev/" $1; exit}' /proc/mtd
}

BDATA="$(find_mtd Bdata)"
FACTORY="$(find_mtd factory)"
[ -n "$BDATA" ] || fail "Раздел Bdata не найден."
[ -n "$FACTORY" ] || fail "Раздел factory не найден."

bsize="$(cat /sys/class/mtd/$(basename "$BDATA")/size 2>/dev/null || echo 0)"
fsize="$(cat /sys/class/mtd/$(basename "$FACTORY")/size 2>/dev/null || echo 0)"
[ "$bsize" = "65536" ] || fail "Bdata имеет неожиданный размер: $bsize"
[ "$fsize" = "65536" ] || fail "factory имеет неожиданный размер: $fsize"

dd if="$BDATA" of="$OUT/bdata-original.bin" bs=65536 count=1 2>/dev/null
dd if="$FACTORY" of="$OUT/factory-original.bin" bs=65536 count=1 2>/dev/null

bid="$(dd if="$OUT/bdata-original.bin" bs=1 skip=32768 count=2 2>/dev/null | hexdump -v -e '2/1 "%02x "')" 
fid="$(dd if="$OUT/factory-original.bin" bs=1 skip=32768 count=2 2>/dev/null | hexdump -v -e '2/1 "%02x "')" 

echo "Модель: $MODEL"
echo "Bdata  +0x8000: $bid"
echo "factory+0x8000: $fid"

case "$bid" in
    "12 76 "|"62 76 ") ;;
    *) fail "В Bdata нет валидного EEPROM ID MT76x2 (ожидалось 12 76 или 62 76). Ничего не патчим." ;;
esac

case "$fid" in
    "12 76 "|"62 76 ")
        echo
        echo "factory уже содержит валидный EEPROM 5 ГГц. Патч не нужен."
        echo "Бэкапы сохранены в $OUT"
        sha256sum "$OUT/bdata-original.bin" "$OUT/factory-original.bin"
        exit 0
        ;;
esac

cp "$OUT/factory-original.bin" "$OUT/factory-5g-fixed.bin"
dd if="$OUT/bdata-original.bin" of="$OUT/factory-5g-fixed.bin" bs=1 skip=32768 seek=32768 count=512 conv=notrunc 2>/dev/null

fixed="$(dd if="$OUT/factory-5g-fixed.bin" bs=1 skip=32768 count=2 2>/dev/null | hexdump -v -e '2/1 "%02x "')" 
case "$fixed" in
    "12 76 "|"62 76 ") ;;
    *) fail "Проверка готового файла не прошла: $fixed" ;;
esac

[ "$(wc -c < "$OUT/factory-5g-fixed.bin" | tr -d ' ')" = "65536" ] || fail "Неверный размер factory-5g-fixed.bin."

echo
echo "ГОТОВО. Во flash НИЧЕГО не записывалось."
echo "Созданы:"
echo "  $OUT/bdata-original.bin"
echo "  $OUT/factory-original.bin"
echo "  $OUT/factory-5g-fixed.bin"
echo
sha256sum "$OUT/bdata-original.bin" "$OUT/factory-original.bin" "$OUT/factory-5g-fixed.bin"
echo
echo "Скопируйте ВСЕ ТРИ файла на ПК перед входом в Breed."
