param(
  [Parameter(Mandatory = $true)]
  [string]$Timestamp,
  [Parameter(Mandatory = $true)]
  [string]$SshHost,
  [string]$RemoteRoot = "/root/Freguesia",
  [switch]$SkipBuild,
  [switch]$SkipRestart
)

$ErrorActionPreference = "Stop"

$backupRoot = "$RemoteRoot/.deploy-backups/$Timestamp"
$restoreScript = @"
set -e
backup_root='$backupRoot'
remote_root='$RemoteRoot'
if [ ! -d "\$backup_root" ]; then
  echo "Backup nao encontrado: \$backup_root" >&2
  exit 1
fi
cd "\$backup_root"
find . -type f | while read -r file; do
  src="\$backup_root/\${file#./}"
  dst="\$remote_root/\${file#./}"
  mkdir -p "\$(dirname "\$dst")"
  cp "\$src" "\$dst"
  printf 'Restaurado: %s\n' "\${file#./}"
done
"@

ssh $SshHost $restoreScript

if (-not $SkipBuild) {
  Write-Host "Executando build remoto"
  ssh $SshHost "cd '$RemoteRoot' && npm run build"
}

if (-not $SkipRestart) {
  Write-Host "Reiniciando servicos"
  ssh $SshHost "systemctl restart freguesia-whatsapp.service freguesia-worker.service freguesia-local-api.service && systemctl is-active freguesia-whatsapp.service && systemctl is-active freguesia-worker.service && systemctl is-active freguesia-local-api.service"
}

Write-Host "Rollback concluido para backup $Timestamp"
