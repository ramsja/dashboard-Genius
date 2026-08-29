Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\Riesgos\kali-lab"
' watchdog oculta: si el visor se cae (RAM), lo vuelve a levantar
sh.Run """C:\Users\Riesgos\AppData\Local\Programs\Python\Python314\python.exe"" -u ""C:\Users\Riesgos\kali-lab\visor-watchdog.py""", 0, False
