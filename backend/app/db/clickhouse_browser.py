"""
ClickHouse browser for generic database exploration.

Provides schema discovery and read-only query execution,
reusing the existing ClickHouse client singleton.
"""
import re
import time
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger("kato_dashboard.db.clickhouse_browser")

# Keywords that are never allowed in queries
BLOCKED_KEYWORDS = {
    'INSERT', 'ALTER', 'DROP', 'CREATE', 'TRUNCATE', 'SYSTEM',
    'GRANT', 'REVOKE', 'KILL', 'OPTIMIZE', 'ATTACH', 'DETACH',
    'RENAME', 'EXCHANGE', 'SET', 'REVOKE',
}


def validate_query(query: str) -> tuple[bool, str]:
    """
    Validate that a query is a safe read-only SELECT statement.

    Returns:
        (is_valid, error_message) tuple
    """
    # Strip comments and whitespace
    cleaned = re.sub(r'--[^\n]*', '', query)
    cleaned = re.sub(r'/\*.*?\*/', '', cleaned, flags=re.DOTALL)
    cleaned = cleaned.strip().rstrip(';').strip()

    if not cleaned:
        return False, "Empty query"

    # Must start with SELECT, SHOW, DESCRIBE, or EXISTS
    first_word = cleaned.split()[0].upper()
    if first_word not in ('SELECT', 'SHOW', 'DESCRIBE', 'DESC', 'EXISTS', 'EXPLAIN', 'WITH'):
        return False, f"Only SELECT/SHOW/DESCRIBE queries are allowed, got: {first_word}"

    # Check for blocked keywords as standalone words
    upper_cleaned = cleaned.upper()
    for keyword in BLOCKED_KEYWORDS:
        pattern = rf'\b{keyword}\b'
        if re.search(pattern, upper_cleaned):
            return False, f"Blocked keyword found: {keyword}"

    return True, ""


async def list_databases() -> List[str]:
    """List all ClickHouse databases."""
    from app.db.clickhouse import get_clickhouse_client

    client = await get_clickhouse_client()
    result = client.query("SHOW DATABASES")
    return [row[0] for row in result.result_rows]


async def list_tables(database: str) -> List[Dict[str, str]]:
    """List all tables in a database with their engines."""
    from app.db.clickhouse import get_clickhouse_client

    client = await get_clickhouse_client()
    result = client.query(
        "SELECT name, engine, total_rows, total_bytes "
        "FROM system.tables "
        "WHERE database = %(database)s "
        "ORDER BY name",
        parameters={'database': database}
    )
    tables = []
    for row in result.result_rows:
        tables.append({
            'name': row[0],
            'engine': row[1],
            'total_rows': row[2],
            'total_bytes': row[3],
        })
    return tables


async def get_table_schema(database: str, table: str) -> List[Dict[str, str]]:
    """Get column definitions for a table."""
    from app.db.clickhouse import get_clickhouse_client

    client = await get_clickhouse_client()
    result = client.query(
        "SELECT name, type, default_kind, default_expression, comment "
        "FROM system.columns "
        "WHERE database = %(database)s AND table = %(table)s "
        "ORDER BY position",
        parameters={'database': database, 'table': table}
    )
    columns = []
    for row in result.result_rows:
        columns.append({
            'name': row[0],
            'type': row[1],
            'default_kind': row[2] or '',
            'default_expression': row[3] or '',
            'comment': row[4] or '',
        })
    return columns


async def get_table_row_count(database: str, table: str) -> int:
    """Get the row count for a table."""
    from app.db.clickhouse import get_clickhouse_client

    client = await get_clickhouse_client()
    result = client.query(
        f"SELECT count() FROM `{database}`.`{table}`"
    )
    return result.result_rows[0][0]


async def get_table_data(
    database: str,
    table: str,
    limit: int = 100,
    offset: int = 0,
) -> Dict[str, Any]:
    """Get paginated data from a table."""
    from app.db.clickhouse import get_clickhouse_client
    from app.core.config import get_settings

    settings = get_settings()
    max_rows = settings.clickhouse_query_max_rows
    limit = min(limit, max_rows)

    client = await get_clickhouse_client()

    start = time.time()
    result = client.query(
        f"SELECT * FROM `{database}`.`{table}` LIMIT %(limit)s OFFSET %(offset)s",
        parameters={'limit': limit, 'offset': offset}
    )
    elapsed_ms = round((time.time() - start) * 1000, 2)

    columns = list(result.column_names)
    types = [str(t) for t in result.column_types] if hasattr(result, 'column_types') else []
    rows = _serialize_rows(result.result_rows)

    return {
        'columns': columns,
        'types': types,
        'rows': rows,
        'row_count': len(rows),
        'elapsed_ms': elapsed_ms,
    }


async def execute_readonly_query(
    query: str,
    limit: int = 100,
    offset: int = 0,
) -> Dict[str, Any]:
    """
    Execute a validated read-only query.

    The query is validated before execution. LIMIT/OFFSET are applied
    if not already present in the query.
    """
    from app.db.clickhouse import get_clickhouse_client
    from app.core.config import get_settings

    settings = get_settings()
    max_rows = settings.clickhouse_query_max_rows
    limit = min(limit, max_rows)

    is_valid, error = validate_query(query)
    if not is_valid:
        raise ValueError(error)

    client = await get_clickhouse_client()

    # Apply LIMIT/OFFSET if the query doesn't already have them
    cleaned = query.strip().rstrip(';')
    upper_query = cleaned.upper()

    if 'LIMIT' not in upper_query:
        cleaned = f"{cleaned} LIMIT {limit} OFFSET {offset}"

    start = time.time()
    try:
        result = client.query(cleaned, settings={
            'max_execution_time': settings.clickhouse_query_timeout_seconds
        })
    except Exception as e:
        raise ValueError(f"Query execution failed: {str(e)}")

    elapsed_ms = round((time.time() - start) * 1000, 2)

    columns = list(result.column_names)
    types = [str(t) for t in result.column_types] if hasattr(result, 'column_types') else []
    rows = _serialize_rows(result.result_rows)

    return {
        'columns': columns,
        'types': types,
        'rows': rows,
        'row_count': len(rows),
        'elapsed_ms': elapsed_ms,
    }


def _serialize_rows(result_rows: list) -> list:
    """Convert ClickHouse result rows to JSON-serializable format."""
    serialized = []
    for row in result_rows:
        serialized_row = []
        for val in row:
            if isinstance(val, bytes):
                # Binary data: show truncated hex
                hex_str = val.hex()
                if len(hex_str) > 64:
                    serialized_row.append(f"0x{hex_str[:64]}... ({len(val)} bytes)")
                else:
                    serialized_row.append(f"0x{hex_str}")
            elif isinstance(val, (list, tuple)):
                serialized_row.append(str(val))
            elif hasattr(val, 'isoformat'):
                serialized_row.append(val.isoformat())
            else:
                serialized_row.append(val)
        serialized.append(serialized_row)
    return serialized
