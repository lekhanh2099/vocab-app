@echo off
cd /d %~dp0
node -v
call npm run check
if errorlevel 1 (
  echo.
  echo Release check FAILED.
  pause
  exit /b 1
)
echo.
echo Release checks completed.
pause
