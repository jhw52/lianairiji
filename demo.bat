@echo off
chcp 65001 >nul
cd /d "%~dp0"
set DATA_DIR=data-demo
set PORT=3002
title 演示实例（data-demo）
echo.
echo   演示实例： http://localhost:3002
echo   使用 data-demo/ 数据，不会碰你的 data/
echo.
node server/index.mjs --prod
pause
