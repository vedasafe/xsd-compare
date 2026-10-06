@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
    py -3 app.py
    goto finished
)
where python >nul 2>nul
if not errorlevel 1 (
    python app.py
    goto finished
)
set "XSD_PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if exist "%XSD_PYTHON%" (
    "%XSD_PYTHON%" app.py
    goto finished
)
echo Python was not found. Install Python 3.10 or newer with Tcl/Tk support.
pause
exit /b 1
:finished
if errorlevel 1 pause
