@echo off
title MicuBot Telegram 24/7
chcp 65001 >nul
cd /d "C:\Users\Administrator\Downloads\MicuBot"

echo ===================================================
echo       DANG KHOI DONG MICUBOT TELEGRAM
echo ===================================================

:: Tat tien trinh node cu neu dang chay ngam de tranh trung port 3000
taskkill /F /IM node.exe >nul 2>&1

echo.
echo [*] Dang khoi chay server.js...
echo [*] Bot se hien log ben duoi:
echo ===================================================
node server.js

echo.
echo Bot da dung lai!
pause
