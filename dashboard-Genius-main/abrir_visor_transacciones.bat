@echo off
cd /d "%~dp0"
start "" /b "C:\Users\Riesgos\AppData\Local\Programs\Python\Python314\python.exe" "%~dp0visor_actual.py"
start "" msedge "http://127.0.0.1:8765/"