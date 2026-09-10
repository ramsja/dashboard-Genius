"""Aplica exports locales al historial sin sustituir días de mayor cobertura.

Solo publica agregados. Los CSV originales permanecen locales.
"""
import csv
import importlib.util
import json
from collections import Counter
from pathlib import Path

BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('historico', BASE / 'construir-historico.py')
hist = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hist)


def main():
    files = sorted((BASE / 'descargas').glob('transacciones_producto__*.csv'))
    if not files:
        raise SystemExit('No se encontraron CSV.')
    seen = set()
    controls = Counter()
    for path in files:
        count = 0
        with path.open(encoding='utf-8-sig', newline='') as source:
            for row in csv.DictReader(source):
                key = row['ID de transacción'].strip()
                day = row['Crear hora'][:10]
                if not key or key in seen:
                    raise ValueError('ID vacío o duplicado en ' + path.name)
                if not day or None in row:
                    raise ValueError('Fila inválida en ' + path.name)
                seen.add(key)
                controls[day] += 1
                count += 1
        print(f'{path.name}: {count:,} filas válidas', flush=True)
    data = hist.load_existing()
    applied = set()
    for path in files:
        days, _ = hist.process_csv(path)
        for day, summary in days.items():
            assert summary['transacciones'] == controls[day], 'Exports solapados por día'
            old = data['dias'].get(day, {}).get('transacciones', 0)
            if old > summary['transacciones']:
                print(f'{day}: se conserva export publicado ({old:,} > {summary["transacciones"]:,})')
                continue
            hist.merge(data, {day: summary}, path)
            applied.add(day)
    for day in applied:
        assert data['dias'][day]['transacciones'] == controls[day]
    hist.HISTORICO_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'Validados: {len(files)} CSV, {len(seen):,} IDs únicos. Historial: {len(data["dias"])} días, '
          f'{sum(d["transacciones"] for d in data["dias"].values()):,} transacciones.')


if __name__ == '__main__':
    main()
