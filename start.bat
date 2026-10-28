@echo off
title Sistema de Ordens de Servico
cd /d "%~dp0"

if not exist node_modules (
    echo Primeira execucao: instalando dependencias...
    call npm install
    if errorlevel 1 (
        echo Falha no npm install. Verifique a internet e o Node.js.
        pause
        exit /b 1
    )
)

echo ====================================================
echo        A INICIAR O SISTEMA DE GESTAO DE OS
echo ====================================================
echo.
echo Abrindo http://localhost:3000
echo [Dica] Nao feche esta janela enquanto estiver a usar o sistema!
echo.

timeout /t 2 /nobreak >nul
start http://localhost:3000
node server.js
pause
