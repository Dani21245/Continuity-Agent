import os
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
    if not api_key or api_key == "your_fireworks_api_key_here" or api_key == "${FIREWORKS_API_KEY}":
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
    if not api_key or api_key == "your_fireworks_api_key_here" or api_key == "${FIREWORKS_API_KEY}":
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
