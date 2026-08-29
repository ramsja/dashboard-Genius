from __future__ import annotations

import csv
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv


# ==========================================================
# CONFIGURACIÓN
# ==========================================================

BASE_URL = "https://headoffice.novusbet.com"

LOGIN_URL = f"{BASE_URL}/backoffice/auth/login"
TRANSACTIONS_URL = f"{BASE_URL}/backoffice/transactions-v2"
EXPORT_URL = f"{BASE_URL}/backoffice/transactions-v2/export"

SITE_ID = "1049"
USER_TYPE = "2"
SUBUSERS = "0"

# Producto causal a consultar
CAUSAL_PRODUCT_ID = os.getenv("CAUSAL_PRODUCT_ID", "").strip()

PER_PAGE = "50"

TODAY = datetime.now().strftime("%Y-%m-%d")
START_DATE = os.getenv("START_DATE", TODAY)
END_DATE = os.getenv("END_DATE", TODAY)

BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = BASE_DIR / "descargas"
REPORTS_DIR = BASE_DIR / "reportes"

TIMEOUT = 120
MAX_EXPORT_ATTEMPTS = 200
EXPORT_WAIT_SECONDS = 3

HEADERS_HTML = {
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 "
        "(KHTML, like Gecko) "
        "Chrome/149.0 Safari/537.36"
    ),
}


# ==========================================================
# UTILIDADES
# ==========================================================

def get_credentials() -> tuple[str, str]:
    load_dotenv()

    username = os.getenv("BO_USERNAME", "").strip()
    password = os.getenv("BO_PASSWORD", "").strip()

    if not username or not password:
        raise RuntimeError(
            "Faltan BO_USERNAME o BO_PASSWORD en el archivo .env."
        )

    return username, password


def extract_csrf_token(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")

    input_token = soup.find("input", {"name": "_token"})
    if input_token and input_token.get("value"):
        return str(input_token["value"]).strip()

    meta_token = soup.find("meta", {"name": "csrf-token"})
    if meta_token and meta_token.get("content"):
        return str(meta_token["content"]).strip()

    return ""


def get_date_range() -> tuple[str, str]:
    try:
        start = datetime.strptime(START_DATE, "%Y-%m-%d")
        end = datetime.strptime(END_DATE, "%Y-%m-%d")
    except ValueError as exc:
        raise RuntimeError(
            "START_DATE y END_DATE deben tener formato YYYY-MM-DD."
        ) from exc

    if start > end:
        raise RuntimeError(
            "START_DATE no puede ser mayor que END_DATE."
        )

    return (
        start.strftime("%Y-%m-%d 00:00"),
        end.strftime("%Y-%m-%d 23:59"),
    )


def build_export_payload(token: str) -> dict[str, str]:
    date_from, date_to = get_date_range()

    return {
        "site_id[]": SITE_ID,
        "transaction_id": "",
        "user_type": USER_TYPE,
        "real_bonus_money": "",
        "user-id": "",
        "user-name": "",
        "subusers": SUBUSERS,
        "causal_product_id[]": CAUSAL_PRODUCT_ID,
        "min-value": "",
        "max-value": "",
        "per_page": PER_PAGE,
        "currency_id": "",
        "type": "",
        "bonus": "",
        "from-date": date_from,
        "to-date": date_to,
        "_token": token,
    }


def parse_json_response(
    response: requests.Response,
) -> dict[str, Any]:
    try:
        return response.json()
    except ValueError as exc:
        preview = response.text[:1000]

        raise RuntimeError(
            f"La respuesta no es JSON. "
            f"HTTP {response.status_code}. "
            f"Contenido: {preview}"
        ) from exc


def verify_csv(content: bytes) -> None:
    text = content.decode(
        "utf-8-sig",
        errors="replace",
    )

    if not text.strip():
        raise RuntimeError(
            "El archivo CSV descargado está vacío."
        )

    lines = text.splitlines()
    first_line = lines[0] if lines else ""

    if "," not in first_line and ";" not in first_line:
        raise RuntimeError(
            "La respuesta descargada no parece un CSV. "
            f"Primera línea: {first_line[:500]}"
        )


def print_export_status(
    attempt: int,
    response_json: dict[str, Any],
) -> None:
    items_count = response_json.get("itemsCount")
    download_value = response_json.get("download")
    response_value = response_json.get("response")

    print(
        f"Intento {attempt}/{MAX_EXPORT_ATTEMPTS} | "
        f"response={response_value} | "
        f"itemsCount={items_count} | "
        f"download={download_value}"
    )


def is_download_ready(
    response_json: dict[str, Any],
) -> bool:
    value = response_json.get("download")

    if value is True:
        return True

    if isinstance(value, int):
        return value == 1

    if isinstance(value, str):
        return value.strip().lower() in {
            "1",
            "true",
            "ready",
            "yes",
        }

    return False


# ==========================================================
# LOGIN
# ==========================================================

def login(
    session: requests.Session,
    username: str,
    password: str,
) -> str:
    login_page = session.get(
        LOGIN_URL,
        headers=HEADERS_HTML,
        timeout=TIMEOUT,
        allow_redirects=False,
    )

    if login_page.status_code != 200:
        raise RuntimeError(
            "No se pudo abrir el login. "
            f"HTTP {login_page.status_code}"
        )

    token = extract_csrf_token(login_page.text)

    if not token:
        raise RuntimeError(
            "No se encontró el token CSRF en el login."
        )

    login_headers = {
        **HEADERS_HTML,
        "Origin": BASE_URL,
        "Referer": LOGIN_URL,
    }

    login_response = session.post(
        LOGIN_URL,
        data={
            "_token": token,
            "username": username,
            "password": password,
        },
        headers=login_headers,
        timeout=TIMEOUT,
        allow_redirects=False,
    )

    location = login_response.headers.get("Location", "")

    valid_redirect = (
        login_response.status_code in (301, 302, 303)
        and "/backoffice/dashboard" in location
    )

    if not valid_redirect:
        raise RuntimeError(
            "El inicio de sesión falló. "
            f"HTTP {login_response.status_code}. "
            f"Location: {location}"
        )

    print("Inicio de sesión correcto.")

    return token


# ==========================================================
# DESCARGA
# ==========================================================

def get_transactions_token(
    session: requests.Session,
    fallback_token: str,
) -> str:
    response = session.get(
        TRANSACTIONS_URL,
        headers=HEADERS_HTML,
        timeout=TIMEOUT,
        allow_redirects=False,
    )

    if response.status_code != 200:
        raise RuntimeError(
            "No se pudo abrir la página de transacciones. "
            f"HTTP {response.status_code}"
        )

    token = extract_csrf_token(response.text)

    return token or fallback_token


def post_export(
    session: requests.Session,
    payload: dict[str, str],
) -> requests.Response:
    headers = {
        **HEADERS_HTML,
        "Origin": BASE_URL,
        "Referer": TRANSACTIONS_URL,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
    }

    return session.post(
        EXPORT_URL,
        data=payload,
        headers=headers,
        timeout=TIMEOUT,
        allow_redirects=False,
    )


def download_csv(
    session: requests.Session,
    token: str,
) -> bytes:
    payload = build_export_payload(token)

    date_from, date_to = get_date_range()

    print(
        f"Solicitando exportación desde {date_from} "
        f"hasta {date_to}."
    )

    first_response = post_export(
        session,
        payload,
    )

    if first_response.status_code != 200:
        raise RuntimeError(
            "No se pudo iniciar la exportación. "
            f"HTTP {first_response.status_code}. "
            f"Respuesta: {first_response.text[:1000]}"
        )

    first_json = parse_json_response(
        first_response
    )

    scroll_id = first_json.get("scrollId")

    if not first_json.get("response") or not scroll_id:
        raise RuntimeError(
            "No se pudo generar scrollId. "
            f"Respuesta: {first_response.text[:1000]}"
        )

    print("Exportación iniciada correctamente.")
    print(f"scrollId generado: {scroll_id}")

    payload["scrollId"] = str(scroll_id)

    last_json: dict[str, Any] = first_json
    download_ready = False

    for attempt in range(
        1,
        MAX_EXPORT_ATTEMPTS + 1,
    ):
        preparation_response = post_export(
            session,
            payload,
        )

        if preparation_response.status_code != 200:
            raise RuntimeError(
                "Error consultando el estado de la exportación. "
                f"HTTP {preparation_response.status_code}. "
                f"Respuesta: "
                f"{preparation_response.text[:1000]}"
            )

        preparation_json = parse_json_response(
            preparation_response
        )

        last_json = preparation_json

        print_export_status(
            attempt,
            preparation_json,
        )

        if not preparation_json.get("response"):
            raise RuntimeError(
                "El servidor indicó que la exportación falló. "
                f"Respuesta: "
                f"{preparation_response.text[:1000]}"
            )

        updated_scroll_id = preparation_json.get(
            "scrollId"
        )

        if updated_scroll_id:
            payload["scrollId"] = str(
                updated_scroll_id
            )

        if is_download_ready(
            preparation_json
        ):
            download_ready = True
            break

        time.sleep(
            EXPORT_WAIT_SECONDS
        )

    if not download_ready:
        raise RuntimeError(
            "La exportación no estuvo lista dentro del tiempo "
            "máximo permitido. "
            f"Se esperaron aproximadamente "
            f"{MAX_EXPORT_ATTEMPTS * EXPORT_WAIT_SECONDS} segundos. "
            f"Última respuesta: {last_json}"
        )

    download_payload = dict(
        payload
    )

    download_payload["download"] = "1"

    print(
        "El servidor terminó de preparar la exportación."
    )

    print(
        "Descargando CSV..."
    )

    download_response = post_export(
        session,
        download_payload,
    )

    if download_response.status_code != 200:
        raise RuntimeError(
            "Error descargando el CSV. "
            f"HTTP {download_response.status_code}. "
            f"Respuesta: {download_response.text[:1000]}"
        )

    content_type = download_response.headers.get(
        "Content-Type",
        "",
    )

    content_disposition = download_response.headers.get(
        "Content-Disposition",
        "",
    )

    print(
        f"Content-Type: {content_type}"
    )

    print(
        f"Content-Disposition: {content_disposition}"
    )

    print(
        "Tamaño recibido: "
        f"{len(download_response.content):,} bytes"
    )

    verify_csv(
        download_response.content
    )

    return download_response.content


# ==========================================================
# GUARDADO DEL ARCHIVO
# ==========================================================

def save_csv(
    content: bytes,
) -> Path:
    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    date_from, date_to = get_date_range()

    clean_from = date_from[:10]
    clean_to = date_to[:10]

    filename = (
        f"transacciones_producto_{CAUSAL_PRODUCT_ID}_"
        f"{clean_from}_{clean_to}.csv"
    )

    filepath = OUTPUT_DIR / filename

    filepath.write_bytes(
        content
    )

    return filepath.resolve()


def detect_delimiter(
    filepath: Path,
) -> str:
    with filepath.open(
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        sample = file.read(4096)

    try:
        dialect = csv.Sniffer().sniff(
            sample,
            delimiters=",;",
        )

        return dialect.delimiter

    except csv.Error:
        return ","


def count_csv_rows(
    filepath: Path,
) -> int:
    delimiter = detect_delimiter(
        filepath
    )

    with filepath.open(
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        reader = csv.reader(
            file,
            delimiter=delimiter,
        )

        total_rows = sum(
            1 for _ in reader
        )

    return max(
        total_rows - 1,
        0,
    )


def classify_discipline(row: dict[str, str]) -> str:
    text = " ".join(
        row.get(name, "")
        for name in (
            "Billeteras",
            "Tipo de transacción",
            "grupo causal",
            "causal",
            "producto causal",
            "Descripción",
        )
    ).casefold()

    if any(term in text for term in ("casino", "slot", "live casino", "pragmatic", "betsoft")):
        return "casino"
    if any(term in text for term in ("sport", "deport", "futbol", "fútbol", "basket", "tenis")):
        return "deportes"
    return "otros"


def normalize_text(value: Any) -> str:
    return str(value or "").strip()


def get_row_value(row: dict[str, Any], *names: str) -> str:
    for name in names:
        key = name.casefold()
        if key in row:
            return normalize_text(row.get(key))
        for row_key, row_value in row.items():
            if isinstance(row_key, str) and row_key.casefold() == key:
                return normalize_text(row_value)
    return ""


def classify_client_status(row: dict[str, Any]) -> str:
    status_text = " ".join(
        get_row_value(
            row,
            "Estado",
            "status",
            "state",
            "estado",
            "client_status",
            "status_cliente",
        )
        for _ in [0]
    ).casefold()

    if not status_text:
        combined_text = " ".join(
            value for value in (
                get_row_value(row, "Cliente", "customer", "nombre", "username", "usuario"),
                get_row_value(row, "Billeteras", "wallet", "wallets", "billetera"),
                get_row_value(row, "Descripción", "description", "descripcion"),
            )
        ).casefold()
        status_text = combined_text

    if any(term in status_text for term in ("activo", "active", "online", "conectado", "connected", "online")):
        return "activo"
    if any(term in status_text for term in ("inactivo", "inactive", "offline", "sin actividad", "no activo")):
        return "inactivo"
    if any(term in status_text for term in ("desconectado", "disconnected", "logout", "cerrado")):
        return "desconectado"
    if any(term in status_text for term in ("bloqueado", "blocked", "suspendido", "suspended", "pendiente")):
        return "suspendido"
    return "otros"


def generate_reports(filepath: Path) -> dict[str, Path]:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    discipline_paths = {
        "deportes": REPORTS_DIR / "transacciones-deportes.csv",
        "casino": REPORTS_DIR / "transacciones-casino.csv",
        "otros": REPORTS_DIR / "transacciones-otros.csv",
    }
    client_status_paths = {
        "activo": REPORTS_DIR / "clientes-activos.csv",
        "inactivo": REPORTS_DIR / "clientes-inactivos.csv",
        "desconectado": REPORTS_DIR / "clientes-desconectados.csv",
        "suspendido": REPORTS_DIR / "clientes-suspendidos.csv",
        "otros": REPORTS_DIR / "clientes-otros.csv",
    }
    field_counts: dict[str, dict[str, int]] = {}
    discipline_counts: dict[str, int] = {key: 0 for key in discipline_paths}
    client_status_counts: dict[str, int] = {key: 0 for key in client_status_paths}

    with filepath.open("r", encoding="utf-8-sig", newline="", errors="replace") as source:
        reader = csv.DictReader(source)
        header = reader.fieldnames or []
        writers: dict[str, csv.DictWriter] = {}
        handles = {}
        try:
            for discipline, path in discipline_paths.items():
                handles[discipline] = path.open("w", encoding="utf-8-sig", newline="")
                writers[discipline] = csv.DictWriter(handles[discipline], fieldnames=header, extrasaction="ignore")
                writers[discipline].writeheader()
            for status, path in client_status_paths.items():
                handles[status] = path.open("w", encoding="utf-8-sig", newline="")
                writers[status] = csv.DictWriter(handles[status], fieldnames=header, extrasaction="ignore")
                writers[status].writeheader()
            for row in reader:
                discipline = classify_discipline(row)
                writers[discipline].writerow(row)
                discipline_counts[discipline] += 1

                client_status = classify_client_status(row)
                writers[client_status].writerow(row)
                client_status_counts[client_status] += 1

                for field in header:
                    value = (row.get(field) or "").strip()
                    counts = field_counts.setdefault(field, {})
                    if value:
                        counts[value] = counts.get(value, 0) + 1
        finally:
            for handle in handles.values():
                handle.close()

    fields_report = REPORTS_DIR / "resumen-campos.json"
    fields_report.write_text(
        json.dumps(
            {
                "source": str(filepath),
                "generated_at": datetime.now().isoformat(timespec="seconds"),
                "records": sum(discipline_counts.values()),
                "disciplines": discipline_counts,
                "client_status": client_status_counts,
                "fields": [
                    {
                        "name": name,
                        "filled": sum(values.values()),
                        "distinct": len(values),
                        "top_values": sorted(values.items(), key=lambda item: item[1], reverse=True)[:10],
                    }
                    for name, values in field_counts.items()
                ],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    client_snapshot = REPORTS_DIR / "clientes-resumen.json"
    client_snapshot.write_text(
        json.dumps(
            {
                "generated_at": datetime.now().isoformat(timespec="seconds"),
                "source": str(filepath),
                "totals": {status: count for status, count in client_status_counts.items()},
                "active": client_status_counts.get("activo", 0),
                "inactive": client_status_counts.get("inactivo", 0),
                "disconnected": client_status_counts.get("desconectado", 0),
                "suspended": client_status_counts.get("suspendido", 0),
                "other": client_status_counts.get("otros", 0),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    schema = REPORTS_DIR / "supabase-schema.sql"
    schema.write_text(
        """create table if not exists transaction_records (
      id bigint generated always as identity primary key,
      source_transaction_id text, created_at timestamptz, site text, parent_id text,
      user_id text, username text, user_type text, currency text, income numeric,
      status numeric, total numeric, commission numeric, balance numeric, current_balance numeric,
      wallet text, transaction_type text, causal_group text, causal text, causal_product text,
      description text, note text, ip_address inet, discipline text not null,
      client_status text not null default 'otros',
      source_file text, raw jsonb not null, imported_at timestamptz default now()
    );

    create index if not exists transaction_records_created_at_idx on transaction_records(created_at);
    create index if not exists transaction_records_discipline_idx on transaction_records(discipline);
    create index if not exists transaction_records_user_id_idx on transaction_records(user_id);
    create index if not exists transaction_records_client_status_idx on transaction_records(client_status);

    create or replace view transaction_discipline_summary as
    select discipline, client_status, count(*) as records, sum(total) as total, sum(income) as income
    from transaction_records group by discipline, client_status;
    """,
        encoding="utf-8",
    )
    return {
        **discipline_paths,
        **client_status_paths,
        "clientes": client_snapshot,
        "fields": fields_report,
        "schema": schema,
    }


def get_supabase_config() -> tuple[str, str]:
    load_dotenv()
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    return url, key


def sync_to_supabase(filepath: Path) -> str | None:
    url, service_key = get_supabase_config()
    if not url or not service_key:
        print("Supabase no configurado; se omite la sincronización automática.")
        return None

    table_name = os.getenv("SUPABASE_TABLE", "transaction_records").strip() or "transaction_records"

    with filepath.open("r", encoding="utf-8-sig", newline="", errors="replace") as source:
        reader = csv.DictReader(source)
        fieldnames = reader.fieldnames or []
        rows: list[dict[str, Any]] = []
        for row in reader:
            normalized = {field: (row.get(field) or "").strip() for field in fieldnames}
            normalized["discipline"] = classify_discipline(normalized)
            normalized["client_status"] = classify_client_status(normalized)
            normalized["source_file"] = str(filepath)
            normalized["imported_at"] = datetime.now().isoformat(timespec="seconds")
            normalized["raw"] = json.dumps(normalized, ensure_ascii=False)
            rows.append(normalized)

    if not rows:
        print("No hay filas para sincronizar con Supabase.")
        return None

    endpoint = f"{url}/rest/v1/{table_name}"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    response = requests.post(
        endpoint,
        headers=headers,
        json=rows,
        timeout=TIMEOUT,
    )

    if response.status_code not in (200, 201, 204):
        raise RuntimeError(
            "No se pudo sincronizar con Supabase. "
            f"HTTP {response.status_code}. Respuesta: {response.text[:1000]}"
        )

    print(f"Sincronización completada en Supabase: {endpoint}")
    return endpoint


# ==========================================================
# EJECUCIÓN
# ==========================================================

def main() -> None:
    try:
        username, password = get_credentials()

        with requests.Session() as session:
            initial_token = login(
                session,
                username,
                password,
            )

            transactions_token = get_transactions_token(
                session,
                initial_token,
            )

            csv_content = download_csv(
                session,
                transactions_token,
            )

            filepath = save_csv(
                csv_content
            )

            reports = generate_reports(filepath)
            sync_to_supabase(filepath)

            total_rows = count_csv_rows(
                filepath
            )

        print()
        print(
            "Descarga completada correctamente."
        )

        print(
            f"Archivo: {filepath}"
        )

        print(
            f"Filas de datos: {total_rows:,}"
        )

        print("Reportes generados:")
        for report_path in reports.values():
            print(f"- {report_path}")

    except requests.Timeout as exc:
        print(
            f"Tiempo de espera agotado: {exc}",
            file=sys.stderr,
        )

        sys.exit(1)

    except requests.ConnectionError as exc:
        print(
            f"Error de conexión: {exc}",
            file=sys.stderr,
        )

        sys.exit(1)

    except requests.RequestException as exc:
        print(
            f"Error HTTP: {exc}",
            file=sys.stderr,
        )

        sys.exit(1)

    except Exception as exc:
        print(
            f"Error: {exc}",
            file=sys.stderr,
        )

        sys.exit(1)


if __name__ == "__main__":
    main()
