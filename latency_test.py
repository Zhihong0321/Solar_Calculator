"""
Latency Test: Google AI API vs UniAPI.io
Compares response times for the same model across different providers.
Uses only Python standard library (no external dependencies).
"""

import time
import os
import json
import urllib.request
import urllib.error
from statistics import mean, median, stdev

# Configuration
MODEL = "gemini-3-flash-preview"
TEST_MESSAGE = "Write a one-sentence bedtime story about a unicorn."
NUM_REQUESTS = 10  # Number of requests per provider for averaging
TIMEOUT_SECONDS = 60

# API Keys from environment
GOOGLE_API_KEYS = [
    os.getenv("GOOGLE_AI_KEY_1"),
    os.getenv("GOOGLE_AI_KEY_2"),
    os.getenv("GOOGLE_AI_KEY_3"),
    os.getenv("GOOGLE_AI_KEY_4"),
]
GOOGLE_API_KEYS = [k for k in GOOGLE_API_KEYS if k]

UNIAPI_KEY = os.getenv("UNIAPI_KEY") or os.getenv("OPENAI_API_KEY")

def make_request(url, payload, headers=None):
    """Make HTTP POST request using urllib"""
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, method='POST')
    
    if headers:
        for key, value in headers.items():
            req.add_header(key, value)
    
    req.add_header('Content-Type', 'application/json')
    
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
        return response.read().decode('utf-8')

def test_google_api():
    """Test latency for Google AI API"""
    if not GOOGLE_API_KEYS:
        return None
    
    api_key = GOOGLE_API_KEYS[0]
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={api_key}"
    
    payload = {
        "contents": [{
            "parts": [{"text": TEST_MESSAGE}]
        }]
    }
    
    start_time = time.perf_counter()
    try:
        response_text = make_request(url, payload)
        end_time = time.perf_counter()
        
        latency_ms = (end_time - start_time) * 1000
        
        return {
            "success": True,
            "latency_ms": round(latency_ms, 2),
            "response_preview": response_text[:100] + "..." if len(response_text) > 100 else response_text
        }
    except urllib.error.HTTPError as e:
        end_time = time.perf_counter()
        return {
            "success": False,
            "latency_ms": round((end_time - start_time) * 1000, 2),
            "status_code": e.code,
            "error": e.read().decode('utf-8')[:200]
        }
    except Exception as e:
        end_time = time.perf_counter()
        return {
            "success": False,
            "latency_ms": round((end_time - start_time) * 1000, 2),
            "error": str(e)
        }

def test_uniapi():
    """Test latency for UniAPI.io"""
    if not UNIAPI_KEY:
        return None
    
    url = "https://api.uniapi.io/v1/chat/completions"
    
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "user", "content": TEST_MESSAGE}
        ]
    }
    
    headers = {
        "Authorization": f"Bearer {UNIAPI_KEY}"
    }
    
    start_time = time.perf_counter()
    try:
        response_text = make_request(url, payload, headers)
        end_time = time.perf_counter()
        
        latency_ms = (end_time - start_time) * 1000
        
        data = json.loads(response_text)
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        
        return {
            "success": True,
            "latency_ms": round(latency_ms, 2),
            "response_preview": content[:100] + "..." if len(content) > 100 else content
        }
    except urllib.error.HTTPError as e:
        end_time = time.perf_counter()
        return {
            "success": False,
            "latency_ms": round((end_time - start_time) * 1000, 2),
            "status_code": e.code,
            "error": e.read().decode('utf-8')[:200]
        }
    except Exception as e:
        end_time = time.perf_counter()
        return {
            "success": False,
            "latency_ms": round((end_time - start_time) * 1000, 2),
            "error": str(e)
        }

def run_benchmark(test_func, provider_name, num_requests=NUM_REQUESTS):
    """Run multiple requests and collect statistics"""
    print(f"\n{'='*60}")
    print(f"Testing {provider_name} ({num_requests} requests)")
    print(f"Model: {MODEL}")
    print(f"{'='*60}")
    
    results = []
    successful = 0
    failed = 0
    
    for i in range(num_requests):
        print(f"  Request {i+1}/{num_requests}...", end=" ", flush=True)
        result = test_func()
        
        if result is None:
            print("SKIPPED (no API key)")
            continue
            
        if result["success"]:
            print(f"✓ {result['latency_ms']:.2f}ms")
            successful += 1
        else:
            error_msg = result.get('error', f"HTTP {result.get('status_code', 'Unknown')}")
            print(f"✗ Error: {error_msg[:50]}")
            failed += 1
        
        results.append(result)
        
        # Small delay between requests to avoid rate limiting
        if i < num_requests - 1:
            time.sleep(0.5)
    
    # Calculate statistics
    if successful > 0:
        latencies = [r["latency_ms"] for r in results if r.get("success")]
        stats = {
            "provider": provider_name,
            "total_requests": num_requests,
            "successful": successful,
            "failed": failed,
            "min_ms": round(min(latencies), 2),
            "max_ms": round(max(latencies), 2),
            "mean_ms": round(mean(latencies), 2),
            "median_ms": round(median(latencies), 2),
        }
        if len(latencies) > 1:
            stats["std_dev_ms"] = round(stdev(latencies), 2)
    else:
        stats = {
            "provider": provider_name,
            "total_requests": num_requests,
            "successful": 0,
            "failed": failed,
            "error": "All requests failed"
        }
    
    return stats, results

def print_comparison(google_stats, uniapi_stats):
    """Print side-by-side comparison"""
    print(f"\n{'='*60}")
    print("LATENCY COMPARISON RESULTS")
    print(f"{'='*60}")
    
    providers = []
    if google_stats and google_stats.get("successful", 0) > 0:
        providers.append(("Google AI API", google_stats))
    if uniapi_stats and uniapi_stats.get("successful", 0) > 0:
        providers.append(("UniAPI.io", uniapi_stats))
    
    if not providers:
        print("No successful results from either provider.")
        return
    
    # Print header
    print(f"\n{'Metric':<20}", end="")
    for name, _ in providers:
        print(f"{name:<20}", end="")
    print()
    print("-" * (20 + 20 * len(providers)))
    
    # Print metrics
    metrics = [
        ("Mean Latency", "mean_ms", "ms"),
        ("Median Latency", "median_ms", "ms"),
        ("Min Latency", "min_ms", "ms"),
        ("Max Latency", "max_ms", "ms"),
    ]
    
    if any("std_dev_ms" in s for _, s in providers):
        metrics.append(("Std Dev", "std_dev_ms", "ms"))
    
    metrics.extend([
        ("Success Rate", "successful", "/total"),
        ("Failed", "failed", ""),
    ])
    
    for metric_name, key, unit in metrics:
        print(f"{metric_name:<20}", end="")
        for _, stats in providers:
            val = stats.get(key, "N/A")
            if key in ["successful"]:
                total = stats.get("total_requests", 0)
                print(f"{val}/{total}{unit:<10}", end="")
            elif key == "failed":
                print(f"{val}{unit:<18}", end="")
            else:
                print(f"{val} {unit:<14}", end="")
        print()
    
    # Speed comparison
    if len(providers) == 2:
        g_mean = google_stats.get("mean_ms", 0)
        u_mean = uniapi_stats.get("mean_ms", 0)
        if g_mean > 0 and u_mean > 0:
            diff = abs(g_mean - u_mean)
            faster = providers[0][0] if g_mean < u_mean else providers[1][0]
            slower = providers[1][0] if g_mean < u_mean else providers[0][0]
            pct = (diff / max(g_mean, u_mean)) * 100
            print(f"\n>> Winner: {faster} is {pct:.1f}% faster than {slower}")

def print_help():
    """Print help for setting up environment variables"""
    print("""
[WARNING] API Keys not found in environment variables!

Please set the following environment variables:

For Google AI API:
  $env:GOOGLE_AI_KEY_1 = "your-google-ai-key"
  $env:GOOGLE_AI_KEY_2 = "your-backup-key-2"  (optional)
  $env:GOOGLE_AI_KEY_3 = "your-backup-key-3"  (optional)
  $env:GOOGLE_AI_KEY_4 = "your-backup-key-4"  (optional)

For UniAPI.io:
  $env:UNIAPI_KEY = "your-uniapi-key"
  OR
  $env:OPENAI_API_KEY = "your-uniapi-key"

Then run: python latency_test.py
""")

def main():
    print("=== Starting Latency Test ===")
    print(f"Model: {MODEL}")
    print(f"Test Message: '{TEST_MESSAGE}'")
    print(f"Requests per provider: {NUM_REQUESTS}")
    
    # Check environment variables
    print("\n--- Environment Check ---")
    if GOOGLE_API_KEYS:
        print(f"  [OK] Google AI: {len(GOOGLE_API_KEYS)} key(s) found")
    else:
        print(f"  [MISSING] Google AI: No keys found (GOOGLE_AI_KEY_1, GOOGLE_AI_KEY_2, etc.)")
    
    if UNIAPI_KEY:
        print(f"  [OK] UniAPI: Key found")
    else:
        print(f"  [MISSING] UniAPI: No key found (UNIAPI_KEY or OPENAI_API_KEY)")
    
    # If no keys found, show help
    if not GOOGLE_API_KEYS and not UNIAPI_KEY:
        print_help()
        return
    
    # Run tests
    google_stats = None
    uniapi_stats = None
    
    if GOOGLE_API_KEYS:
        google_stats, _ = run_benchmark(test_google_api, "Google AI API")
    
    if UNIAPI_KEY:
        uniapi_stats, _ = run_benchmark(test_uniapi, "UniAPI.io")
    
    # Print comparison
    print_comparison(google_stats, uniapi_stats)
    
    # Save results
    results = {
        "model": MODEL,
        "test_message": TEST_MESSAGE,
        "num_requests": NUM_REQUESTS,
        "google": google_stats,
        "uniapi": uniapi_stats,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    
    with open("latency_results.json", "w") as f:
        json.dump(results, f, indent=2)
    
    print(f"\n💾 Results saved to latency_results.json")

if __name__ == "__main__":
    main()
