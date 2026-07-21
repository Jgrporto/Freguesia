param(
  [Parameter(Mandatory = $true)]
  [string[]]$Files,
  [Parameter(Mandatory = $true)]
  [string]$SshHost,
  [string]$RemoteRoot = "/root/Freguesia",
  [string]$WebRoot = "/var/www/freguesia/current",
  [switch]$SkipBuild,
  [switch]$SkipRestart
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = "$RemoteRoot/.deploy-backups/$timestamp"

function Resolve-RelativePath {
  param([string]$InputPath)

  $absolutePath = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $InputPath))
  if (-not $absolutePath.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Arquivo fora do repositorio: $InputPath"
  }
  if (-not (Test-Path -LiteralPath $absolutePath -PathType Leaf)) {
    throw "Arquivo nao encontrado: $InputPath"
  }
  return [System.IO.Path]::GetRelativePath($repoRoot, $absolutePath).Replace("\", "/")
}

$relativeFiles = $Files | ForEach-Object { Resolve-RelativePath $_ } | Select-Object -Unique
$frontendPaths = @("src/", "public/", "index.html", "vite.config.js", "tailwind.config.js", "postcss.config.js")
$localApiChanged = $relativeFiles | Where-Object { $_ -eq "server/local-api.mjs" }
$stackChanged = $relativeFiles | Where-Object {
  $_ -in @("server/whatsapp-server.js", "server/checkout-server.js", "server/painel-agent-broker.js", "server/start-all.js", "server/freguesia-worker.js", "package.json", "package-lock.json")
}
$needsBuild = -not $SkipBuild -and ($relativeFiles | Where-Object {
  $path = $_
  $frontendPaths | Where-Object { $path.StartsWith($_) -or $path -eq $_ }
})

Write-Host "Backup remoto: $backupRoot"

foreach ($relativePath in $relativeFiles) {
  $remotePath = "$RemoteRoot/$relativePath"
  $remoteDir = Split-Path $remotePath -Parent
  $backupPath = "$backupRoot/$relativePath"
  $backupDir = Split-Path $backupPath -Parent

  ssh $SshHost "mkdir -p '$remoteDir' '$backupDir'; if [ -f '$remotePath' ]; then cp '$remotePath' '$backupPath'; fi"
  scp "$repoRoot\$($relativePath.Replace('/', '\'))" "${SshHost}:$remotePath" | Out-Null
  Write-Host "Enviado: $relativePath"
}

if ($needsBuild) {
  Write-Host "Executando build remoto"
  ssh $SshHost "cd '$RemoteRoot' && npm run build"
  Write-Host "Publicando dist em $WebRoot"
  ssh $SshHost "rsync -a --delete '$RemoteRoot/dist/' '$WebRoot/'"
}

if (-not $SkipRestart) {
  if ($stackChanged) {
    Write-Host "Reiniciando freguesia-whatsapp.service"
    ssh $SshHost "systemctl restart freguesia-whatsapp.service && systemctl is-active freguesia-whatsapp.service"
    Write-Host "Reiniciando freguesia-worker.service"
    ssh $SshHost "systemctl restart freguesia-worker.service && systemctl is-active freguesia-worker.service"
  }
  if ($localApiChanged) {
    Write-Host "Reiniciando freguesia-local-api.service"
    ssh $SshHost "systemctl restart freguesia-local-api.service && systemctl is-active freguesia-local-api.service"
  }
}

Write-Host ""
Write-Host "Deploy concluido."
Write-Host "Backup para rollback: $timestamp"
