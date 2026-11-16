@echo off
cd /d "%~dp0frontend"
if not exist node_modules (
  echo Installing frontend dependencies. This may take a few minutes...
  npm install
)
echo Starting CommunitySignal AI frontend...
npm run dev
pause
