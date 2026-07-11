from contextlib import asynccontextmanager
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
    print(f"\n--- Routing Transaction: {transaction.id} ---")
    
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


@app.get("/metrics", tags=["Analytics"])
async def get_metrics():
    """
    Returns illustrative cost-savings metrics computed from actual logged transaction data.

    Token assumptions per call (not measured — illustrative estimates based on
    typical prompt/completion lengths for this workload):
      - Llama 3.1 8B  (simple transactions):  ~160 tokens per call
      - Llama 3.1 70B (complex transactions): ~260 tokens per call

    Pricing reference: Fireworks AI published rates as of 2026:
      - Llama 3.1 8B:  $0.20 per 1,000,000 tokens
      - Llama 3.1 70B: $0.90 per 1,000,000 tokens

    IMPORTANT: These are illustrative estimates based on published pricing and assumed
    token counts, not measured production token usage. Actual costs may vary depending
    on prompt length, response verbosity, and live Fireworks AI pricing.

    Returns:
      total_transactions          — all transactions recorded in the DB
      simple_count                — routed through Llama 3.1 8B (fast, cheap path)
      complex_count               — routed through Llama 3.1 70B (audit note generated)
      actual_estimated_cost_usd   — estimated cost via hybrid routing
      cost_if_all_routed_to_70b_usd — hypothetical cost if every tx used Llama 3.1 70B
      estimated_savings_percent   — percentage savings from using the hybrid approach
    """
    try:
        # --- Pricing & token constants ---
        TOKENS_SIMPLE   = 160    # tokens assumed per simple (8B) call
        TOKENS_COMPLEX  = 260    # tokens assumed per complex (70B) call
        PRICE_8B_PER_TOKEN  = 0.20 / 1_000_000   # $0.000000200 per token
        PRICE_70B_PER_TOKEN = 0.90 / 1_000_000   # $0.000000900 per token

        COST_PER_SIMPLE  = TOKENS_SIMPLE  * PRICE_8B_PER_TOKEN   # ~$0.000032
        COST_PER_COMPLEX = TOKENS_COMPLEX * PRICE_70B_PER_TOKEN  # ~$0.000234
        COST_IF_ALL_70B  = TOKENS_COMPLEX * PRICE_70B_PER_TOKEN  # same rate, per tx

        # --- Query DB ---
        all_transactions = database.get_all_transactions()
        total            = len(all_transactions)
        simple_count     = sum(1 for tx in all_transactions if tx.complexity.value == "simple")
        complex_count    = sum(1 for tx in all_transactions if tx.complexity.value == "complex")

        # --- Cost calculations ---
        actual_cost    = (simple_count * COST_PER_SIMPLE) + (complex_count * COST_PER_COMPLEX)
        naive_cost     = total * COST_IF_ALL_70B
        cost_saved     = naive_cost - actual_cost
        savings_pct    = round((cost_saved / naive_cost * 100), 2) if naive_cost > 0 else 0.0

        return {
            "total_transactions":              total,
            "simple_count":                    simple_count,
            "complex_count":                   complex_count,
            "actual_estimated_cost_usd":       round(actual_cost, 8),
            "cost_if_all_routed_to_70b_usd":   round(naive_cost,  8),
            "estimated_savings_percent":        savings_pct,
        }

    except Exception as err:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to compute metrics: {str(err)}"
        )
