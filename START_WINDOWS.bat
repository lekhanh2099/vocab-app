@echo off
cd /d %~dp0
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js chua duoc cai. Cai Node 20+ roi chay lai.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Lan dau: dang cai dependencies...
  call npm install
)
echo Mo Vocab Universe...
call npm run dev -- --host 0.0.0.0
pause
