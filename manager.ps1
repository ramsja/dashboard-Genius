# Kali lab manager (host). Usage:
#   powershell -File C:\Users\Riesgos\kali-lab\manager.ps1 status
#   powershell -File C:\Users\Riesgos\kali-lab\manager.ps1 start
#   powershell -File C:\Users\Riesgos\kali-lab\manager.ps1 update
#   powershell -File C:\Users\Riesgos\kali-lab\manager.ps1 tools
#   powershell -File C:\Users\Riesgos\kali-lab\manager.ps1 shell
param(
  [Parameter(Position=0)]
  [ValidateSet('status','start','update','tools','shell','help','procesos','ip','brute','datos','demo','conectar','ciclo','dirigir','forense','auditoria')]
  [string]$Cmd = 'status',
  [Parameter(Position=1)]
  [string]$Target = ''
)

$ErrorActionPreference = 'Continue'
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')

function Assert-Kali {
  $list = wsl -l -q 2>$null
  if (-not ($list -match 'kali')) {
    Write-Host 'Kali WSL no esta instalado o WSL no arranca. Reinicia Windows y relanza install-elevated.ps1'
    return $false
  }
  return $true
}

switch ($Cmd) {
  'help' {
    Write-Host 'status | start | update | tools | shell'
    Write-Host 'procesos | ip <IP|host|archivo> | brute [log] | datos [archivo] | demo'
    Write-Host 'conectar | ciclo | dirigir "P1 1.1.1.1" | forense | auditoria'
  }
  'procesos' {
    if (Assert-Kali) { wsl -d kali-linux -- bash /mnt/c/Users/Riesgos/kali-lab/herramientas/inventario.sh }
  }
  'ip' {
    if (-not $Target) { $Target = '1.1.1.1' }
    if (Assert-Kali) { wsl -d kali-linux -- bash /mnt/c/Users/Riesgos/kali-lab/herramientas/localizar-ip.sh $Target }
  }
  'brute' {
    if (-not $Target) { $Target = '/mnt/c/Users/Riesgos/kali-lab/evidencias' }
    if (Assert-Kali) { wsl -d kali-linux -- bash /mnt/c/Users/Riesgos/kali-lab/herramientas/detectar-fuerza-bruta.sh $Target }
  }
  'datos' {
    if (-not $Target) { $Target = '/mnt/c/Users/Riesgos/kali-lab/evidencias' }
    if (Assert-Kali) { wsl -d kali-linux -- bash /mnt/c/Users/Riesgos/kali-lab/herramientas/extraer-datos.sh $Target }
  }
  'demo' {
    if (Assert-Kali) { wsl -d kali-linux -- bash /mnt/c/Users/Riesgos/kali-lab/herramientas/demo-fuerza-bruta-local.sh }
  }
  'conectar' {
    if (Assert-Kali) { wsl -d kali-linux -- bash /mnt/c/Users/Riesgos/kali-lab/herramientas/grok-conectar.sh }
  }
  'ciclo' {
    if (Assert-Kali) { wsl -d kali-linux -- bash /mnt/c/Users/Riesgos/kali-lab/herramientas/grok-ciclo.sh }
  }
  'forense' {
    if (-not $Target) { $Target = '/mnt/c/Users/Riesgos/kali-lab/evidencias' }
    if (Assert-Kali) { wsl -d kali-linux -- bash /mnt/c/Users/Riesgos/kali-lab/herramientas/informe-forense.sh $Target }
  }
  'auditoria' {
    if (Assert-Kali) { wsl -d kali-linux -- bash /mnt/c/Users/Riesgos/kali-lab/herramientas/auditoria-lab.sh }
  }
  'dirigir' {
    if (-not $Target) { Write-Host 'Uso: manager.ps1 dirigir "P1 1.1.1.1"'; break }
    $orden = 'C:\Users\Riesgos\kali-lab\conexion\orden.txt'
    Set-Content -Path $orden -Value $Target -Encoding ASCII
    Write-Host "Orden en cola: $Target"
  }
  'status' {
    Write-Host '=== WSL ==='
    wsl -l -v
    Write-Host '`n=== Docker ==='
    docker version --format 'Client {{.Client.Version}}' 2>$null
    Get-Service com.docker.service -ErrorAction SilentlyContinue | Format-Table Name, Status -AutoSize
    Write-Host '`n=== VirtualBox ==='
    $vbox = 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe'
    if (Test-Path $vbox) { & $vbox --version } else { Write-Host 'VirtualBox no instalado' }
    if (Assert-Kali) {
      Write-Host '`n=== Kali ==='
      wsl -d kali-linux -- bash -lc 'cat /etc/os-release | head -5; uname -a; echo RAM; free -h | head -2'
    }
  }
  'start' {
    if (Assert-Kali) { wsl -d kali-linux -- bash -lc 'echo Kali ready; hostname; whoami' }
  }
  'update' {
    if (Assert-Kali) { wsl -d kali-linux -- bash -lc 'sudo apt-get update && sudo apt-get -y dist-upgrade' }
  }
  'tools' {
    if (Assert-Kali) {
      wsl -d kali-linux -- bash -lc @'
set -e
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  kali-linux-headless \
  kali-tools-forensics \
  sleuthkit testdisk foremost binwalk \
  nmap ncat ndiff \
  nikto whatweb gobuster ffuf \
  sqlmap \
  hashcat john hydra \
  traceroute whois \
  volatility3 \
  wireshark-common tshark tcpdump \
  git curl wget jq python3-pip
echo TOOLS_OK
'@
    }
  }
  'shell' {
    if (Assert-Kali) { wsl -d kali-linux -- bash -l }
  }
}
