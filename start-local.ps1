$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$docker = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
if (-not (Test-Path $docker)) { $docker = "docker" }

& $docker compose -f (Join-Path $root "backend\docker-compose.yml") up -d --wait

$apiCommand = "Set-Location '$root\backend'; dotnet run --project src\InternalKnowledge.Api --urls http://127.0.0.1:5088"
$pnpm = (Get-Command pnpm -ErrorAction SilentlyContinue).Source
if (-not $pnpm) { $pnpm = "C:\Users\aksvi\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd" }
$webCommand = "Set-Location '$root\frontend\InternalKnowledge.Web'; & '$pnpm' dev"
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", $apiCommand
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", $webCommand

Write-Host "Knowledge Desk is starting at http://localhost:3000" -ForegroundColor Green
