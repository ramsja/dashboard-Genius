"""
Agente Predictivo de Apuestas Elevadas
Estudio de Juegos - GeniusBet
"""

import csv
import json
from pathlib import Path
from datetime import datetime
from collections import defaultdict

def encontrar_columna_descripcion(headers: list) -> str:
    """Encuentra la columna de descripcion sin importar el encoding"""
    for h in headers:
        # Buscar patron "Descripci" seguido de cualquier cosa
        if h.lower().startswith("descripci"):
            return h
    return None

def analizar_juegos(csv_path: Path):
    """Analiza transacciones por juego y genera estadisticas"""
    
    juegos = defaultdict(lambda: {
        "apariciones": 0,
        "total_apostado": 0.0,
        "montos": [],
        "usuarios": set(),
        "horas": [],
        "ips": set()
    })
    
    total_transacciones = 0
    col_descripcion = None
    
    with csv_path.open("r", encoding="utf-8-sig", newline="", errors="replace") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames
        
        # Encontrar columna de descripcion
        col_descripcion = encontrar_columna_descripcion(headers)
        if not col_descripcion:
            print("Error: No se encontro la columna de descripcion")
            print("Columnas disponibles:", headers)
            return {}, 0
        
        for row in reader:
            total_transacciones += 1
            
            juego = row.get(col_descripcion, "").strip()
            if not juego:
                continue
            
            try:
                total = float(row.get("Total", "0").replace(",", "."))
                abs_total = abs(total)
                
                usuario = row.get("Usuario", "")
                ip = row.get("Direccion IP", "")
                if not ip:
                    # Buscar columna de IP con encoding
                    for h in headers:
                        if "ip" in h.lower() or "direccion" in h.lower():
                            ip = row.get(h, "")
                            break
                
                hora = row.get("Crear hora", "")
                
                juegos[juego]["apariciones"] += 1
                juegos[juego]["total_apostado"] += abs_total
                juegos[juego]["montos"].append(abs_total)
                
                if usuario:
                    juegos[juego]["usuarios"].add(usuario)
                if ip:
                    juegos[juego]["ips"].add(ip)
                if hora:
                    juegos[juego]["horas"].append(hora)
                    
            except:
                continue
    
    return juegos, total_transacciones

def calcular_estadisticas(juegos: dict) -> list:
    """Calcula estadisticas por juego"""
    
    resultados = []
    
    for juego, datos in juegos.items():
        if datos["apariciones"] == 0:
            continue
        
        montos = datos["montos"]
        promedio = datos["total_apostado"] / datos["apariciones"]
        
        # Calcular mediana
        montos_ordenados = sorted(montos)
        n = len(montos_ordenados)
        if n % 2 == 0:
            mediana = (montos_ordenados[n//2 - 1] + montos_ordenados[n//2]) / 2
        else:
            mediana = montos_ordenados[n//2]
        
        # Calcular desviacion estandar
        varianza = sum((x - promedio) ** 2 for x in montos) / n
        desviacion = varianza ** 0.5
        
        resultados.append({
            "juego": juego,
            "apariciones": datos["apariciones"],
            "total_apostado": round(datos["total_apostado"], 2),
            "promedio": round(promedio, 2),
            "mediana": round(mediana, 2),
            "desviacion": round(desviacion, 2),
            "minimo": round(min(montos), 2),
            "maximo": round(max(montos), 2),
            "usuarios_unicos": len(datos["usuarios"]),
            "ips_unicas": len(datos["ips"])
        })
    
    # Ordenar por total apostado (mayor a menor)
    resultados.sort(key=lambda x: x["total_apostado"], reverse=True)
    
    return resultados

def detectar_apuestas_elevadas(juegos: dict, umbral: float = 100.0) -> list:
    """Detecta juegos con apuestas elevadas"""
    
    elevadas = []
    
    for juego, datos in juegos.items():
        for monto in datos["montos"]:
            if monto >= umbral:
                elevadas.append({
                    "juego": juego,
                    "monto": monto
                })
    
    elevadas.sort(key=lambda x: x["monto"], reverse=True)
    return elevadas

def generar_reporte(resultados: list, total_transacciones: int, apuestas_elevadas: list):
    """Genera el reporte formateado"""
    
    print("=" * 90)
    print("ESTUDIO DE JUEGOS - GENIUSBET")
    print("=" * 90)
    print(f"\nTotal de transacciones analizadas: {total_transacciones:,}")
    print(f"Juegos encontrados: {len(resultados)}")
    print(f"Apuestas elevadas (>$100): {len(apuestas_elevadas)}")
    
    print("\n" + "=" * 90)
    print(f"{'JUEGO':<45} {'APARICIONES':>12} {'APOSTADO ESTIMADO':>18} {'PROMEDIO':>12}")
    print("=" * 90)
    
    for r in resultados[:30]:  # Top 30 juegos
        juego = r["juego"][:43]
        print(f"{juego:<45} {r['apariciones']:>12,} ${r['total_apostado']:>15,.2f} ${r['promedio']:>10,.2f}")
    
    print("=" * 90)
    
    # Estadisticas detalladas del top 5
    print("\n\nESTADISTICAS DETALLADAS - TOP 5 JUEGOS:")
    print("-" * 90)
    
    for i, r in enumerate(resultados[:5], 1):
        print(f"\n{i}. {r['juego']}")
        print(f"   Apariciones: {r['apariciones']:,}")
        print(f"   Total apostado: ${r['total_apostado']:,.2f}")
        print(f"   Promedio: ${r['promedio']:,.2f}")
        print(f"   Mediana: ${r['mediana']:,.2f}")
        print(f"   Desviacion estandar: ${r['desviacion']:,.2f}")
        print(f"   Minimo: ${r['minimo']:,.2f} | Maximo: ${r['maximo']:,.2f}")
        print(f"   Usuarios unicos: {r['usuarios_unicos']:,} | IPs unicas: {r['ips_unicas']:,}")
    
    # Apuestas elevadas
    print("\n\nAPUESTAS ELEVADAS (>$100 USD):")
    print("-" * 90)
    
    for ap in apuestas_elevadas[:20]:
        print(f"  {ap['juego'][:50]:<50} ${ap['monto']:>10,.2f}")
    
    return resultados

def guardar_json(resultados: list, total_transacciones: int, apuestas_elevadas: list, output_path: Path):
    """Guarda el reporte en formato JSON"""
    
    datos = {
        "fecha_analisis": datetime.now().isoformat(),
        "total_transacciones": total_transacciones,
        "total_juegos": len(resultados),
        "apuestas_elevadas_count": len(apuestas_elevadas),
        "juegos": resultados,
        "apuestas_elevadas": apuestas_elevadas[:50]
    }
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)
    
    print(f"\nReporte JSON guardado en: {output_path}")

if __name__ == "__main__":
    csv_path = Path("descargas/transacciones_producto__2026-08-28_2026-08-28.csv")
    
    if not csv_path.exists():
        print("Error: No se encontro el archivo CSV")
        exit(1)
    
    # Ejecutar analisis
    juegos, total_transacciones = analizar_juegos(csv_path)
    resultados = calcular_estadisticas(juegos)
    apuestas_elevadas = detectar_apuestas_elevadas(juegos)
    
    # Generar reporte
    generar_reporte(resultados, total_transacciones, apuestas_elevadas)
    
    # Guardar JSON
    output_path = Path("reportes/estudio-juegos.json")
    guardar_json(resultados, total_transacciones, apuestas_elevadas, output_path)
