@echo off
REM ==========================================================================
REM Prime Depot live sync agent launcher (Windows).
REM
REM Run this through Task Scheduler so the agent starts on boot and restarts if
REM it ever stops. See docs/DEPLOY-SYNC-AGENT.md for the exact Task Scheduler
REM settings. It changes to the repo root (this file lives in scripts\), starts
REM the agent in LIVE mode, and appends all output to sync-agent.log.
REM ==========================================================================
cd /d "%~dp0.."
node scripts\sync-agent.js --live >> "%~dp0..\sync-agent.log" 2>&1
