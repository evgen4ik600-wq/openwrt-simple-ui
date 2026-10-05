#!/bin/sh
set -eu

DIR='/tmp/router-home'
OUT="$DIR/opencck.tsv"
TMP="$DIR/opencck.tsv.new"
mkdir -p "$DIR"
: > "$TMP"

parse() {
    src="$1"
    url="$2"
    html="$DIR/opencck-$src.html"
    wget -q -T 30 -O "$html" "$url"
    awk -v src="$src" '
        /<optgroup label="/ {
            g=$0
            sub(/^.*<optgroup label="/,"",g)
            sub(/".*$/,"",g)
        }
        /<option value="/ {
            s=$0
            sub(/^.*<option value="/,"",s)
            sub(/".*$/,"",s)
            if (g!="" && s!="") print src "\t" g "\t" s
        }
    ' "$html" >> "$TMP"
}

parse main 'https://iplist.opencck.org/index'
parse beta 'https://beta.iplist.opencck.org/index'
sort -u "$TMP" > "$OUT"
rm -f "$TMP"

echo "$OUT"
