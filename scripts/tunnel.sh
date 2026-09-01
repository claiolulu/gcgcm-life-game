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

# ---------------------------------------------------------------
# 开跑前先把上一次留下的整套收干净。
#
# 不收的话会很难查：残留的 cloudflared 带着它自己的旧隧道继续跑，
# 残留的服务占着端口让新服务起不来，而校验又能通过（回应的是旧进程），
# 于是地址正常打印、访问却是 530。今天为这个折腾了好几轮。
#
# 按进程组排除自己 —— 直接 pkill -f tunnel.sh 会把正在跑的这个也干掉。
# ---------------------------------------------------------------
MYPGID="$(ps -o pgid= -p $$ | tr -d ' ')"
STALE=0
for pid in $(pgrep -f "scripts/tunnel\.sh" 2>/dev/null || true); do
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
  [ "$pgid" = "$MYPGID" ] && continue        # 自己这一组，跳过
  kill "$pid" 2>/dev/null && STALE=$((STALE + 1)) || true
done
for pat in "cloudflared tunnel --url" "node src/index.js"; do
  for pid in $(pgrep -f "$pat" 2>/dev/null || true); do
    pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
    [ "$pgid" = "$MYPGID" ] && continue
    kill "$pid" 2>/dev/null && STALE=$((STALE + 1)) || true
  done
done
if [ "$STALE" -gt 0 ]; then
  echo "→ 收掉上一次留下的 ${STALE} 个进程…"
  sleep 2
fi

# 端口还被占着说明不是本项目的东西，让位或换端口
if lsof -tiTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "✗ 端口 ${PORT} 被别的程序占着："
  lsof -iTCP:"${PORT}" -sTCP:LISTEN -n -P | tail -n +2
  echo "  换个端口跑：PORT=3100 ./scripts/tunnel.sh"
  exit 1
fi

echo "→ 启动服务（:${PORT}）…"
(cd server && MLG_DATA_DIR=./data PORT="$PORT" node src/index.js) &
SERVER_PID=$!

# Ctrl-C 时把服务和隧道一起收掉，不留孤儿进程占着端口
cleanup() {
  echo
  echo "→ 收尾…"
  kill "$SERVER_PID" 2>/dev/null || true
  kill "${TUNNEL_PID:-}" 2>/dev/null || true
  # 兜底：上面两个各自还有子进程，直接点名按模式再扫一遍自己这一组，
  # 免得留下孤儿 —— 孤儿会带着旧隧道继续跑，下次启动就撞车
  pkill -P $$ 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 等服务真的起来再开隧道，否则隧道会先报一串 502
for _ in $(seq 1 40); do
  # 先确认自己的进程还在 —— 只看端口有没有回应是不够的，
  # 别的进程占着端口时也会回应，那就白等一场
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "✗ 服务启动失败。最后几行日志："
    (cd server && tail -5 ../server/data/*.log 2>/dev/null) || true
    exit 1
  fi
  if curl -fsS "http://localhost:${PORT}/healthz" >/dev/null 2>&1; then break; fi
  sleep 0.5
done

echo "→ 开隧道…"
LOG="$(mktemp -t mlg-tunnel)"
# --edge-ip-version 4：强制走 IPv4。
#   IPv6 出站有问题的网络下，cloudflared 会连上 Cloudflare 的 v6 边缘，
#   然后卡在 "control stream encountered a failure" 的重连死循环里 ——
#   地址照样打印出来，隧道其实是坏的，最难查的就是这种。
#   在这台机器上实测：加了这个参数零报错，不加就一直重连。
#
# 如果场地的网络还拦 UDP/7844（QUIC），再加 --protocol http2 退回 TCP。
cloudflared tunnel --url "http://localhost:${PORT}" --no-autoupdate \
  --edge-ip-version 4 > "$LOG" 2>&1 &
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

# 光有地址不算数：连不上的坏隧道照样会把地址打印出来。
# 真去外网绕一圈打一下自己，通了才敢说成功。
#
# 先等 10 秒再查：cloudflared 打印地址的那一刻，这个新域名的 DNS
# 还没生效。查早了会失败，而失败结果会被负缓存（NXDOMAIN 通常缓存
# 60 秒），之后所有重试都命中那个缓存，隧道明明是通的也一直报错。
echo "→ 校验隧道（等 DNS 生效）…"
sleep 10
OK=""
for _ in $(seq 1 12); do
  # -4 强制 IPv4：IPv6 出站有问题的机器上，校验本身会失败
  if curl -4 -fsS --max-time 15 "$URL/healthz" >/dev/null 2>&1; then OK=1; break; fi
  sleep 6
done

if [ -z "$OK" ]; then
  cat <<MSG

✗ 隧道地址出来了，但从外网打不通：
    $URL

  多半是网络环境的问题。日志在 $LOG，最后几行：
MSG
  grep -E "ERR|error" "$LOG" | tail -5
  cat <<'MSG'

  常见原因和对策：
    · IPv6 有问题 —— 脚本已经强制 IPv4，还不行就往下看
    · 场地拦 UDP/7844（QUIC）—— 在 cloudflared 那行加 --protocol http2
    · 公司/学校网络整个拦 Cloudflare —— 换个网络（手机热点最快）
MSG
  exit 1
fi

# 地址每次重启都变，落一份到固定位置，忘了是哪个就 cat 这个文件
echo "$URL" > scripts/.tunnel-url

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
echo "  ⚠️  这个地址每次重开脚本都会变，旧地址立刻失效。"
echo "     旧地址的页面还能打开（Service Worker 在发缓存），但一操作就报"
echo "     「网络连接不上」—— 看着像网站坏了，其实只是地址过期了。"
echo "     地址也存在 scripts/.tunnel-url，忘了就 cat 一下。"
echo
echo "  选手护照上的二维码编的是编号（MLG:01）不是网址，"
echo "  所以换地址不影响任何人已经生成的护照。"
echo
echo "  Ctrl-C 停止。数据在 server/data/game.db，停了也还在。"
echo

wait "$SERVER_PID"
