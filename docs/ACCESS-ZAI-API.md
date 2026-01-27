# Accessing Z.ai AI API (GLM 4.6)

This document outlines how to programmatically access the Z.ai AI API using your subscription, based on the implementation in this project.

## 1. API Configuration

The Z.ai API is compatible with the OpenAI API format, which makes it easy to integrate using standard libraries.

-   **Base URL**: `https://api.z.ai/api/coding/paas/v4`
-   **Authentication**: API Key (Bearer Token)
-   **Model (Preferred)**: `glm-4.6`

## 2. Supported Models

Based on the project configuration, the following models are supported:
-   `glm-4.6` (Recommended for high performance)
-   `glm-4.5`
-   `glm-4.5-air`
-   `glm-4.5-flash`
-   `glm-4.5V` (Vision support)

## 3. Python Implementation (OpenAI SDK)

You can use the official `openai` Python package to interact with the Z.ai API.

### Installation
```bash
pip install openai
```

### Basic Usage
```python
import os
from openai import OpenAI

# Initialize the client
client = OpenAI(
    api_key="YOUR_ZAI_API_KEY",
    base_url="https://api.z.ai/api/coding/paas/v4"
)

# Make a chat completion request
response = client.chat.completions.create(
    model="glm-4.6",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello, how can I use your API?"}
    ],
    temperature=0.7,
    max_tokens=2000
)

print(response.choices[0].message.content)
```

### Async Usage (Recommended for performance)
```python
import asyncio
from openai import AsyncOpenAI

async def main():
    client = AsyncOpenAI(
        api_key="YOUR_ZAI_API_KEY",
        base_url="https://api.z.ai/api/coding/paas/v4"
    )

    response = await client.chat.completions.create(
        model="glm-4.6",
        messages=[{"role": "user", "content": "Tell me about GLM 4.6"}],
    )
    print(response.choices[0].message.content)

if __name__ == "__main__":
    asyncio.run(main())
```

## 4. Key Features Noted in This Project

### Tool Calling (Function Calling)
The Z.ai API supports OpenAI-style tool calling. This allows the model to interact with external functions or APIs (like the MCP servers in this project).

### Reasoning Content
Some Z.ai models provide a `reasoning_content` field in the response message, which contains the "thought process" of the model before it generates the final answer.

```python
# Extracting reasoning content
message = response.choices[0].message
reasoning = getattr(message, "reasoning_content", None)
if reasoning:
    print(f"Model Thought: {reasoning}")
```

### Rate Limiting
The project implements exponential backoff for `RateLimitError`. It is recommended to handle these errors to ensure stability.

## 5. Environment Setup
It is recommended to store your API key in an environment variable:
```bash
export ZAI_API_KEY="your_api_key_here"
```
In this project, the key is either loaded from the `ZAI_API_KEY` environment variable or retrieved from a database setting (`SystemSetting` table).
