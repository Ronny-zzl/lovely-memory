#!/bin/sh
# icon.html を各サイズの PNG に書き出す（ローカルの Google Chrome を使用）
set -eu
here=$(cd "$(dirname "$0")" && pwd)
out="$here/../../apps/web/public/icons"
mkdir -p "$out"
chrome=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
# Chrome はウィンドウを一定より小さくできない（小さいサイズを直接描くと左上だけが切り取られる）ので、
# 512×512 で描いてから macOS の sips で縮小する
"$chrome" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=512,512 --screenshot="$out/icon-512.png" "file://$here/icon.html" 2>/dev/null
for size in 192 180; do
  sips -z "$size" "$size" "$out/icon-512.png" --out "$out/icon-$size.png" >/dev/null
done
echo "wrote $out"
