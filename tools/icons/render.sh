#!/bin/sh
# icon.html を各サイズの PNG に書き出す（ローカルの Google Chrome を使用）
set -eu
here=$(cd "$(dirname "$0")" && pwd)
out="$here/../../apps/web/public/icons"
mkdir -p "$out"
chrome=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
for size in 512 192 180; do
  "$chrome" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=$size,$size --screenshot="$out/icon-$size.png" "file://$here/icon.html" 2>/dev/null
done
echo "wrote $out"
