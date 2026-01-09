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
rem Delegate packaging to the PowerShell script to avoid quoting/escaping issues
rem Prefer PowerShell Core (pwsh) when available for consistent ZIP behavior
where pwsh >nul 2>&1
if %errorlevel%==0 (
    set "PS_EXE=pwsh"
) else (
    rem try common install locations for pwsh
    if exist "%ProgramFiles%\PowerShell\7\pwsh.exe" (
        set "PS_EXE=%ProgramFiles%\PowerShell\7\pwsh.exe"
    ) else if exist "%ProgramFiles(x86)%\PowerShell\7\pwsh.exe" (
        set "PS_EXE=%ProgramFiles(x86)%\PowerShell\7\pwsh.exe"
    ) else (
        set "PS_EXE=powershell"
    )
)
:: Remove any prior outputs that could interfere (attempt safe, targeted cleanup)
if exist "%~dp0Livemarks_*.zip" (
    del /F /Q "%~dp0Livemarks_*.zip" 2>nul
)
if exist "%~dp0Livemarks_*.xpi" (
    del /F /Q "%~dp0Livemarks_*.xpi" 2>nul
)
:: Also remove the exact target and its .zip counterpart if present
if exist "%OUT%" del /F /Q "%OUT%" 2>nul
set "ZIPOUT=%OUT:.xpi=.zip%"
if exist "%ZIPOUT%" del /F /Q "%ZIPOUT%" 2>nul

"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_xpi.ps1" -SourceDir "%SRC%" -OutPath "%OUT%"

echo Done.
popd >nul
endlocal
pause
