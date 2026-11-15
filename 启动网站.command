#!/bin/zsh
cd "$(dirname "$0")" || exit 1
if ! command -v npm >/dev/null 2>&1; then
  echo "需要先安装兼容的 Node.js 与 npm。"
  exit 1
fi
if [ ! -d node_modules ]; then
  npm ci || exit 1
fi
echo "启动后请在 Chrome 打开 http://localhost:5173；按 Ctrl+C 停止。"
npm run dev
