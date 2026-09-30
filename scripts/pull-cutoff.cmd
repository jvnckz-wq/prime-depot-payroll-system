@echo off
cd /d "%~dp0.."
node scripts\pull-cutoff.js
echo.
pause
