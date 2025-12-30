# Sales Team Invoice Creation Link Guide
## Complete Guide for Generating Invoice Creation Links
**Version:** 1.0  
**Last Updated:** 2025-01-30  
**Purpose:** Cross-department communication guide for sales team to create invoice links

---

## Table of Contents

1. [Overview](#overview)
2. [Base URL Structure](#base-url-structure)
3. [Available Parameters](#available-parameters)
4. [Link Generation Methods](#link-generation-methods)
5. [Common Use Cases](#common-use-cases)
6. [Examples](#examples)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Overview

### What is the Invoice Creation Page?

The Invoice Creation Page is a web-based form that allows sales agents to create invoices quickly by pre-filling information via URL parameters. This eliminates manual data entry and reduces errors.

### How It Works

1. **Sales team generates a link** with package and customer information
2. **Sales agent opens the link** in their browser
3. **Form is pre-filled** with package details, discounts, and customer info
4. **Agent reviews and submits** to create the invoice
5. **Invoice is generated** with a shareable link

### Key Benefits

- ✅ **Faster invoice creation** - Pre-filled forms save time
- ✅ **Reduced errors** - Package details auto-loaded
- ✅ **Mobile-friendly** - Works on phones and tablets
- ✅ **Flexible** - Supports discounts, vouchers, and payment methods
- ✅ **Trackable** - Linked to logged-in sales agent

---

## Base URL Structure

### Production URL

```
https://ee-inv-v2-production.up.railway.app/create-invoice
```

**Note:** Replace `ee-inv-v2-production.up.railway.app` with your actual production domain (e.g., `ee-inv-v2-production.up.railway.app`)

**How to Find Your Production Domain:**
1. Go to Railway Dashboard: https://railway.app
2. Select your project → Your Invoicing Service
3. Go to Settings → Public Domain
4. Copy the domain (e.g., `ee-invoicing-v2-production-xxxx`)
5. Your base URL: `https://ee-inv-v2-production-xxxx.up.railway.app/create-invoice`

### Localhost/Development URL

```
http://localhost:8080/create-invoice
```

**How to Access Locally:**
1. Start server: Run `start_server.bat` or `python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8080`
2. Wait for "Application startup complete" message
3. Open browser: `http://localhost:8080/create-invoice`

---

## Available Parameters

### Required Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `package_id` | String | ✅ **YES** | Package ID from package table (bubble_id) | `1703833647950x572894707690242050` |

### Optional Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `panel_qty` | Integer | ❌ No | Panel quantity (for reference) | `8` |
| `panel_rating` | String | ❌ No | Panel rating/wattage | `450W` |
| `discount_given` | String | ❌ No | Discount amount or percentage | `500` or `10%` or `500 10%` |
| `customer_name` | String | ❌ No | Customer name (blank = "Sample Quotation") | `John Doe` |
| `customer_phone` | String | ❌ No | Customer phone number | `60123456789` |
| `customer_address` | String | ❌ No | Customer address | `123 Main St, City` |
| `template_id` | String | ❌ No | Invoice template ID (bubble_id) | `template_123` |

---

## Link Generation Methods

### Method 1: Manual URL Construction

**Basic Format:**
```
https://ee-inv-v2-production.up.railway.app/create-invoice?package_id=PACKAGE_ID&parameter1=value1&parameter2=value2
```

**Steps:**
1. Start with base URL: `https://ee-inv-v2-production.up.railway.app/create-invoice`
2. Add `?` to start query parameters
3. Add `package_id=PACKAGE_ID` (required)
4. Add additional parameters with `&` separator
5. URL encode special characters (spaces, special chars)

**Example:**
```
https://ee-inv-v2-production.up.railway.app/create-invoice?package_id=1703833647950x572894707690242050&discount_given=500&customer_name=John%20Doe
```

### Method 2: Using URL Builder (JavaScript/TypeScript)

```javascript
function buildInvoiceLink(baseUrl, params) {
    const url = new URL(baseUrl);
    
    // Required parameter
    url.searchParams.set('package_id', params.packageId);
    
    // Optional parameters
    if (params.panelQty) url.searchParams.set('panel_qty', params.panelQty);
    if (params.panelRating) url.searchParams.set('panel_rating', params.panelRating);
    if (params.discountGiven) url.searchParams.set('discount_given', params.discountGiven);
    if (params.customerName) url.searchParams.set('customer_name', params.customerName);
    if (params.customerPhone) url.searchParams.set('customer_phone', params.customerPhone);
    if (params.customerAddress) url.searchParams.set('customer_address', params.customerAddress);
    if (params.templateId) url.searchParams.set('template_id', params.templateId);
    
    return url.toString();
}

// Usage
const link = buildInvoiceLink('https://ee-inv-v2-production.up.railway.app/create-invoice', {
    packageId: '1703833647950x572894707690242050',
    discountGiven: '500',
    customerName: 'John Doe',
    customerPhone: '60123456789'
});
```

### Method 3: Using Python

```python
from urllib.parse import urlencode, urlunparse

def build_invoice_link(base_url, package_id, **kwargs):
    """
    Build invoice creation link with parameters.
    
    Args:
        base_url: Base URL (e.g., 'https://ee-inv-v2-production.up.railway.app/create-invoice')
        package_id: Required package ID
        **kwargs: Optional parameters (discount_given, customer_name, etc.)
    
    Returns:
        Complete URL string
    """
    params = {'package_id': package_id}
    
    # Add optional parameters
    optional_params = [
        'panel_qty', 'panel_rating', 'discount_given',
        'customer_name', 'customer_phone', 'customer_address', 'template_id'
    ]
    
    for param in optional_params:
        if param in kwargs and kwargs[param]:
            params[param] = kwargs[param]
    
    # Build URL
    query_string = urlencode(params)
    return f"{base_url}?{query_string}"

# Usage
link = build_invoice_link(
    'https://ee-inv-v2-production.up.railway.app/create-invoice',
    package_id='1703833647950x572894707690242050',
    discount_given='500',
    customer_name='John Doe',
    customer_phone='60123456789'
)
```

### Method 4: Using Query String Builder (Online Tools)

Use online URL builders or query string generators:
- https://www.urlencoder.org/
- https://www.freeformatter.com/url-parser-query-string-splitter.html

---

## Common Use Cases

### Use Case 1: Basic Invoice (Package Only)

**Scenario:** Create invoice for a package with no discount or customer info.

**Link:**
```
https://ee-inv-v2-production.up.railway.app/create-invoice?package_id=1703833647950x572894707690242050
```

**What Happens:**
- Package details loaded automatically
- Customer name defaults to "Sample Quotation"
- Agent can add customer info manually
- Agent can add discounts/payment methods in form

---

### Use Case 2: Invoice with Discount

**Scenario:** Create invoice with fixed discount amount.

**Link:**
```
https://ee-inv-v2-production.up.railway.app/create-invoice?package_id=1703833647950x572894707690242050&discount_given=500
```

**Discount Formats Supported:**
- Fixed amount: `500` (RM 500 discount)
- Percentage: `10%` (10% discount)
- Combined: `500 10%` (RM 500 + 10% discount)

**Examples:**
```
# RM 500 discount
discount_given=500

# 10% discount
discount_given=10%

# RM 500 + 10% discount
discount_given=500%2010%25
# (URL encoded: space = %20, % = %25)
```

---

### Use Case 3: Invoice with Customer Info

**Scenario:** Pre-fill customer information.

**Link:**
```
https://ee-inv-v2-production.up.railway.app/create-invoice?package_id=1703833647950x572894707690242050&customer_name=John%20Doe&customer_phone=60123456789&customer_address=123%20Main%20St%2C%20City
```

**URL Encoding:**
- Space → `%20` or `+`
- Comma → `%2C`
- Special characters must be encoded

**Better Approach (Use URL builder):**
```javascript
const params = new URLSearchParams({
    package_id: '1703833647950x572894707690242050',
    customer_name: 'John Doe',
    customer_phone: '60123456789',
    customer_address: '123 Main St, City'
});
const url = `https://ee-inv-v2-production.up.railway.app/create-invoice?${params}`;
```

---

### Use Case 4: Complete Invoice (All Parameters)

**Scenario:** Pre-fill everything including package details, discount, and customer info.

**Link:**
```
https://ee-inv-v2-production.up.railway.app/create-invoice?package_id=1703833647950x572894707690242050&panel_qty=8&panel_rating=450W&discount_given=500%2010%25&customer_name=John%20Doe&customer_phone=60123456789&customer_address=123%20Main%20St&template_id=template_123
```

---

## Examples

### Example 1: Simple Residential Package

**Package:** STRING SAJ JINKO 8 PCS (Residential)  
**Package ID:** `1703833647950x572894707690242050`  
**Discount:** RM 500

**Link:**
```
https://ee-inv-v2-production.up.railway.app/create-invoice?package_id=1703833647950x572894707690242050&discount_given=500
```

---

### Example 2: Commercial Package with Customer

**Package:** Commercial Solar Package  
**Package ID:** `1703833688009x793606512485335000`  
**Customer:** ABC Company  
**Phone:** 60123456789  
**Discount:** 10%

**Link:**
```
https://ee-inv-v2-production.up.railway.app/create-invoice?package_id=1703833688009x793606512485335000&discount_given=10%25&customer_name=ABC%20Company&customer_phone=60123456789
```

---

### Example 3: Sample Quotation (No Customer)

**Package:** STRING SAJ JINKO 10 PCS  
**Package ID:** `1703833788622x969335742275256300`  
**Purpose:** Sample quotation for customer review

**Link:**
```
https://ee-inv-v2-production.up.railway.app/create-invoice?package_id=1703833788622x969335742275256300
```

**Note:** Customer name will default to "Sample Quotation" if not provided.

---

### Example 4: With Panel Details

**Package:** Custom Package  
**Package ID:** `1703833647950x572894707690242050`  
**Panel Qty:** 8  
**Panel Rating:** 450W  
**Discount:** RM 1000

**Link:**
```
https://ee-inv-v2-production.up.railway.app/create-invoice?package_id=1703833647950x572894707690242050&panel_qty=8&panel_rating=450W&discount_given=1000
```

---

## Best Practices

### 1. Always Include package_id

✅ **DO:**
```
?package_id=1703833647950x572894707690242050
```

❌ **DON'T:**
```
/create-invoice
```
(Will show error - package_id is required)

---

### 2. URL Encode Special Characters

✅ **DO:**
```
customer_name=John%20Doe
customer_address=123%20Main%20St%2C%20City
discount_given=500%2010%25
```

❌ **DON'T:**
```
customer_name=John Doe
customer_address=123 Main St, City
discount_given=500 10%
```

**Use URL encoding:**
- Space → `%20` or `+`
- `%` → `%25`
- `&` → `%26`
- `=` → `%3D`
- `#` → `%23`

---

### 3. Validate Package ID Before Generating Link

✅ **DO:** Verify package exists before generating link

❌ **DON'T:** Generate link with invalid package_id

**Check Package Exists:**
```sql
SELECT bubble_id, package_name, price 
FROM package 
WHERE bubble_id = '1703833647950x572894707690242050';
```

---

### 4. Use Consistent Parameter Names

✅ **DO:** Use exact parameter names as documented

❌ **DON'T:** Use variations like `packageId`, `package-id`, `Package_ID`

**Correct Parameter Names:**
- `package_id` ✅
- `panel_qty` ✅
- `panel_rating` ✅
- `discount_given` ✅
- `customer_name` ✅
- `customer_phone` ✅
- `customer_address` ✅
- `template_id` ✅

---

### 5. Test Links Before Sharing

✅ **DO:** Test link in browser before sending to sales agent

❌ **DON'T:** Send untested links

**Testing Checklist:**
- [ ] Link opens correctly
- [ ] Package loads (no error message)
- [ ] Pre-filled data appears correctly
- [ ] Special characters display properly
- [ ] Form is functional

---

### 6. Keep Links Short When Possible

✅ **DO:** Include only necessary parameters

❌ **DON'T:** Add unnecessary parameters

**Minimal Link:**
```
?package_id=1703833647950x572894707690242050
```

**Complete Link (only if needed):**
```
?package_id=1703833647950x572894707690242050&discount_given=500&customer_name=John%20Doe&customer_phone=60123456789&customer_address=123%20Main%20St&template_id=template_123
```

---

## Troubleshooting

### Problem 1: "Package not found" Error

**Symptoms:**
- Error message: "Package with ID 'xxx' not found"
- Form shows error but still allows manual entry

**Causes:**
- Invalid `package_id`
- Package ID typo
- Package deleted from database

**Solutions:**
1. Verify package_id exists in database
2. Check for typos in package_id
3. Use correct package_id format (e.g., `1703833647950x572894707690242050`)

**Prevention:**
- Validate package_id before generating link
- Use package lookup API if available

---

### Problem 2: Special Characters Not Displaying Correctly

**Symptoms:**
- Customer name shows as "John%20Doe" instead of "John Doe"
- Address displays incorrectly

**Causes:**
- URL not properly encoded
- Double encoding

**Solutions:**
1. Use URL encoding for special characters
2. Use URL builder functions (see Method 2/3 above)
3. Check for double encoding

**Example Fix:**
```
# Wrong
customer_name=John Doe

# Correct
customer_name=John%20Doe
# or use URL builder
```

---

### Problem 3: Discount Not Applied

**Symptoms:**
- Discount parameter in URL but not showing in form
- Discount amount incorrect

**Causes:**
- Incorrect discount format
- URL encoding issues with `%` symbol

**Solutions:**
1. Use correct discount format:
   - Fixed: `500`
   - Percentage: `10%` (encoded as `10%25`)
   - Combined: `500 10%` (encoded as `500%2010%25`)
2. Check URL encoding

**Example:**
```
# Wrong
discount_given=10%

# Correct
discount_given=10%25
```

---

### Problem 4: Link Too Long

**Symptoms:**
- URL exceeds browser limits
- Link breaks when shared via messaging apps

**Causes:**
- Too many parameters
- Long customer addresses
- Unnecessary parameters

**Solutions:**
1. Remove optional parameters that can be entered manually
2. Use shorter customer addresses
3. Consider using POST method for very long data (future enhancement)

**Best Practice:**
- Include only essential parameters in URL
- Let agent fill in details manually if needed

---

### Problem 5: Authentication Required

**Symptoms:**
- Page redirects to login
- "Please login" message

**Causes:**
- Sales agent not logged in
- Session expired

**Solutions:**
1. Sales agent must login first
2. Use WhatsApp OTP login
3. Login will redirect back to invoice creation page

**Note:** This is expected behavior for security.

---

## Parameter Reference Table

### Quick Reference

| Parameter | Format | Example | URL Encoded |
|-----------|--------|---------|-------------|
| `package_id` | String (required) | `1703833647950x572894707690242050` | No encoding needed |
| `panel_qty` | Integer | `8` | No encoding needed |
| `panel_rating` | String | `450W` | No encoding needed |
| `discount_given` | String | `500` or `10%` or `500 10%` | `10%` → `10%25`, space → `%20` |
| `customer_name` | String | `John Doe` | Space → `%20` |
| `customer_phone` | String | `60123456789` | No encoding needed |
| `customer_address` | String | `123 Main St, City` | Space → `%20`, comma → `%2C` |
| `template_id` | String | `template_123` | No encoding needed |

---

## Integration Examples

### Example: ERP System Integration

**Scenario:** ERP system generates invoice links for sales team

**Code (Python):**
```python
def generate_invoice_link_from_order(order):
    """
    Generate invoice creation link from order object.
    
    Args:
        order: Order object with package_id, customer, discount info
    
    Returns:
        Complete invoice creation URL
    """
    base_url = "https://ee-inv-v2-production.up.railway.app/create-invoice"
    params = {
        'package_id': order.package_id,
    }
    
    # Add optional parameters
    if order.panel_qty:
        params['panel_qty'] = order.panel_qty
    if order.panel_rating:
        params['panel_rating'] = order.panel_rating
    if order.discount_amount or order.discount_percent:
        discount_str = ""
        if order.discount_amount:
            discount_str += str(order.discount_amount)
        if order.discount_percent:
            if discount_str:
                discount_str += " "
            discount_str += f"{order.discount_percent}%"
        params['discount_given'] = discount_str
    if order.customer_name:
        params['customer_name'] = order.customer_name
    if order.customer_phone:
        params['customer_phone'] = order.customer_phone
    if order.customer_address:
        params['customer_address'] = order.customer_address
    
    # Build URL
    from urllib.parse import urlencode
    return f"{base_url}?{urlencode(params)}"

# Usage
order = Order(
    package_id='1703833647950x572894707690242050',
    panel_qty=8,
    panel_rating='450W',
    discount_amount=500,
    discount_percent=10,
    customer_name='John Doe',
    customer_phone='60123456789',
    customer_address='123 Main St, City'
)

invoice_link = generate_invoice_link_from_order(order)
# Returns: https://ee-inv-v2-production.up.railway.app/create-invoice?package_id=...&discount_given=500%2010%25&...
```

---

### Example: WhatsApp Integration

**Scenario:** Send invoice link via WhatsApp

**Message Template:**
```
Hi! Please create invoice using this link:

{invoice_link}

Package: {package_name}
Customer: {customer_name}
Discount: {discount}
```

**Code:**
```python
def send_invoice_link_via_whatsapp(phone, invoice_link, package_name, customer_name, discount):
    message = f"""Hi! Please create invoice using this link:

{invoice_link}

Package: {package_name}
Customer: {customer_name}
Discount: {discount}"""
    
    # Send via WhatsApp API
    whatsapp_api.send_message(phone, message)
```

---

## FAQ

### Q1: Can I create invoice without customer info?

**A:** Yes! If `customer_name` is not provided, it defaults to "Sample Quotation". The sales agent can add customer info manually in the form.

---

### Q2: What happens if package_id is invalid?

**A:** The page will show an error message but still allow the agent to manually enter package information or try a different package_id.

---

### Q3: Can I combine multiple discounts?

**A:** Yes! Use format: `discount_given=500%2010%25` (RM 500 + 10% discount). Separate with space (encoded as `%20`).

---

### Q4: Do I need to URL encode everything?

**A:** Only special characters need encoding:
- Spaces → `%20`
- `%` → `%25`
- `&` → `%26`
- `=` → `%3D`

Numbers, letters, and basic characters don't need encoding.

---

### Q5: Can I use this link multiple times?

**A:** Yes! The link can be used multiple times. Each time it's opened, it creates a new form. Submitting creates a new invoice.

---

### Q6: What if the sales agent is not logged in?

**A:** The page will redirect to login. After login, the agent will be redirected back to the invoice creation page with all parameters preserved.

---

### Q7: Can I pre-fill payment methods?

**A:** Currently, payment methods (cash, credit card, EPP) are selected in the form. This may be added as URL parameters in future updates.

---

### Q8: How do I get the package_id?

**A:** Package IDs are stored in the `package` table in the database. Query:
```sql
SELECT bubble_id, package_name, price FROM package;
```

Or use the package API endpoint if available.

---

## Support

### For Technical Issues

- Check this guide first
- Verify package_id exists
- Test link in browser
- Check URL encoding

### For Sales Team Questions

- Contact IT/Development team
- Provide:
  - Package ID
  - Error message (if any)
  - Link that's not working

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-30 | Initial guide created |

---

## Related Documentation

- [Invoice Creation Plan](./INVOICE_CREATION_PLAN.md)
- [API Documentation](./API_GUIDELINE.md)
- [Deployment Instructions](./DEPLOYMENT_INSTRUCTIONS.md)

---

**Last Updated:** 2025-01-30  
**Maintained By:** Development Team  
**For:** Sales Team & Cross-Department Communication

