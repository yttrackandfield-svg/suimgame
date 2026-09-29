@echo off
rem Play My Swim Club on PC (launched from the desktop shortcut)
rem 1) build dist if missing  2) start a small local server  3) open in an Edge app window
cd /d "%~dp0.."
if not exist dist\index.html call npm run build
set PING=powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://localhost:4173/ -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
%PING%
if not errorlevel 1 goto open
start "myswimclub-server" /min cmd /c "npx vite preview --port 4173 --strictPort"
for /l %%i in (1,1,30) do (
  timeout /t 1 /nobreak >nul
  %PING% && goto open
)
:open
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:4173/ --window-size=540,960
