from openai import OpenAI
import sys

client = OpenAI(
  base_url = "https://integrate.api.nvidia.com/v1",
  api_key = "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"
)

try:
  completion = client.chat.completions.create(
    model="deepseek-ai/deepseek-v4-pro",
    messages=[{"role":"user","content":"Hello"}],
    temperature=1,
    top_p=0.95,
    max_tokens=16384,
    extra_body={"chat_template_kwargs":{"thinking":False}},
    stream=False
  )

  print(completion.choices[0].message.content)
except Exception as e:
  print(f"Error: {e}")
