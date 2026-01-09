@echo off
rem Build an .xpi from files in the livemarks/ folder.
setlocal
rem Ensure working directory is the script folder so double-click works
pushd "%~dp0" >nul

set "SRC=%~dp0livemarks"
rem Remove trailing backslash from SRC if present
if "%SRC:~-1%"=="\" set "SRC=%SRC:~0,-1%"

rem If first argument starts with # (user added inline comment), ignore it
set ARG=%~1
if defined ARG (
    if "%ARG:~0,1%"=="#" (
        set ARG=
    )
)

rem Default output to repository root Livemarks.xpi
set "OUT=%~dp0Livemarks.xpi"
if not "%ARG%"=="" set "OUT=%~1"

echo Creating XPI from "%SRC%" -> "%OUT%"

rem Use PowerShell to copy the *contents* of livemarks into a temporary folder
 REM Delegate packaging to the PowerShell script to avoid quoting/escaping issues
 powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_xpi.ps1" -SourceDir "%SRC%" -OutPath "%OUT%"

echo Done.
popd >nul
endlocal
pause
