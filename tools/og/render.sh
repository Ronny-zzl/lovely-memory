#!/bin/sh
# og.html を 1200×630 の PNG に書き出す（ローカルの Google Chrome を使用。フォントは Google Fonts から読み込む）
set -eu
here=$(cd "$(dirname "$0")" && pwd)
out="$here/../../apps/web/public/og.png"
chrome=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
"$chrome" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1200,630 --virtual-time-budget=8000 \
  --screenshot="$out" "file://$here/og.html" 2>/dev/null
echo "wrote $out"
