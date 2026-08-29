Set sh = CreateObject("WScript.Shell")
ps = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\Riesgos\kali-lab\consola-lab.ps1"""
' 0 = oculto: el formulario WinForms es la consola visual, no la ventana negra
sh.Run ps, 0, False
