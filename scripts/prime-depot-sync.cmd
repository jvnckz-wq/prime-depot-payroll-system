@echo off
cd /d "%~dp0.."
node scripts\sync-agent.js --live >> "%~dp0..\sync-agent.log" 2>&1
