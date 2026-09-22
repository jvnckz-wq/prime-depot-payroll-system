@echo off
REM ==========================================================================
REM Prime Depot: pull a cutoff from the device and finalize it for payroll.
REM Double-click this on the warehouse laptop at cutoff. It runs in a window,
REM lets you pick the cutoff, asks for confirmation, then finalizes. Nothing is
REM written until you type y. The window stays open so you can read the result.
REM ==========================================================================
cd /d "%~dp0.."
node scripts\pull-cutoff.js
echo.
pause
