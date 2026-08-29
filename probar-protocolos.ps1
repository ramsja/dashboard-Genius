$ErrorActionPreference = 'Continue'
$Host.UI.RawUI.WindowTitle = 'Lab Manager — Certificados y protocolos basicos'
Clear-Host
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host '  CERTIFICADOS HTTPS Y PROTOCOLOS BASICOS' -ForegroundColor Cyan
Write-Host '  Solo lectura: DNS, TCP, HTTP, TLS (sin exploits)' -ForegroundColor DarkCyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''

$certDir = 'C:\Users\Riesgos\certs'
$cerWww = Join-Path $certDir 'www.geniusbet.sv-CDN77-VIGENTE.cer'
$cerOri = Join-Path $certDir 'geniusbet.sv-ORIGEN-VENCIDO.cer'

function Get-CertInfo([string]$ConnectHost, [int]$Port, [string]$Sni) {
  $o = [ordered]@{ Host = $ConnectHost; Sni = $Sni; Tcp = $false; Tls = $false; Status = 'FALLO'; Subject = ''; Issuer = ''; NotAfter = $null; Days = $null; Proto = ''; San = ''; Error = '' }
  try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $ok = $tcp.BeginConnect($ConnectHost, $Port, $null, $null).AsyncWaitHandle.WaitOne(8000, $false)
    if (-not $ok -or -not $tcp.Connected) { $o.Error = 'TCP cerrado/timeout'; return [pscustomobject]$o }
    $o.Tcp = $true
    $cb = [System.Net.Security.RemoteCertificateValidationCallback]{ $true }
    $ssl = New-Object System.Net.Security.SslStream($tcp.GetStream(), $false, $cb)
    try { $ssl.AuthenticateAsClient($Sni) } catch { $o.Error = "$_" }
    if ($ssl.RemoteCertificate) {
      $c = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($ssl.RemoteCertificate)
      $o.Tls = $true
      $o.Subject = $c.Subject
      $o.Issuer = $c.Issuer
      $o.NotAfter = $c.NotAfter
      $o.Days = [int]($c.NotAfter - (Get-Date)).TotalDays
      $o.Proto = "$($ssl.SslProtocol)"
      try { $o.San = ($c.DnsNameList | ForEach-Object { $_.Unicode }) -join ', ' } catch {}
      $o.Status = if ((Get-Date) -gt $c.NotAfter) { 'VENCIDO' } else { 'VIGENTE' }
    }
    try { $ssl.Close() } catch {}
    $tcp.Close()
  } catch { $o.Error = "$_" }
  [pscustomobject]$o
}

Write-Host '[1/5] Abriendo certificados en el visor de Windows...' -ForegroundColor Yellow
if (Test-Path $cerWww) { Start-Process $cerWww } else { Write-Host "  No esta $cerWww" -ForegroundColor Red }
Start-Sleep -Seconds 1
if (Test-Path $cerOri) { Start-Process $cerOri } else { Write-Host "  No esta $cerOri" -ForegroundColor Red }
Write-Host '  En la ventana: pestana General + Detalles (fechas, sujeto, emisor).' -ForegroundColor DarkGray
Write-Host ''

Write-Host '[2/5] DNS' -ForegroundColor Yellow
foreach ($h in @('www.geniusbet.sv','geniusbet.sv')) {
  $r = Resolve-DnsName $h -ErrorAction SilentlyContinue
  $a = ($r | Where-Object { $_.Type -eq 'A' -or $_.QueryType -eq 'A' } | Select-Object -ExpandProperty IPAddress -ErrorAction SilentlyContinue) -join ', '
  $c = ($r | Where-Object { $_.Type -eq 'CNAME' -or $_.QueryType -eq 'CNAME' } | Select-Object -ExpandProperty NameHost -ErrorAction SilentlyContinue) -join ', '
  Write-Host ("  {0}" -f $h)
  if ($c) { Write-Host ("    CNAME  {0}" -f $c) }
  if ($a) { Write-Host ("    A      {0}" -f $a) }
  if (-not $a -and -not $c) { Write-Host '    (sin A/CNAME en esta consulta)' }
}
Write-Host ''

Write-Host '[3/5] TCP 80 / 443' -ForegroundColor Yellow
foreach ($pair in @(
  @{ H = 'www.geniusbet.sv'; P = 443 },
  @{ H = 'www.geniusbet.sv'; P = 80 },
  @{ H = 'geniusbet.sv'; P = 443 },
  @{ H = 'geniusbet.sv'; P = 80 }
)) {
  $tn = Test-NetConnection -ComputerName $pair.H -Port $pair.P -WarningAction SilentlyContinue
  $st = if ($tn.TcpTestSucceeded) { 'ABIERTO' } else { 'CERRADO' }
  $col = if ($tn.TcpTestSucceeded) { 'Green' } else { 'Red' }
  Write-Host ("  {0}:{1}  {2}  ({3})" -f $pair.H, $pair.P, $st, $tn.RemoteAddress) -ForegroundColor $col
}
Write-Host ''

Write-Host '[4/5] HTTP vs HTTPS (redireccion y HSTS)' -ForegroundColor Yellow
$checks = @(
  'http://www.geniusbet.sv/home',
  'https://www.geniusbet.sv/home',
  'http://geniusbet.sv/',
  'https://geniusbet.sv/'
)
foreach ($u in $checks) {
  $tmp = Join-Path $env:TEMP ('hdr-' + [Guid]::NewGuid().ToString() + '.txt')
  $line = curl.exe -sI --max-time 15 $u -D $tmp -o NUL -w 'http=%{http_code} err=%{errormsg}' 2>$null
  $hdr = @(Get-Content $tmp -ErrorAction SilentlyContinue)
  $code = (($hdr | Select-String '^HTTP/' | Select-Object -Last 1).Line)
  $loc = (($hdr | Select-String '^Location:' | Select-Object -Last 1).Line)
  $hsts = (($hdr | Select-String '^Strict-Transport-Security:' | Select-Object -Last 1).Line)
  $srv = (($hdr | Select-String '^Server:' | Select-Object -Last 1).Line)
  Write-Host ("  URL   {0}" -f $u)
  Write-Host ("        {0}  {1}" -f $line, $code)
  if ($loc) { Write-Host ("        {0}" -f $loc.Trim()) }
  if ($hsts) { Write-Host ("        HSTS  SI  {0}" -f $hsts.Trim()) -ForegroundColor Green }
  else { Write-Host '        HSTS  NO' -ForegroundColor DarkYellow }
  if ($srv) { Write-Host ("        {0}" -f $srv.Trim()) }
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  Write-Host ''
}

Write-Host '[5/5] Certificados TLS en vivo' -ForegroundColor Yellow
$www = Get-CertInfo 'www.geniusbet.sv' 443 'www.geniusbet.sv'
$ori = Get-CertInfo 'geniusbet.sv' 443 'geniusbet.sv'
foreach ($c in @($www, $ori)) {
  $col = if ($c.Status -eq 'VIGENTE') { 'Green' } elseif ($c.Status -eq 'VENCIDO') { 'Red' } else { 'Yellow' }
  Write-Host ("  {0}  (SNI {1})" -f $c.Host, $c.Sni) -ForegroundColor $col
  Write-Host ("    Estado     {0}" -f $c.Status)
  Write-Host ("    TCP        {0}    TLS handshake {1}" -f $c.Tcp, $c.Tls)
  Write-Host ("    Protocolo  {0}" -f $c.Proto)
  Write-Host ("    Sujeto     {0}" -f $c.Subject)
  Write-Host ("    SAN        {0}" -f $c.San)
  Write-Host ("    Emisor     {0}" -f $c.Issuer)
  Write-Host ("    Caduca     {0}  (dias {1})" -f $c.NotAfter, $c.Days)
  if ($c.Error) { Write-Host ("    Nota       {0}" -f $c.Error) -ForegroundColor DarkYellow }
  Write-Host ''
}

Write-Host '------------------------------------------------------------' -ForegroundColor Cyan
Write-Host 'RESUMEN ESPERADO' -ForegroundColor Cyan
Write-Host '  www.geniusbet.sv   HTTPS vigente (CDN77, TLS 1.3) ~ hasta 15 oct 2026'
Write-Host '  geniusbet.sv       cert VENCIDO desde 18 ago 2026 (origen 51.15.150.4)'
Write-Host '  http://www         200 sin redirigir a HTTPS  +  sin HSTS'
Write-Host '  http://geniusbet   301 hacia https://www'
Write-Host '------------------------------------------------------------' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Kali WSL: pendiente de REINICIO de Windows (error 0x80370114).' -ForegroundColor DarkYellow
Write-Host 'Atajo Kali en el escritorio: "Kali Linux Lab.lnk"' -ForegroundColor DarkGray
Write-Host ''
Write-Host 'Pulsa una tecla para cerrar...'
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
