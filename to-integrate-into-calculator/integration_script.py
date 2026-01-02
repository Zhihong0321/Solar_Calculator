"""
Integration script to help integrate invoice creation into calculator app.
This script provides helper functions and examples.
"""
# This is a reference script - customize as needed for your calculator app

def register_routes(app):
    """
    Register invoice creation routes in your FastAPI app.
    
    Usage in your main.py or app.py:
    
    from app.routes import invoice_creation
    from app.api import invoice_api
    
    app.include_router(invoice_creation.router)
    app.include_router(invoice_api.router)
    """
    from app.routes import invoice_creation
    from app.api import invoice_api
    
    app.include_router(invoice_creation.router)
    app.include_router(invoice_api.router)


def update_calculator_links(base_url="https://calculator.atap.solar"):
    """
    Example function showing how to update calculator links.
    
    Replace all instances of:
    - https://quote.atap.solar/create-invoice
    - quote.atap.solar/create-invoice
    
    With:
    - {base_url}/create-invoice
    - /create-invoice (for relative URLs)
    """
    # Example: In your calculator code where you generate invoice links:
    # OLD:
    # invoice_url = f"https://quote.atap.solar/create-invoice?package_id={package_id}"
    
    # NEW:
    # invoice_url = f"{base_url}/create-invoice?package_id={package_id}"
    # OR for relative URLs:
    # invoice_url = f"/create-invoice?package_id={package_id}"
    pass


def verify_integration():
    """
    Verify that integration is working correctly.
    Run this after integration to test.
    """
    import requests
    
    # Test 1: Check if invoice creation page loads
    try:
        response = requests.get("http://localhost:PORT/create-invoice")
        assert response.status_code == 200
        print("✅ Invoice creation page loads successfully")
    except Exception as e:
        print(f"❌ Invoice creation page failed: {e}")
    
    # Test 2: Check if API endpoint works
    try:
        response = requests.post(
            "http://localhost:PORT/api/v1/invoices/on-the-fly",
            json={
                "package_id": "TEST_PACKAGE_ID",
                "customer_name": "Test Customer"
            }
        )
        # Should return 400 (package not found) or 200 (success)
        assert response.status_code in [200, 400]
        print("✅ Invoice API endpoint responds correctly")
    except Exception as e:
        print(f"❌ Invoice API endpoint failed: {e}")
    
    print("\nIntegration verification complete!")


if __name__ == "__main__":
    print("This is a reference script for integration.")
    print("See INTEGRATION_GUIDE.md for step-by-step instructions.")
    verify_integration()

