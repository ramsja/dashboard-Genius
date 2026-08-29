# Kali lab: consola de proceso + botones de herramientas.
$ErrorActionPreference = 'Stop'
try {
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$labWin = 'C:\Users\Riesgos\kali-lab'
$labWsl = '/mnt/c/Users/Riesgos/kali-lab'
$logWin = Join-Path $labWin 'proceso.log'
$runSh  = "$labWsl/lab-run.sh"

if (-not (Test-Path $logWin)) {
  Set-Content -Path $logWin -Value "Esperando procesos del laboratorio...`r`n" -Encoding UTF8
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'KALI LINUX LAB  -  GROK DIRECTOR'
$form.WindowState = 'Maximized'
$form.MinimumSize = New-Object System.Drawing.Size 980, 560
$form.BackColor = [System.Drawing.Color]::FromArgb(8, 12, 8)
$form.ForeColor = [System.Drawing.Color]::FromArgb(80, 220, 80)

$split = New-Object System.Windows.Forms.SplitContainer
$split.Dock = 'Fill'
$split.SplitterDistance = 310
$split.FixedPanel = 'Panel1'
$split.BackColor = [System.Drawing.Color]::FromArgb(8, 12, 8)
$form.Controls.Add($split)

$left = $split.Panel1
$left.Padding = New-Object System.Windows.Forms.Padding 10
$left.AutoScroll = $true
$right = $split.Panel2
$estadoFile = Join-Path $labWin 'conexion\ESTADO.txt'

$fontUi = New-Object System.Drawing.Font 'Segoe UI', 9
$fontLog = New-Object System.Drawing.Font 'Consolas', 10.5

$lbl = New-Object System.Windows.Forms.Label
$lbl.Text = "Objetivo (IP, dominio o archivo)"
$lbl.AutoSize = $true
$lbl.Font = $fontUi
$lbl.ForeColor = [System.Drawing.Color]::FromArgb(140, 230, 140)
$lbl.Location = New-Object System.Drawing.Point 10, 12
$left.Controls.Add($lbl)

$boxIn = New-Object System.Windows.Forms.TextBox
$boxIn.Font = $fontUi
$boxIn.Width = 280
$boxIn.Location = New-Object System.Drawing.Point 10, 34
$boxIn.BackColor = [System.Drawing.Color]::FromArgb(16, 24, 16)
$boxIn.ForeColor = [System.Drawing.Color]::FromArgb(200, 255, 200)
$boxIn.BorderStyle = 'FixedSingle'
$boxIn.Text = '1.1.1.1'
$left.Controls.Add($boxIn)

$status = New-Object System.Windows.Forms.Label
$status.Text = 'Grok: desconectado'
$status.AutoSize = $false
$status.Width = 280
$status.Height = 36
$status.Font = $fontUi
$status.ForeColor = [System.Drawing.Color]::FromArgb(180, 220, 80)
$status.Location = New-Object System.Drawing.Point 10, 64
$left.Controls.Add($status)

$box = New-Object System.Windows.Forms.TextBox
$box.Multiline = $true
$box.ScrollBars = 'Both'
$box.ReadOnly = $true
$box.WordWrap = $false
$box.Dock = 'Fill'
$box.BackColor = [System.Drawing.Color]::FromArgb(8, 12, 8)
$box.ForeColor = [System.Drawing.Color]::FromArgb(80, 220, 80)
$box.Font = $fontLog
$box.BorderStyle = 'None'
$right.Controls.Add($box)

function ConvertTo-WslPath([string]$p) {
  $p = $p.Trim().Trim('"')
  if ($p -match '^[A-Za-z]:\\') {
    $drive = $p.Substring(0,1).ToLower()
    $rest = $p.Substring(2).Replace('\','/')
    return "/mnt/$drive$rest"
  }
  if ($p -match '^[A-Za-z]:/') {
    $drive = $p.Substring(0,1).ToLower()
    $rest = $p.Substring(2)
    return "/mnt/$drive$rest"
  }
  return $p
}

function Get-Objetivo {
  $t = $boxIn.Text
  if ([string]::IsNullOrWhiteSpace($t)) { return '' }
  if ($t -match '[;&|`$<>]') {
    [System.Windows.Forms.MessageBox]::Show('Caracter no permitido en el objetivo.') | Out-Null
    return $null
  }
  return (ConvertTo-WslPath $t)
}

function Start-LabProcess([string]$title, [string]$inner) {
  $status.Text = "Ejecutando: $title"
  $wslArgs = @('-d','kali-linux','--','bash', $runSh, $title, $inner)
  Start-Process -FilePath 'wsl.exe' -ArgumentList $wslArgs -WindowStyle Hidden | Out-Null
}

function New-LabButton([string]$text, [int]$y, [scriptblock]$click) {
  $b = New-Object System.Windows.Forms.Button
  $b.Text = $text
  $b.Font = $fontUi
  $b.Width = 280
  $b.Height = 32
  $b.Location = New-Object System.Drawing.Point 10, $y
  $b.FlatStyle = 'Flat'
  $b.BackColor = [System.Drawing.Color]::FromArgb(20, 40, 20)
  $b.ForeColor = [System.Drawing.Color]::FromArgb(180, 255, 180)
  $b.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(40, 90, 40)
  $b.Add_Click($click)
  $left.Controls.Add($b)
  return $b
}

function Refresh-Grok {
  if (Test-Path $estadoFile) {
    try {
      $st = [System.IO.File]::ReadAllText($estadoFile)
      if ($st -match 'ESTADO=CONECTADO') {
        $status.Text = 'GROK CONECTADO - dirige el lab'
        $status.ForeColor = [System.Drawing.Color]::FromArgb(120, 255, 120)
        $form.Text = 'KALI LINUX LAB  -  GROK CONECTADO'
        return
      }
    } catch {}
  }
  $status.Text = 'Grok: desconectado'
}

$y = 108
[void](New-LabButton 'GROK  Conectar y dirigir' $y {
  Start-LabProcess 'Grok dirige el lab' "$labWsl/herramientas/grok-ciclo.sh"
})
$y += 34
[void](New-LabButton 'P10 Informe forense' $y {
  $t = Get-Objetivo
  if ($null -eq $t) { return }
  if ([string]::IsNullOrWhiteSpace($t) -or $t -eq '1.1.1.1') {
    $t = "$labWsl/evidencias"
  }
  Start-LabProcess "Informe forense" "$labWsl/herramientas/informe-forense.sh $t"
})
$y += 34
[void](New-LabButton 'P11 Auditoria del lab' $y {
  Start-LabProcess 'Auditoria del lab' "$labWsl/herramientas/auditoria-lab.sh"
})
$y += 34
[void](New-LabButton 'P13 Red neuronal vulns' $y {
  Start-LabProcess 'Red neuronal sensibilidad' "$labWsl/herramientas/red-vulnerabilidad.sh"
})
$y += 34
[void](New-LabButton 'P0  Listar procesos' $y {
  Start-LabProcess 'Listar procesos' "$labWsl/herramientas/inventario.sh"
})
$y += 34
[void](New-LabButton 'P1  Localizar IP' $y {
  $t = Get-Objetivo
  if ($null -eq $t) { return }
  if ([string]::IsNullOrWhiteSpace($t)) { $t = '1.1.1.1' }
  Start-LabProcess "Localizar IP $t" "$labWsl/herramientas/localizar-ip.sh $t"
})
$y += 34
[void](New-LabButton 'P2  Detectar fuerza bruta' $y {
  $t = Get-Objetivo
  if ($null -eq $t) { return }
  if ([string]::IsNullOrWhiteSpace($t) -or $t -eq '1.1.1.1') {
    $t = "$labWsl/evidencias"
  }
  Start-LabProcess "Detectar fuerza bruta" "$labWsl/herramientas/detectar-fuerza-bruta.sh $t"
})
$y += 34
[void](New-LabButton 'P3  Extraer datos' $y {
  $t = Get-Objetivo
  if ($null -eq $t) { return }
  if ([string]::IsNullOrWhiteSpace($t) -or $t -eq '1.1.1.1') {
    $t = "$labWsl/evidencias"
  }
  Start-LabProcess "Extraer datos" "$labWsl/herramientas/extraer-datos.sh $t"
})
$y += 34
[void](New-LabButton 'P4  Demo fuerza bruta LOCAL' $y {
  Start-LabProcess 'Demo fuerza bruta LOCAL' "$labWsl/herramientas/demo-fuerza-bruta-local.sh"
})
$y += 34
[void](New-LabButton 'P5  Estado del lab' $y {
  Start-LabProcess 'Estado del lab' "$labWsl/check-lab.sh"
})
$y += 34
[void](New-LabButton 'P7  Pruebas locales' $y {
  Start-LabProcess 'Pruebas locales' "$labWsl/pruebas-lab.sh"
})
$y += 34
[void](New-LabButton 'P8  Analisis HTTPS (lectura)' $y {
  Start-LabProcess 'Analisis HTTPS lectura' "$labWsl/mostrar-analisis-www.sh"
})
$y += 34
[void](New-LabButton 'Instalar herramientas extra' $y {
  Start-LabProcess 'Instalar herramientas extra' "$labWsl/install-tools.sh"
})
$y += 34
[void](New-LabButton 'Abrir evidencias / reportes' $y {
  Start-Process explorer.exe $labWin
})
$y += 34
[void](New-LabButton 'Visor de reportes CSV' $y {
  Start-Process 'msedge' 'http://localhost:8082/visor/'
})
$y += 34
[void](New-LabButton 'Clon Novusbet (8082)' $y {
  Start-Process 'msedge' 'http://localhost:8082/dashboard-novusbet-finance.html'
})
$y += 34
[void](New-LabButton 'Mi IP publica' $y {
  Start-LabProcess 'Mi IP publica' "$labWsl/herramientas/mi-ip.sh"
})

$script:lastLen = -1
function Refresh-Log {
  $text = $null
  if (Test-Path $logWin) {
    try { $text = [System.IO.File]::ReadAllText($logWin) } catch {}
  }
  if (-not $text) {
    try {
      $text = & wsl.exe -d kali-linux -- bash -lc "cat /root/kali-lab-proceso.log" 2>$null
    } catch {}
  }
  if ($null -eq $text) { $text = "Esperando procesos del laboratorio...`r`n" }
  if ($text.Length -ne $script:lastLen) {
    $script:lastLen = $text.Length
    $atEnd = ($box.SelectionStart -ge ($box.Text.Length - 4)) -or ($box.Text.Length -eq 0)
    $box.Text = $text
    if ($atEnd) {
      $box.SelectionStart = $box.Text.Length
      $box.ScrollToCaret()
    }
  }
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 600
$timer.Add_Tick({ Refresh-Log; Refresh-Grok })
$form.Add_Shown({
  Refresh-Log
  Refresh-Grok
  $timer.Start()
  $form.Activate()
  # Si el log esta vacio, listar procesos al abrir.
  $empty = $true
  if (Test-Path $logWin) {
    $cur = [System.IO.File]::ReadAllText($logWin)
    if ($cur -and $cur.Length -gt 80) { $empty = $false }
  }
  if ($empty) {
    Start-LabProcess 'Listar procesos' "$labWsl/herramientas/inventario.sh"
  }
})
$form.Add_FormClosed({ $timer.Stop() })

[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::Run($form)
} catch {
  $_ | Out-File 'C:\Users\Riesgos\kali-lab\consola-error.log' -Encoding utf8
  throw
}
