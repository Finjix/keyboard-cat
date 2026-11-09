@echo off
setlocal
cd /d "%~dp0"
title Mengshu - Development
set "ELECTRON_RUN_AS_NODE="

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 24 and try again.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js with npm and try again.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\electron-vite.cmd" (
  echo Installing dependencies...
  call npm ci
  if errorlevel 1 goto failed
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo Preparing Electron...
  node node_modules\electron\install.js
  if errorlevel 1 goto failed
)

echo Starting development mode. Save code to reload automatically.
echo Keep this window open. Press Ctrl+C to stop.
call npm run dev
if errorlevel 1 goto failed
exit /b 0

:failed
echo Development startup failed. See the error above.
pause
exit /b 1
