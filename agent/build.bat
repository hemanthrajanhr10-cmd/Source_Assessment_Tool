@echo off
echo ========================================
echo  SAT Gateway Agent - Build EXE
echo ========================================
echo.

echo Installing dependencies...
pip install -r requirements.txt

echo.
echo Building EXE with PyInstaller...
pyinstaller ^
    --onefile ^
    --name SATAgent ^
    --console ^
    --clean ^
    agent.py

echo.
if exist dist\SATAgent.exe (
    echo SUCCESS: dist\SATAgent.exe created.
    echo.
    echo Usage:
    echo   set SAT_SERVER_URL=https://your-sat-app.azurewebsites.net
    echo   set GATEWAY_KEY=your-gateway-key-here
    echo   dist\SATAgent.exe
) else (
    echo FAILED: EXE not found. Check PyInstaller output above.
)
pause
