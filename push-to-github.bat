@echo off
setlocal enabledelayedexpansion

set MSG=%*

if "%MSG%"=="" (
  set MSG=update
)

echo [1/4] git add -A
git add -A

echo [2/4] git commit -m "%MSG%"
git commit -m "%MSG%"

echo [3/4] git push origin main
git push origin main

echo DONE
pause
