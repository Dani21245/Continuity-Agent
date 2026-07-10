from datetime import datetime
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
    ai_note: Optional[str] = Field(default=None, description="Optional notes populated by AI evaluation")
