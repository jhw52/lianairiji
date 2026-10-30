@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 猪猪与小咪的世界
echo.
echo   正在启动《猪猪与小咪的世界》...
echo   本机访问： http://localhost:3001
echo   关闭这个窗口就会停止服务。
echo.
start "" http://localhost:3001
node server/index.mjs --prod
echo.
echo 服务已停止。
pause
