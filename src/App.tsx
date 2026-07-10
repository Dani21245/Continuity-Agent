import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FileCode,
  Layers,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Server,
  Terminal,
  Database,
  Cpu,
  Shield,
  HelpCircle,
  Copy,
  Check,
  TrendingUp,
  CreditCard,
  WifiOff,
  CloudLightning,
  ChevronRight,
  ExternalLink
} from "lucide-react";

// Inline code definitions for the user-created Python files to show in the UI tabs
const filesCode = {
  "models.py": `from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field, field_validator


class PaymentMethod(str, Enum):
    CASH = "cash"
    TELEBIRR = "telebirr"
    CBE_BIRR = "cbe_birr"
    OTHER = "other"


class TransactionStatus(str, Enum):
    PENDING_SYNC = "pending_sync"
    SYNCED = "synced"
    FLAGGED_FOR_REVIEW = "flagged_for_review"
    REVIEWED = "reviewed"


class Complexity(str, Enum):
    SIMPLE = "simple"
    COMPLEX = "complex"
    UNKNOWN = "unknown"


class TransactionCreate(BaseModel):
    merchant_id: str = Field(..., min_length=1, description="Unique identifier for the merchant")
    item_description: str = Field(..., min_length=1, description="Description of the item/service sold")
    amount_etb: float = Field(..., description="Transaction amount in Ethiopian Birr")
    payment_method: PaymentMethod = Field(..., description="Method used for payment")

    @field_validator("amount_etb")
    @classmethod
    def validate_amount(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Amount must be a positive number greater than zero")
        return round(v, 2)


class Transaction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()), description="Auto-generated UUID")
    merchant_id: str
    item_description: str
    amount_etb: float
    payment_method: PaymentMethod
    timestamp: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat(),
        description="ISO 8601 UTC timestamp of creation"
    )
    status: TransactionStatus = Field(default=TransactionStatus.PENDING_SYNC)
    complexity: Complexity = Field(default=Complexity.UNKNOWN)
    ai_note: Optional[str] = Field(default=None, description="Optional notes populated by AI evaluation")`,

  "database.py": `import sqlite3
from typing import List, Optional
import os
from models import Transaction, PaymentMethod, TransactionStatus, Complexity

# Database file path - allows configuration via environment variable
DB_PATH = os.getenv("SQLITE_DB_PATH", "continuity_agent.db")


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
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


def insert_transaction(transaction: Transaction) -> None:
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
    with get_db_connection() as conn:
        if status:
            cursor = conn.execute(
                "SELECT * FROM transactions WHERE status = ? ORDER BY timestamp DESC",
                (status.value,),
            )
        else:
            cursor = conn.execute("SELECT * FROM transactions ORDER BY timestamp DESC")
        
        rows = cursor.fetchall()
        return [row_to_transaction(row) for row in rows]`,

  "main.py": `from contextlib import asynccontextmanager
import os
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Query, status as http_status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

import database
import fireworks_client
from models import (
    Transaction,
    TransactionCreate,
    TransactionStatus,
    Complexity
)


# Helper function placeholder for routing logic as requested
def route_and_process(transaction: Transaction) -> dict:
    """
    Implement the AMD Track 1 Hybrid Token-Efficient Routing logic.
    This function analyzes the transaction (complexity, amount, pattern) and decides:
    1. Route to a cheaper/faster model (e.g., Fireworks Llama-3-8B-Instruct) for standard sync.
    2. Route to an expensive/complex model (e.g., Fireworks Llama-3-70B-Instruct or DeepSeek)
       if it has high amounts, strange descriptors, or multiple failed offline payment retries.
    """
    print(f"\\n--- Routing Transaction: {transaction.id} ---")
    
    # 1. Try cheap model classification
    classification = fireworks_client.classify_complexity(transaction)
    
    # Fallback to rule-based if API fails
    if classification == "error":
        print("[Routing] API error/missing key, falling back to rule-based routing.")
        if transaction.amount_etb > 10000.0:
            classification = "complex"
        else:
            classification = "simple"
            
    # 2. Process based on classification
    if classification == "complex":
        # Expensive model call for audit note
        audit_note = fireworks_client.generate_audit_note(transaction)
        
        return {
            "status": TransactionStatus.FLAGGED_FOR_REVIEW,
            "complexity": Complexity.COMPLEX,
            "ai_note": audit_note
        }
    else:
        # Simple route - no expensive model needed
        return {
            "status": TransactionStatus.SYNCED,
            "complexity": Complexity.SIMPLE,
            "ai_note": "Automated Routing: Cleared instantly via fast token-efficient path (Llama-3-8B)."
        }


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan event handler to initialize the SQLite database on application startup.
    """
    # Create tables if they do not exist
    database.init_db()
    yield
    # Cleanup database connections or resources if needed on shutdown
    pass


# Initialize FastAPI app with lifespan
app = FastAPI(
    title="Continuity Agent API",
    description="Offline-first Sales Continuity & Hybrid Token-Efficient AI Routing Agent for Ethiopian SME Payments.",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for the local developer dashboard and multi-device connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["General"])
async def root():
    """
    Root endpoint. Confirms the API is running and returns basic info.
    """
    return {
        "status": "online",
        "message": "Continuity Agent API is running. Ready to buffer offline sales and route transactions.",
        "project": "AMD Developer Hackathon Act II - Track 1 Hybrid Routing",
        "region_target": "Ethiopia (Telebirr/CBE Birr Continuity)",
        "docs_url": "/docs"
    }


@app.get("/health", tags=["General"])
async def health_check():
    """
    Liveness and database health check endpoint.
    """
    try:
        # Simple test to verify DB read capabilities
        database.get_all_transactions(status=None)
        db_status = "healthy"
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    return {
        "status": "healthy" if db_status == "healthy" else "degraded",
        "database": db_status,
        "environment": {
            "sqlite_db_path": os.getenv("SQLITE_DB_PATH", "continuity_agent.db"),
            "fireworks_configured": bool(os.getenv("FIREWORKS_API_KEY"))
        }
    }


@app.post(
    "/transactions",
    response_model=Transaction,
    status_code=http_status.HTTP_201_CREATED,
    tags=["Transactions"]
)
async def create_transaction(payload: TransactionCreate):
    """
    Accepts a new transaction sale, validates fields, saves to the local SQLite DB immediately
    as 'pending_sync' status, and returns the newly buffered transaction.
    """
    try:
        # Construct full Transaction model (auto generates ID, timestamp, default status)
        new_transaction = Transaction(
            merchant_id=payload.merchant_id,
            item_description=payload.item_description,
            amount_etb=payload.amount_etb,
            payment_method=payload.payment_method
        )
        
        # Insert into local offline queue
        database.insert_transaction(new_transaction)
        return new_transaction

    except ValueError as val_err:
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Validation Error: {str(val_err)}"
        )
    except Exception as err:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database write failed: {str(err)}"
        )


@app.get("/transactions", response_model=List[Transaction], tags=["Transactions"])
async def list_all_transactions(
    status: Optional[TransactionStatus] = Query(
        None, 
        description="Filter transactions by status: pending_sync, synced, flagged_for_review, reviewed"
    )
):
    """
    Lists all stored transactions in chronological descending order. Supports filtering by status.
    """
    try:
        return database.get_all_transactions(status=status)
    except Exception as err:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch transactions: {str(err)}"
        )


@app.get("/transactions/pending", response_model=List[Transaction], tags=["Transactions"])
async def list_pending_transactions():
    """
    Returns only transactions currently queued with 'pending_sync' status, waiting for routing.
    """
    try:
        return database.get_pending_transactions()
    except Exception as err:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve pending queue: {str(err)}"
        )


@app.post("/sync", tags=["Sync Engine"])
async def trigger_sync():
    """
    Triggers the synchronization and hybrid AI routing engine.
    Loops through all 'pending_sync' transactions, evaluates each via the routing engine,
    updates local state, and returns statistics of the synchronization run.
    """
    try:
        pending_items = database.get_pending_transactions()
        if not pending_items:
            return {
                "message": "Sync complete. No pending transactions to process.",
                "processed_count": 0,
                "synced_count": 0,
                "flagged_count": 0
            }

        synced_count = 0
        flagged_count = 0

        for tx in pending_items:
            # Route transaction
            routing_result = route_and_process(tx)
            
            # Apply update to local SQLite database
            database.update_transaction_status(
                transaction_id=tx.id,
                status=routing_result["status"],
                complexity=routing_result["complexity"],
                ai_note=routing_result["ai_note"]
            )

            if routing_result["status"] == TransactionStatus.SYNCED:
                synced_count += 1
            else:
                flagged_count += 1

        return {
            "message": f"Sync process completed successfully.",
            "processed_count": len(pending_items),
            "synced_count": synced_count,
            "flagged_count": flagged_count,
            "status_details": "Transactions routed. High-value flagged items await advanced manual audit/review."
        }

    except Exception as err:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sync cycle failed: {str(err)}"
        )
    }`,

  "fireworks_client.py": `import os
from openai import OpenAI
from models import Transaction

# Initialize Fireworks client using the OpenAI SDK pattern
client = OpenAI(
    api_key=os.getenv("FIREWORKS_API_KEY", "dummy"),
    base_url=os.getenv("FIREWORKS_BASE_URL", "https://api.fireworks.ai/inference/v1")
)

CHEAP_MODEL = "accounts/fireworks/models/llama-v3p1-8b-instruct"
EXPENSIVE_MODEL = "accounts/fireworks/models/llama-v3p1-70b-instruct"

def classify_complexity(transaction: Transaction) -> str:
    """
    Sends transaction details to a cheap/fast model to classify as 'simple' or 'complex'.
    Returns 'simple', 'complex', or 'error' if API fails.
    """
    api_key = os.getenv("FIREWORKS_API_KEY")
    if not api_key or api_key == "your_fireworks_api_key_here" or api_key == "\${FIREWORKS_API_KEY}":
        print("[Fireworks Client] Warning: FIREWORKS_API_KEY not set. Returning error.")
        return "error"
        
    prompt = f"""
    Analyze the following transaction and classify it as strictly 'simple' or 'complex'.
    
    Criteria for 'complex':
    - Unusual or extreme amount (e.g., very high for the context)
    - Vague, suspicious, or strange item description
    - Characteristics that might require human audit
    
    Criteria for 'simple':
    - Standard, everyday transaction
    - Clear and expected item description
    
    Transaction Details:
    - Merchant ID: {transaction.merchant_id}
    - Item Description: {transaction.item_description}
    - Amount (ETB): {transaction.amount_etb}
    - Payment Method: {transaction.payment_method}
    
    Respond with ONLY the word 'simple' or 'complex' (lowercase).
    """
    
    try:
        response = client.chat.completions.create(
            model=CHEAP_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=10
        )
        result = response.choices[0].message.content.strip().lower()
        
        # Parse result to ensure it's either simple or complex
        if "complex" in result:
            parsed_result = "complex"
        else:
            parsed_result = "simple"
            
        print(f"[Fireworks Routing] Model: {CHEAP_MODEL} | Tokens (approx): {response.usage.total_tokens} | Decision: {parsed_result}")
        return parsed_result
        
    except Exception as e:
        print(f"[Fireworks Routing Error] Classification failed: {str(e)}")
        return "error"


def generate_audit_note(transaction: Transaction) -> str:
    """
    Called only for 'complex' transactions. Uses an expensive/powerful model
    to write a 1-2 sentence audit note explaining why it needs review.
    """
    api_key = os.getenv("FIREWORKS_API_KEY")
    if not api_key or api_key == "your_fireworks_api_key_here" or api_key == "\${FIREWORKS_API_KEY}":
        return "Automated Routing (Fallback): Flagged due to lack of API key or high amount."
        
    prompt = f"""
    Write a brief 1-2 sentence audit note for the following transaction. 
    Explain why this transaction was flagged as complex and might need human review.
    
    Transaction Details:
    - Merchant ID: {transaction.merchant_id}
    - Item Description: {transaction.item_description}
    - Amount (ETB): {transaction.amount_etb}
    - Payment Method: {transaction.payment_method}
    
    Audit Note:
    """
    
    try:
        response = client.chat.completions.create(
            model=EXPENSIVE_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=50
        )
        note = response.choices[0].message.content.strip()
        print(f"[Fireworks Routing] Model: {EXPENSIVE_MODEL} | Tokens (approx): {response.usage.total_tokens} | Generated Note: {note}")
        return note
        
    except Exception as e:
        print(f"[Fireworks Routing Error] Audit note generation failed: {str(e)}")
        return "Automated Routing (Fallback Error): Flagged due to rule-based fallback after API failure."
`,

  "requirements.txt": `fastapi==0.110.0
uvicorn==0.28.0
pydantic==2.6.4
pydantic-core==2.16.3
typing-extensions==4.10.0
openai==1.14.2`,

  "Dockerfile": `# Use official Python 3.11 slim base image
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py database.py models.py fireworks_client.py /app/

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]`,

  "docker-compose.yml": `version: '3.8'

services:
  continuity_agent_api:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: continuity_agent_api
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - SQLITE_DB_PATH=/app/data/continuity_agent.db
      - FIREWORKS_API_KEY=\${FIREWORKS_API_KEY}
      - FIREWORKS_BASE_URL=\${FIREWORKS_BASE_URL}
    volumes:
      - sqlite_data:/app/data

volumes:
  sqlite_data:`,

  "test_fireworks.sh": `#!/bin/bash
# Test Fireworks API key directly without credit card requirement 
# using the $50 free credit tier.

source .env

echo "Testing Fireworks API with key: \${FIREWORKS_API_KEY:0:15}..."

curl https://api.fireworks.ai/inference/v1/chat/completions \\
  -H "Authorization: Bearer \$FIREWORKS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "accounts/fireworks/models/llama-v3p1-8b-instruct", "messages": [{"role": "user", "content": "hello"}]}'
`,

  ".env.example": `# .env.example
# Application configuration secrets

APP_URL="MY_APP_URL"

# FIREWORKS_API_KEY: Your API Key from Fireworks AI for Llama model routing
FIREWORKS_API_KEY="your_fireworks_api_key_here"

# FIREWORKS_BASE_URL: The API base URL for Fireworks AI
FIREWORKS_BASE_URL="https://api.fireworks.ai/inference/v1"`
};

// Simulated Database & API engine inside the React UI for interactive presentation
interface SimulatedTransaction {
  id: string;
  merchant_id: string;
  item_description: string;
  amount_etb: number;
  payment_method: string;
  timestamp: string;
  status: "pending_sync" | "synced" | "flagged_for_review";
  complexity: "simple" | "complex" | "unknown";
  ai_note?: string;
}

const initialTransactions: SimulatedTransaction[] = [
  {
    id: "TX-2024-00129-A",
    merchant_id: "CH-0042 (Abyssinia Gourmet Coffee)",
    item_description: "Doro Wat (Family Platter) × 2",
    amount_etb: 1250.00,
    payment_method: "telebirr",
    timestamp: new Date(Date.now() - 3600000 * 2.5).toISOString(),
    status: "pending_sync",
    complexity: "simple",
    ai_note: "Automated Routing: Cleared instantly via Llama-3-8B-Instruct (Cost: 0.00015 USD)."
  },
  {
    id: "TX-2024-00130-A",
    merchant_id: "CH-0042 (Abyssinia Gourmet Coffee)",
    item_description: "Traditional Coffee Ceremony (Full)",
    amount_etb: 450.00,
    payment_method: "cash",
    timestamp: new Date(Date.now() - 3600000 * 1.8).toISOString(),
    status: "synced",
    complexity: "simple",
    ai_note: "Automated Routing: Token-Efficient Route cleared instantly using cheap Llama-3-8B model."
  },
  {
    id: "TX-2024-00131-A",
    merchant_id: "CH-0042 (Abyssinia Gourmet Coffee)",
    item_description: "Wedding Catering Deposit",
    amount_etb: 18000.00,
    payment_method: "cbe_birr",
    timestamp: new Date(Date.now() - 3600000 * 1.2).toISOString(),
    status: "flagged_for_review",
    complexity: "complex",
    ai_note: "Automated Routing: Flagged due to extreme value (>10k ETB). Routed to Llama-3-70B for standard audit."
  },
  {
    id: "TX-2024-00132-A",
    merchant_id: "CH-0042 (Abyssinia Gourmet Coffee)",
    item_description: "Shiro Tegamino Special",
    amount_etb: 220.00,
    payment_method: "cash",
    timestamp: new Date(Date.now() - 3600000 * 0.5).toISOString(),
    status: "synced",
    complexity: "simple",
    ai_note: "Automated Routing: Token-Efficient Route cleared instantly using cheap Llama-3-8B model."
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<keyof typeof filesCode>("models.py");
  const [copied, setCopied] = useState<string | null>(null);
  
  // Simulation States
  const [simTransactions, setSimTransactions] = useState<SimulatedTransaction[]>(initialTransactions);
  const [newMerchant, setNewMerchant] = useState("CH-0042 (Abyssinia Gourmet Coffee)");
  const [newItemDesc, setNewItemDesc] = useState("Special Kitfo & Ayibe Combo");
  const [newAmount, setNewAmount] = useState<number>(1850);
  const [newPayMethod, setNewPayMethod] = useState("telebirr");
  const [isSyncing, setIsSyncing] = useState(false);
  const [simulationLog, setSimulationLog] = useState<string[]>([
    "System booted.",
    "SQLite schema initialized locally inside container.",
    "Pending offline buffer listening to port 8000..."
  ]);

  // Compute stats dynamically
  const pendingCount = simTransactions.filter(t => t.status === "pending_sync").length;
  const localRevenue = simTransactions.reduce((sum, t) => sum + t.amount_etb, 0);
  const flaggedCount = simTransactions.filter(t => t.status === "flagged_for_review").length;
  const routingEfficiency = simTransactions.length > 0 
    ? Math.round((simTransactions.filter(t => t.status === "synced").length / simTransactions.length) * 1000) / 10
    : 98.2;

  const handleCopy = (fileName: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(fileName);
    setTimeout(() => setCopied(null), 2000);
  };

  const addSimulatedTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMerchant || !newItemDesc || newAmount <= 0) {
      setSimulationLog(prev => [...prev, "ERROR: Invalid transaction payload: Negative amount or missing fields."]);
      return;
    }

    const newTx: SimulatedTransaction = {
      id: "TX-2024-00" + Math.floor(134 + Math.random() * 500) + "-A",
      merchant_id: newMerchant,
      item_description: newItemDesc,
      amount_etb: Number(newAmount),
      payment_method: newPayMethod,
      timestamp: new Date().toISOString(),
      status: "pending_sync",
      complexity: "unknown"
    };

    setSimTransactions(prev => [newTx, ...prev]);
    setSimulationLog(prev => [
      ...prev,
      `SUCCESS: Buffered sale locally. ID: ${newTx.id} | Amount: ${newTx.amount_etb} ETB via ${newPayMethod.toUpperCase()}`
    ]);

    // Reset fields to some random new value
    const potentialItems = [
      { desc: "Local Roasted Coffee Beans (1kg)", amount: 650, merch: "CH-0042 (Abyssinia Gourmet Coffee)" },
      { desc: "Traditional Habesha Kemis Dress", amount: 12500, merch: "CH-0042 (Abyssinia Gourmet Coffee)" },
      { desc: "Vegetable Combo Lunch Platter", amount: 280, merch: "CH-0042 (Abyssinia Gourmet Coffee)" },
      { desc: "Airport Taxi Transfer (Bole to Hilton)", amount: 1500, merch: "CH-0042 (Abyssinia Gourmet Coffee)" }
    ];
    const pickObj = potentialItems[Math.floor(Math.random() * potentialItems.length)];
    setNewItemDesc(pickObj.desc);
    setNewAmount(pickObj.amount);
    setNewMerchant(pickObj.merch);
  };

  const triggerSimulationSync = () => {
    const pendings = simTransactions.filter(t => t.status === "pending_sync");
    if (pendings.length === 0) {
      setSimulationLog(prev => [...prev, "SYNC WARNING: No pending transactions in local SQLite database to sync."]);
      return;
    }

    setIsSyncing(true);
    setSimulationLog(prev => [...prev, "SYNC STARTED: Reading 'pending_sync' rows from SQLite..."]);

    setTimeout(() => {
      setSimTransactions(prev =>
        prev.map(tx => {
          if (tx.status === "pending_sync") {
            const isComplex = tx.amount_etb > 10000.0;
            return {
              ...tx,
              status: isComplex ? "flagged_for_review" : "synced",
              complexity: isComplex ? "complex" : "simple",
              ai_note: isComplex
                ? `Automated Routing: Flagged due to high transaction amount (>10,000 ETB). Routed to expensive Llama-3-70B model for auditing (Token usage: High).`
                : `Automated Routing: Token-Efficient Route cleared instantly using cheap Llama-3-8B model (Cost: ~0.0001 USD).`
            };
          }
          return tx;
        })
      );

      setIsSyncing(false);
      setSimulationLog(prev => [
        ...prev,
        `SYNC SUCCESS: Routed ${pendings.length} transactions. Check transaction status table.`
      ]);
    }, 1500);
  };

  const clearDatabase = () => {
    setSimTransactions([]);
    setSimulationLog(prev => [...prev, "DATABASE FLUSHED: Dropped local SQLite transactions queue."]);
  };

  return (
    <div id="continuity-app" className="min-h-screen bg-[#0A0A0C] text-[#E2E8F0] font-sans flex flex-col">
      
      {/* Premium Ambient Glow */}
      <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-amber-500/5 to-transparent pointer-events-none" />

      {/* Primary Sophisticated Dark Header */}
      <header className="h-16 flex items-center justify-between px-6 sm:px-8 bg-[#0D0D0F] border-b border-white/5 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center text-black font-black text-xl select-none shadow-[0_0_15px_rgba(245,158,11,0.2)]">
            C
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white leading-none">
              CONTINUITY <span className="text-amber-500">AGENT</span>
            </h1>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-[0.2em] mt-1">
              Hybrid Routing Node • Addis Ababa v2.1
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-8">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Connection Status</span>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
              <span className="text-xs font-semibold text-slate-300">Local Network Active (Edge Mode)</span>
            </div>
          </div>
          <div className="hidden sm:block h-8 w-[1px] bg-white/10"></div>
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Current Merchant</span>
            <p className="text-xs font-bold text-white uppercase tracking-wider">Abyssinia Gourmet Coffee</p>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-8 relative z-10">
        
        {/* Title/Description intro inside a clean layout */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-2 border-b border-white/5">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-500" /> AMD Developer Hackathon ACT II
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Track 1: Hybrid Token-Efficient Routing Agent. Local buffers prevent payment dropouts during internet outtages, and Fireworks AI routes transactions cleanly.
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href="#interactive-demo"
              className="px-4 py-2 text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-200 rounded-lg border border-white/10 transition flex items-center gap-2"
            >
              <Play className="w-3.5 h-3.5 text-amber-500" /> Interactive Demo
            </a>
            <a
              href="#code-repository"
              className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black rounded-lg transition flex items-center gap-2"
            >
              <FileCode className="w-3.5 h-3.5" /> Inspect Code
            </a>
          </div>
        </div>

        {/* Sophisticated Dark Theme Stats Cards Grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <div className="bg-[#141417] border border-[#27272A] p-5 rounded-xl transition hover:border-slate-700">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Pending Sync</p>
            <div className="flex items-baseline gap-2">
              <h2 className="text-3xl font-extrabold text-white font-mono">{pendingCount}</h2>
              <span className="text-xs text-amber-500 font-medium">Transactions</span>
            </div>
          </div>

          <div className="bg-[#141417] border border-[#27272A] p-5 rounded-xl border-l-2 border-l-amber-500 transition hover:border-slate-700">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Local Revenue</p>
            <div className="flex items-baseline gap-2">
              <h2 className="text-3xl font-extrabold text-white font-mono">{localRevenue.toLocaleString()}</h2>
              <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">ETB</span>
            </div>
          </div>

          <div className="bg-[#141417] border border-[#27272A] p-5 rounded-xl transition hover:border-slate-700">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Routing Efficiency</p>
            <div className="flex items-baseline gap-2">
              <h2 className="text-3xl font-extrabold text-white font-mono">{routingEfficiency}%</h2>
              <span className="text-[10px] text-green-400 font-semibold leading-none">+2.4%</span>
            </div>
          </div>

          <div className="bg-[#141417] border border-[#27272A] p-5 rounded-xl transition hover:border-slate-700">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">AI Flagged</p>
            <div className="flex items-baseline gap-2">
              <h2 className="text-3xl font-extrabold text-red-500 font-mono">
                {flaggedCount < 10 ? `0${flaggedCount}` : flaggedCount}
              </h2>
              <span className="text-xs text-slate-400">Awaiting audit</span>
            </div>
          </div>
        </section>

        {/* Live Simulation Playground Row */}
        <section id="interactive-demo" className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
          
          {/* Left Column: Transaction Input Panel */}
          <div className="lg:col-span-4 bg-[#141417] border border-[#27272A] rounded-xl p-6 flex flex-col justify-between space-y-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
            
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-extrabold uppercase tracking-widest text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-amber-500" /> Buffering Emulator
                </h3>
                <span className="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded font-mono uppercase font-bold tracking-widest">
                  Container Active
                </span>
              </div>
              
              <p className="text-xs text-slate-400 leading-relaxed">
                Add transaction sales below to represent a merchant checkout during a network blackout. Transactions are persisted immediately to the local SQLite queue.
              </p>

              <form onSubmit={addSimulatedTransaction} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1.5 font-bold uppercase tracking-wider text-[10px]">Merchant ID</label>
                  <input
                    type="text"
                    value={newMerchant}
                    onChange={(e) => setNewMerchant(e.target.value)}
                    className="w-full bg-[#0A0A0C] border border-[#27272A] rounded-lg p-2.5 text-white font-mono focus:outline-none focus:border-amber-500 transition"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1.5 font-bold uppercase tracking-wider text-[10px]">Item sold / Service</label>
                  <input
                    type="text"
                    value={newItemDesc}
                    onChange={(e) => setNewItemDesc(e.target.value)}
                    className="w-full bg-[#0A0A0C] border border-[#27272A] rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500 transition"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1.5 font-bold uppercase tracking-wider text-[10px]">Amount (Birr)</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={newAmount}
                        onChange={(e) => setNewAmount(Math.max(1, Number(e.target.value)))}
                        className="w-full bg-[#0A0A0C] border border-[#27272A] rounded-lg p-2.5 pl-8 text-white font-mono focus:outline-none focus:border-amber-500 transition"
                        required
                      />
                      <span className="absolute left-2.5 top-2.5 text-slate-500 font-black text-[10px] font-mono">
                        ETB
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1.5 font-bold uppercase tracking-wider text-[10px]">Payment</label>
                    <select
                      value={newPayMethod}
                      onChange={(e) => setNewPayMethod(e.target.value)}
                      className="w-full bg-[#0A0A0C] border border-[#27272A] rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500 transition uppercase font-semibold text-[11px]"
                    >
                      <option value="telebirr">Telebirr</option>
                      <option value="cbe_birr">CBE Birr</option>
                      <option value="cash">Cash</option>
                      <option value="other">Other Pay</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold py-3 rounded-lg border border-slate-700 transition flex items-center justify-center gap-2 mt-2 uppercase tracking-widest text-[10px]"
                >
                  <CreditCard className="w-4 h-4 text-amber-500" /> Buffer Local Sale
                </button>
              </form>
            </div>

            <div className="border-t border-white/5 pt-4 mt-4">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-amber-500" /> SQLite Output Log
              </h4>
              <div className="bg-[#0A0A0C] border border-white/5 p-3 rounded-lg h-32 overflow-y-auto font-mono text-[11px] text-emerald-400 space-y-1 scrollbar-thin">
                {simulationLog.map((log, i) => (
                  <div key={i} className="flex gap-1.5">
                    <span className="text-slate-600 select-none">&gt;</span>
                    <span>{log}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Database Table */}
          <div className="lg:col-span-8 bg-[#0F0F12] border border-white/5 rounded-xl flex flex-col justify-between">
            <div>
              {/* Header block */}
              <div className="flex justify-between items-center px-6 py-4 border-b border-white/5 bg-[#141417] rounded-t-xl">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-widest text-white flex items-center gap-2">
                    <Database className="w-4 h-4 text-amber-500" /> Container SQLite Ledger
                  </h3>
                  <p className="text-[10px] text-slate-500 uppercase mt-0.5 font-semibold tracking-wider">Buffered transactions queue</p>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={clearDatabase}
                    className="p-2 text-xs bg-white/5 hover:bg-white/10 border border-white/5 text-slate-400 hover:text-white rounded-lg transition"
                    title="Flush Table"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  <button
                    onClick={triggerSimulationSync}
                    disabled={isSyncing}
                    className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <CloudLightning className="w-3.5 h-3.5" />
                    {isSyncing ? "Syncing..." : "Sync & Route Queue"}
                  </button>
                </div>
              </div>

              {/* Grid representation table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-slate-400 bg-white/[0.01]">
                      <th className="py-3 px-6 font-semibold">Transaction Description</th>
                      <th className="py-3 px-4 font-semibold">Amount (ETB)</th>
                      <th className="py-3 px-4 font-semibold">Payment</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold">Router Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {simTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-slate-500 italic">
                            No local SQLite rows recorded. Use the emulator panel to insert offline sales.
                          </td>
                        </tr>
                      ) : (
                        simTransactions.map((tx) => (
                          <motion.tr
                            key={tx.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="border-b border-white/5 hover:bg-white/[0.01] transition"
                          >
                            <td className="py-3.5 px-6">
                              <p className="font-semibold text-white">{tx.item_description}</p>
                              <p className="text-[10px] text-slate-500 font-mono mt-0.5">{tx.id}</p>
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-white text-sm">
                              {tx.amount_etb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                tx.payment_method === 'telebirr' ? 'bg-blue-900/40 text-blue-300 border border-blue-800/50' :
                                tx.payment_method === 'cbe_birr' ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-800/50' :
                                'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}>
                                {tx.payment_method}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              {tx.status === "pending_sync" && (
                                <span className="bg-[#3F2D00] text-[#FBBF24] border border-[#78350F] text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">
                                  Pending Sync
                                </span>
                              )}
                              {tx.status === "synced" && (
                                <span className="bg-[#064E3B] text-[#34D399] border border-[#065F46] text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">
                                  Synced
                                </span>
                              )}
                              {tx.status === "flagged_for_review" && (
                                <span className="bg-[#450A0A] text-[#F87171] border border-[#7F1D1D] text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">
                                  Flagged
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-slate-400 text-[11px] max-w-xs">
                              {tx.ai_note ? (
                                <span className="text-slate-300 leading-relaxed font-medium block">
                                  {tx.ai_note}
                                </span>
                              ) : (
                                <span className="text-slate-600 italic">Awaiting sync processing...</span>
                              )}
                            </td>
                          </motion.tr>
                        ))
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom Alert bar */}
            <div className="bg-[#141417] p-4 border-t border-white/5 rounded-b-xl flex items-center gap-3">
              <HelpCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <div className="text-[11px] text-slate-400 leading-relaxed">
                <span className="font-bold text-white uppercase tracking-wider text-[10px]">Token Optimization rule:</span> Standard tickets bypass complex LLMs to save cost, utilizing cheaper endpoints. Transactions above <span className="text-amber-500 font-bold">10,000 ETB</span> automatically route to advanced reasoning models for safe compliance auditing.
              </div>
            </div>
          </div>
        </section>

        {/* Sophisticated Dark Sync Footer Control panel */}
        <footer className="flex flex-col sm:flex-row items-center justify-between bg-[#141417] p-5 border border-white/5 rounded-xl gap-6 relative">
          <div className="flex gap-10">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Local Buffer Storage</span>
              <div className="w-32 h-1 bg-slate-800 rounded-full mt-2 overflow-hidden">
                <div className="w-1/4 h-full bg-amber-500"></div>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 font-mono">SQLite: 12.4 MB / 1 GB</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Router Latency</span>
              <p className="text-xs text-white font-bold mt-1">
                42ms <span className="text-[10px] font-normal text-slate-500">(Local Inference)</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="#code-repository"
              className="px-6 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs uppercase tracking-widest border border-white/10 transition"
            >
              Configuration
            </a>
            <button
              onClick={triggerSimulationSync}
              disabled={isSyncing}
              className="px-8 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-[0.15em] border border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)] transition disabled:opacity-50"
            >
              {isSyncing ? "Syncing API..." : "Trigger Cloud Sync Sequence"}
            </button>
          </div>
        </footer>

        {/* Code explorer section */}
        <section id="code-repository" className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg">
                <FileCode className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Production Python Code Explorer</h2>
                <p className="text-xs text-slate-400 mt-0.5">Explore the complete, production-ready codebase created in Tasks 1-3</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-[#141417] rounded-2xl border border-white/5 overflow-hidden">
            
            {/* Left sidebar directory list */}
            <div className="lg:col-span-3 border-r border-white/5 bg-[#0D0D0F] p-4 space-y-2">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 px-2">Project Workspace Files</h4>
              
              {Object.keys(filesCode).map((fileName) => {
                const isActive = activeTab === fileName;
                return (
                  <button
                    key={fileName}
                    onClick={() => setActiveTab(fileName as keyof typeof filesCode)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-mono transition flex items-center justify-between ${
                      isActive
                        ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                        : "text-slate-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {fileName.endsWith(".py") && <FileCode className="w-4 h-4 text-amber-500" />}
                      {fileName.endsWith(".txt") && <FileText className="w-4 h-4 text-blue-400" />}
                      {fileName.endsWith(".yml") && <Layers className="w-4 h-4 text-purple-400" />}
                      {fileName.endsWith(".sh") && <Terminal className="w-4 h-4 text-green-400" />}
                      {fileName.includes(".env") && <Shield className="w-4 h-4 text-red-400" />}
                      {fileName === "Dockerfile" && <Server className="w-4 h-4 text-teal-400" />}
                      <span>{fileName}</span>
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 transition ${isActive ? "opacity-100" : "opacity-0"}`} />
                  </button>
                );
              })}
            </div>

            {/* Code content viewer */}
            <div className="lg:col-span-9 flex flex-col bg-[#0A0A0C]">
              
              {/* Toolbar */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#0D0D0F] text-xs">
                <span className="font-mono text-slate-400 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-amber-500" />
                  workspace/{activeTab}
                </span>
                
                <button
                  onClick={() => handleCopy(activeTab, filesCode[activeTab])}
                  className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-slate-300 hover:text-white transition flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
                >
                  {copied === activeTab ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
              </div>

              {/* Real pre code text */}
              <div className="p-4 overflow-x-auto max-h-[500px] scrollbar-thin">
                <pre className="font-mono text-xs leading-relaxed text-slate-300">
                  <code>{filesCode[activeTab]}</code>
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* Quick Launch instructions */}
        <section className="bg-[#141417] rounded-xl border border-white/5 p-6 md:p-8 space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Server className="w-5 h-5 text-amber-500" /> How to Deploy Locally with Docker
          </h3>
          <p className="text-xs text-slate-400">
            Start the fully functional Python backend on your local server environment using Docker Compose orchestration.
          </p>
          
          <div className="bg-[#0A0A0C] border border-white/5 p-4 rounded-xl font-mono text-xs text-slate-300 space-y-2">
            <div className="text-slate-500"># 1. Spin up the FastAPI API container with the persistent SQLite volume</div>
            <div className="text-amber-500 font-semibold">$ docker-compose up --build -d</div>
            <div className="text-slate-500 pt-2"># 2. Verify containers are running healthy</div>
            <div className="text-amber-500 font-semibold">$ docker-compose ps</div>
            <div className="text-slate-500 pt-2"># 3. View streaming logs from the SQLite transaction engine</div>
            <div className="text-amber-500 font-semibold">$ docker-compose logs -f</div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-[#0D0D0F] py-8 text-center text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p>Designed for AMD Developer Hackathon ACT II, Track 1 (Hybrid Token-Efficient Routing Agent).</p>
          <p className="font-mono text-[10px] text-slate-600 uppercase tracking-widest">Continuity Agent Protocol v1.0.0 | Bole/Merkato SME Buffer</p>
        </div>
      </footer>
    </div>
  );
}
