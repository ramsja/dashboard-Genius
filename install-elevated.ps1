$ErrorActionPreference = 'Continue'
$log = 'C:\Users\Riesgos\kali-lab\install.log'
function Log([string]$m) {
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m
  Add-Content $log $line -Encoding UTF8
  Write-Host $line
}
Log '===== Kali lab elevated install ====='
$ident = [Security.Principal.WindowsIdentity]::GetCurrent()
$prin = New-Object Security.Principal.WindowsPrincipal($ident)
Log ('IsAdmin=' + $prin.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))

Log 'Enable WSL / VMP / HypervisorPlatform'
foreach ($feat in @(
  'Microsoft-Windows-Subsystem-Linux',
  'VirtualMachinePlatform',
  'HypervisorPlatform'
)) {
  $p = Start-Process dism.exe -ArgumentList @('/online','/enable-feature',"/featurename:$feat",'/all','/norestart') -Wait -PassThru -NoNewWindow
  Log ("DISM $feat exit=$($p.ExitCode)")
}

Log 'wsl --set-default-version 2'
Start-Process wsl.exe -ArgumentList @('--set-default-version','2') -Wait -NoNewWindow

Log 'winget Oracle.VirtualBox'
$vb = Start-Process winget -ArgumentList @('install','--id','Oracle.VirtualBox','-e','--accept-package-agreements','--accept-source-agreements','--disable-interactivity','--scope','machine') -Wait -PassThru -NoNewWindow
Log ("VirtualBox exit=$($vb.ExitCode)")

Log 'winget OffSec.KaliLinux (WSL)'
$kl = Start-Process winget -ArgumentList @('install','--id','OffSec.KaliLinux','-e','--accept-package-agreements','--accept-source-agreements','--disable-interactivity') -Wait -PassThru -NoNewWindow
Log ("OffSec.KaliLinux exit=$($kl.ExitCode)")

Log 'wsl --install -d kali-linux --no-launch'
$w = Start-Process wsl.exe -ArgumentList @('--install','-d','kali-linux','--no-launch') -Wait -PassThru -NoNewWindow
Log ("wsl kali-linux exit=$($w.ExitCode)")

Log '===== elevated install done ====='
Log 'REBOOT REQUIRED before Kali WSL2 will start.'
