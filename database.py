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
