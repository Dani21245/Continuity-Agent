import sqlite3
from typing import List, Optional
import os
from models import Transaction, PaymentMethod, TransactionStatus, Complexity

# Database file path - allows configuration via environment variable (useful for Docker volumes)
DB_PATH = os.getenv("SQLITE_DB_PATH", "continuity_agent.db")


def get_db_connection() -> sqlite3.Connection:
    """
    Establishes and returns a connection to the SQLite database.
    Enables row factory to access columns by name.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """
    Creates the transactions table if it does not already exist.
    """
    with get_db_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id TEXT PRIMARY KEY,
                merchant_id TEXT NOT NULL,
                item_description TEXT NOT NULL,
                amount_etb REAL NOT NULL,
                payment_method TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                status TEXT NOT NULL,
                complexity TEXT NOT NULL,
                ai_note TEXT
            )
        """)
        conn.commit()
    print(f"Database initialized at: {os.path.abspath(DB_PATH)}")


def insert_transaction(transaction: Transaction) -> None:
    """
    Inserts a validated transaction into the local database.
    """
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO transactions (
                id, merchant_id, item_description, amount_etb, 
                payment_method, timestamp, status, complexity, ai_note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                transaction.id,
                transaction.merchant_id,
                transaction.item_description,
                transaction.amount_etb,
                transaction.payment_method.value,
                transaction.timestamp,
                transaction.status.value,
                transaction.complexity.value,
                transaction.ai_note,
            ),
        )
        conn.commit()


def row_to_transaction(row: sqlite3.Row) -> Transaction:
    """
    Helper function to convert a sqlite3.Row object back into a Transaction Pydantic model.
    """
    return Transaction(
        id=row["id"],
        merchant_id=row["merchant_id"],
        item_description=row["item_description"],
        amount_etb=row["amount_etb"],
        payment_method=PaymentMethod(row["payment_method"]),
        timestamp=row["timestamp"],
        status=TransactionStatus(row["status"]),
        complexity=Complexity(row["complexity"]),
        ai_note=row["ai_note"],
    )


def get_pending_transactions() -> List[Transaction]:
    """
    Retrieves all transactions that are currently pending sync (status = 'pending_sync').
    """
    with get_db_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM transactions WHERE status = ? ORDER BY timestamp ASC",
            (TransactionStatus.PENDING_SYNC.value,),
        )
        rows = cursor.fetchall()
        return [row_to_transaction(row) for row in rows]


def update_transaction_status(
    transaction_id: str, 
    status: TransactionStatus, 
    complexity: Optional[Complexity] = None,
    ai_note: Optional[str] = None
) -> bool:
    """
    Updates the status, complexity (optional), and ai_note (optional) of a transaction.
    Returns True if update was successful (record existed), False otherwise.
    """
    query = "UPDATE transactions SET status = ?"
    params = [status.value]

    if complexity is not None:
        query += ", complexity = ?"
        params.append(complexity.value)

    if ai_note is not None:
        query += ", ai_note = ?"
        params.append(ai_note)

    query += " WHERE id = ?"
    params.append(transaction_id)

    with get_db_connection() as conn:
        cursor = conn.execute(query, tuple(params))
        conn.commit()
        return cursor.rowcount > 0


def get_all_transactions(status: Optional[TransactionStatus] = None) -> List[Transaction]:
    """
    Retrieves all transactions, with optional filtering by status.
    Used to populate dashboards and lists.
    """
    with get_db_connection() as conn:
        if status:
            cursor = conn.execute(
                "SELECT * FROM transactions WHERE status = ? ORDER BY timestamp DESC",
                (status.value,),
            )
        else:
            cursor = conn.execute("SELECT * FROM transactions ORDER BY timestamp DESC")
        
        rows = cursor.fetchall()
        return [row_to_transaction(row) for row in rows]


def get_metrics() -> dict:
    """
    Computes real cost-savings metrics from actual logged transaction data.

    Pricing reference (Fireworks AI, as of 2026):
      - Llama 3.1 8B  (simple):  ~10 tokens/call  @ $0.20 / 1M tokens = $0.000002 per call
      - Llama 3.1 70B (complex): ~60 tokens/call  @ $0.90 / 1M tokens = $0.000054 per call
      - Rule-based fallback:       0 tokens         = $0.000000 per call

    Cost saved = what it would have cost to route EVERY transaction through
    Llama 3.1 70B, minus what we actually spent via hybrid routing.
    """
    # Pricing constants
    PRICE_8B_PER_TOKEN  = 0.20 / 1_000_000   # $0.20 per 1M tokens
    PRICE_70B_PER_TOKEN = 0.90 / 1_000_000   # $0.90 per 1M tokens
    TOKENS_SIMPLE       = 10
    TOKENS_COMPLEX      = 60

    COST_SIMPLE  = TOKENS_SIMPLE  * PRICE_8B_PER_TOKEN   # $0.000002
    COST_COMPLEX = TOKENS_COMPLEX * PRICE_70B_PER_TOKEN  # $0.000054
    COST_FALLBACK = 0.0

    # What every transaction would cost if naively routed through 70B
    COST_NAIVE_ALL_70B = TOKENS_COMPLEX * PRICE_70B_PER_TOKEN  # $0.000054

    with get_db_connection() as conn:
        # Count by complexity
        cursor = conn.execute(
            """
            SELECT complexity, COUNT(*) as count, SUM(amount_etb) as total_etb
            FROM transactions
            GROUP BY complexity
            """
        )
        rows = cursor.fetchall()

        # Status breakdown
        status_cursor = conn.execute(
            "SELECT status, COUNT(*) as count FROM transactions GROUP BY status"
        )
        status_rows = status_cursor.fetchall()

        # Total count
        total_cursor = conn.execute("SELECT COUNT(*) as total FROM transactions")
        total = total_cursor.fetchone()["total"]

    # Build complexity breakdown
    complexity_counts = {"simple": 0, "complex": 0, "unknown": 0}
    complexity_etb    = {"simple": 0.0, "complex": 0.0, "unknown": 0.0}
    for row in rows:
        key = row["complexity"]
        if key in complexity_counts:
            complexity_counts[key] = row["count"]
            complexity_etb[key]    = round(row["total_etb"] or 0.0, 2)

    # Status breakdown
    status_breakdown = {}
    for row in status_rows:
        status_breakdown[row["status"]] = row["count"]

    # Cost calculations (only simple + complex are AI-routed; unknown = pending/fallback)
    actual_cost = (
        complexity_counts["simple"]  * COST_SIMPLE +
        complexity_counts["complex"] * COST_COMPLEX +
        complexity_counts["unknown"] * COST_FALLBACK
    )
    naive_cost  = total * COST_NAIVE_ALL_70B
    cost_saved  = naive_cost - actual_cost
    savings_pct = (cost_saved / naive_cost * 100) if naive_cost > 0 else 0.0

    # Token totals
    tokens_used = (
        complexity_counts["simple"]  * TOKENS_SIMPLE +
        complexity_counts["complex"] * TOKENS_COMPLEX
    )
    tokens_saved = total * TOKENS_COMPLEX - tokens_used

    return {
        "total_transactions": total,
        "by_complexity": {
            "simple":  {"count": complexity_counts["simple"],  "total_etb": complexity_etb["simple"]},
            "complex": {"count": complexity_counts["complex"], "total_etb": complexity_etb["complex"]},
            "unknown": {"count": complexity_counts["unknown"], "total_etb": complexity_etb["unknown"]},
        },
        "by_status": status_breakdown,
        "cost_analysis": {
            "actual_cost_usd":        round(actual_cost, 8),
            "naive_all_70b_cost_usd": round(naive_cost,  8),
            "cost_saved_usd":         round(cost_saved,  8),
            "savings_percentage":     round(savings_pct, 2),
            "tokens_used":            tokens_used,
            "tokens_saved":           tokens_saved,
        },
        "pricing_reference": {
            "llama_8b_per_1m_tokens_usd":  0.20,
            "llama_70b_per_1m_tokens_usd": 0.90,
            "tokens_per_simple_call":      TOKENS_SIMPLE,
            "tokens_per_complex_call":     TOKENS_COMPLEX,
        }
    }
