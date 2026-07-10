#!/bin/bash
# Test Fireworks API key directly without credit card requirement 
# using the $50 free credit tier.

source .env

echo "Testing Fireworks API with key: ${FIREWORKS_API_KEY:0:15}..."

curl https://api.fireworks.ai/inference/v1/chat/completions \
  -H "Authorization: Bearer $FIREWORKS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "accounts/fireworks/models/llama-v3p1-8b-instruct", "messages": [{"role": "user", "content": "hello"}]}'
