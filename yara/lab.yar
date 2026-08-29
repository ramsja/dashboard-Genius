rule Lab_BruteForce_Tools
{
    meta:
        descripcion = "User-agents o firmas de fuerza bruta / scanners"
    strings:
        $a = "Hydra" nocase
        $b = "sqlmap" nocase
        $c = "ncrack" nocase
        $d = "nikto" nocase
        $e = "gobuster" nocase
        $f = "masscan" nocase
    condition:
        any of them
}

rule Lab_Credenciales_en_claro
{
    meta:
        descripcion = "Posibles secretos en texto"
    strings:
        $a = "password=" nocase
        $b = "AKIA"
        $c = "BEGIN RSA PRIVATE KEY"
        $d = "BEGIN OPENSSH PRIVATE KEY"
        $e = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./
    condition:
        any of them
}

rule Lab_Webshell_generica
{
    meta:
        descripcion = "Marcas tipicas de webshell (solo evidencias propias)"
    strings:
        $a = "eval($_POST" nocase
        $b = "eval($_GET" nocase
        $c = "cmd.exe /c" nocase
        $d = "passthru(" nocase
        $e = "system($_" nocase
    condition:
        any of them
}
