@echo off
title KALI LINUX LAB  -  consola de proceso
color 0A
mode con: cols=130 lines=42
echo.
echo   Abriendo consola del laboratorio (ventana aparte)...
echo   Aqui se muestra el proceso en vivo.
echo.
wsl.exe -d kali-linux -- bash /mnt/c/Users/Riesgos/kali-lab/consola-proceso.sh
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Kali no pudo arrancar.
  pause
)
