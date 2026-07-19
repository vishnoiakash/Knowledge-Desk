$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$docker = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
if (-not (Test-Path $docker)) { $docker = "docker" }

& $docker compose -f (Join-Path $root "backend\docker-compose.yml") up -d --wait

$apiCommand = "Set-Location '$root\backend'; dotnet run --project src\InternalKnowledge.Api --urls http://127.0.0.1:5088"
$pnpm = (Get-Command pnpm -ErrorAction SilentlyContinue).Source
if (-not $pnpm) { $pnpm = "C:\Users\aksvi\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd" }
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = "C:\Users\aksvi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" }
if (-not (Test-Path $node)) { throw "Node.js was not found. Install Node.js and ensure node is available in PATH." }
if (-not (Test-Path $pnpm)) { throw "pnpm was not found. Install it with: npm install --global pnpm" }
$nodeDir = Split-Path -Parent $node
$webCommand = "`$env:PATH='$nodeDir;'+`$env:PATH; Set-Location '$root\frontend\InternalKnowledge.Web'; & '$pnpm' dev"
if (-not (Get-NetTCPConnection -LocalPort 5088 -State Listen -ErrorAction SilentlyContinue)) { Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", $apiCommand }
if (-not (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) { Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", $webCommand }

Write-Host "Knowledge Desk is starting at http://localhost:3000" -ForegroundColor Green
