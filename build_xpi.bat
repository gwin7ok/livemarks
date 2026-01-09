@echo off
rem Build an .xpi from files in the livemarks/ folder.
setlocal
set SRC=%~dp0livemarks
rem Remove trailing backslash from SRC if present
if "%SRC:~-1%"=="\" set SRC=%SRC:~0,-1%

rem If first argument starts with # (user added inline comment), ignore it
set ARG=%~1
if defined ARG (
	if "%ARG:~0,1%"=="#" (
		set ARG=
	)
)

rem Default output to repository root Livemarks.xpi
set OUT=%~dp0Livemarks.xpi
if not "%ARG%"=="" set OUT=%~1
echo Creating XPI from %SRC% -^> %OUT%
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_xpi.ps1" "%SRC%" "%OUT%"
echo Done.
endlocal
pause
