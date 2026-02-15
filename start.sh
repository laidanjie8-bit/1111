#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-4173}"
HOST="${HOST:-0.0.0.0}"

if [[ "$PORT" =~ ^[0-9]+$ ]] && (( PORT >= 1 && PORT <= 65535 )); then
  :
else
  echo "[ERROR] 无效端口: $PORT（应为 1-65535 的整数）" >&2
  exit 1
fi

PYTHON_BIN=""
if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "[ERROR] 未找到 Python，请先安装 python3。" >&2
  exit 1
fi

echo "[INFO] 启动钢筋间距检测前端..."
echo "[INFO] 目录: $(pwd)"
echo "[INFO] 地址: http://localhost:${PORT}"
echo "[INFO] 按 Ctrl+C 停止服务"

exec "$PYTHON_BIN" -m http.server "$PORT" --bind "$HOST"
