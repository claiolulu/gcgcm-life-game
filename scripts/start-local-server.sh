#!/usr/bin/env bash
# 本机现场服务唯一入口：固定项目数据目录，拒绝空库。
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$PROJECT_ROOT/server"
export MLG_DATA_DIR="$PROJECT_ROOT/server/data"
export MLG_REQUIRE_EXISTING_DB=1
export NODE_ENV=production
exec node src/index.js
