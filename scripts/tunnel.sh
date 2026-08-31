#!/usr/bin/env bash
#
# 备用方案：本机跑服务，Cloudflare Tunnel 开一个公网 HTTPS 地址。
#
# 什么时候用：
#   · 云端还没落实（试用到期、没绑卡）但想先让人真机测一遍
#   · 活动当天云端出意外，需要十秒内切到备份
#
# 为什么必须是 HTTPS：浏览器只在安全上下文下才允许调摄像头和注册
# Service Worker。局域网 http:// 地址会让同工扫不了码、所有人失去离线缓存。
# 隧道自带证书，正好解决。
#
# 数据在本机 server/data/game.db，隧道断了数据也还在。
#
# 用法：  ./scripts/tunnel.sh
# 停止：  Ctrl-C（服务和隧道一起收）
# 注意：中文注释和提示里凡是紧挨着变量的地方一律写 ${VAR} 带花括号。
# 写成 $PORT）—— 后面跟全角括号 —— bash 会把那几个字节算进变量名，
# set -u 下直接报 "unbound variable"，而且报错信息里是一堆乱码，很难看出来。
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v cloudflared >/dev/null 2>&1; then
  cat <<'MSG'
✗ 没装 cloudflared。

  macOS:  brew install cloudflared
  其他:   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

装完再跑一次这个脚本。不需要 Cloudflare 账号。
MSG
  exit 1
fi

PORT="${PORT:-3000}"

echo "→ 构建前端…"
(cd web && npm run build >/dev/null)

echo "→ 启动服务（:${PORT}）…"
(cd server && MLG_DATA_DIR=./data PORT="$PORT" node src/index.js) &
SERVER_PID=$!

# Ctrl-C 时把服务和隧道一起收掉，不留孤儿进程占着端口
cleanup() {
  echo
  echo "→ 收尾…"
  kill "$SERVER_PID" 2>/dev/null || true
  kill "${TUNNEL_PID:-}" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 等服务真的起来再开隧道，否则隧道会先报一串 502
for _ in $(seq 1 40); do
  if curl -fsS "http://localhost:$PORT/healthz" >/dev/null 2>&1; then break; fi
  sleep 0.5
done

echo "→ 开隧道…"
LOG="$(mktemp -t mlg-tunnel)"
cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate > "$LOG" 2>&1 &
TUNNEL_PID=$!

# 地址是 cloudflared 自己打到日志里的，等它出现
URL=""
for _ in $(seq 1 60); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 0.5
done

if [ -z "$URL" ]; then
  echo "✗ 没等到隧道地址，日志在 $LOG"
  tail -20 "$LOG"
  exit 1
fi

echo
echo "════════════════════════════════════════════"
echo "  $URL"
echo "════════════════════════════════════════════"
echo
node -e "
const q = require('./web/node_modules/qrcode');
q.toString(process.argv[1], { type: 'terminal', small: true }).then(s => console.log(s));
" "$URL"
echo "  ↑ 扫这个进报名页。工作人员端在 $URL/staff"
echo
echo "  地址每次重开都会变，但选手护照上的二维码编的是编号（MLG:01），"
echo "  不是网址 —— 换地址不影响任何人已经生成的护照。"
echo
echo "  Ctrl-C 停止。数据在 server/data/game.db，停了也还在。"
echo

wait "$SERVER_PID"
