#!/bin/bash
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js chưa được cài. Cài Node 20+ rồi chạy lại."
  read -p "Nhấn Enter để đóng..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Lần đầu: đang cài dependencies..."
  npm install
fi

echo "Mở Vocab Universe..."
npm run dev -- --host 0.0.0.0
