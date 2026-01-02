"""
Invoice creation page route handler.
Register this router in your main FastAPI app.
"""
from fastapi import APIRouter, Request, Query
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from typing import Optional
from urllib.parse import unquote, parse_qs
import os
import traceback
import logging

# Adjust imports based on your project structure
from app.database import get_db  # Adjust import path as needed

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/create-invoice", response_class=HTMLResponse)
async def create_invoice_page(
    request: Request,
    package_id: Optional[str] = Query(None, description="Package ID from package table"),
    panel_qty: Optional[int] = Query(None, description="Panel quantity"),
    panel_rating: Optional[str] = Query(None, description="Panel rating"),
    discount_given: Optional[str] = Query(None, description="Discount amount or percent"),
    customer_name: Optional[str] = Query(None, description="Customer name (optional)"),
    customer_phone: Optional[str] = Query(None, description="Customer phone (optional)"),
    customer_address: Optional[str] = Query(None, description="Customer address (optional)"),
    template_id: Optional[str] = Query(None, description="Template ID (optional)"),
    apply_sst: Optional[bool] = Query(False, description="Apply SST (optional)")
):
    """
    Invoice creation page - shows the invoice creation form.
    No authentication required - works with calculator app's existing auth.
    """
    # Initialize variables with defaults
    package = None
    error_message = None
    warning_message = None
    debug_info = []
    debug_info.append(f"✅ Route accessed successfully")
    debug_info.append(f"URL: {request.url}")
    debug_info.append(f"Method: {request.method}")
    debug_info.append(f"Package ID from query: {package_id}")
    
    try:
        # Handle double-encoded URLs
        if not package_id and request.url.query:
            query_str = str(request.url.query)
            if '%3D' in query_str or '%26' in query_str:
                try:
                    decoded = unquote(query_str)
                    parsed = parse_qs(decoded, keep_blank_values=True)
                    if 'package_id' in parsed and parsed['package_id']:
                        package_id = parsed['package_id'][0]
                    if 'discount_given' in parsed and parsed['discount_given'] and not discount_given:
                        discount_given = parsed['discount_given'][0]
                    if 'panel_qty' in parsed and parsed['panel_qty'] and not panel_qty:
                        try:
                            panel_qty = int(parsed['panel_qty'][0])
                        except:
                            pass
                    if 'panel_rating' in parsed and parsed['panel_rating'] and not panel_rating:
                        panel_rating = parsed['panel_rating'][0]
                    if 'customer_name' in parsed and parsed['customer_name'] and not customer_name:
                        customer_name = parsed['customer_name'][0]
                    if 'customer_phone' in parsed and parsed['customer_phone'] and not customer_phone:
                        customer_phone = parsed['customer_phone'][0]
                    if 'customer_address' in parsed and parsed['customer_address'] and not customer_address:
                        customer_address = parsed['customer_address'][0]
                    if 'template_id' in parsed and parsed['template_id'] and not template_id:
                        template_id = parsed['template_id'][0]
                    if 'apply_sst' in parsed and parsed['apply_sst'] and not apply_sst:
                        apply_sst = parsed['apply_sst'][0].lower() == 'true'
                except Exception as e:
                    warning_message = f"URL parsing warning: {str(e)}"
        
        # Try to get database session
        db = None
        try:
            db = next(get_db())
            debug_info.append("✅ Database connection successful")
        except Exception as db_error:
            logger.warning(f"Database connection failed: {db_error}")
            debug_info.append(f"⚠️ Database connection failed: {str(db_error)}")
            warning_message = "Database connection unavailable. Some features may be limited."
        
        # Try to fetch package if package_id provided
        if package_id:
            if db:
                try:
                    from sqlalchemy import text
                    result = db.execute(
                        text("SELECT bubble_id, name, price, panel, panel_qty, invoice_desc, type FROM package WHERE bubble_id = :bubble_id"),
                        {"bubble_id": package_id}
                    )
                    row = result.fetchone()
                    if not row:
                        error_message = f"⚠️ Package Not Found: The Package ID '{package_id}' does not exist in the database."
                        debug_info.append(f"Package ID searched: {package_id}")
                        package = None
                    else:
                        # Create a simple object with the data
                        package = type('Package', (), {
                            'bubble_id': row[0],
                            'name': row[1],
                            'price': row[2],
                            'panel': row[3],
                            'panel_qty': row[4],
                            'invoice_desc': row[5],
                            'type': row[6]
                        })()
                        package_display = package.name or package.invoice_desc or f"Package {package.bubble_id}"
                        debug_info.append(f"✅ Package found: {package_display}")
                except Exception as e:
                    error_message = f"⚠️ Database Error: Failed to check package. Error: {str(e)}"
                    debug_info.append(f"Database error details: {traceback.format_exc()}")
            else:
                error_message = f"⚠️ Cannot check package: Database connection unavailable. Package ID provided: {package_id}"
        else:
            warning_message = "ℹ️ No Package ID provided. You can enter a Package ID below or continue without one."
        
        # Try to render template
        try:
            # Adjust template directory path to match your project structure
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            template_dir = os.path.join(base_dir, "app", "templates")
            
            # Alternative paths to try:
            # template_dir = os.path.join(base_dir, "templates")
            # template_dir = "templates"
            
            if not os.path.exists(template_dir):
                raise FileNotFoundError(f"Template directory not found: {template_dir}")
            
            template_file = os.path.join(template_dir, "create_invoice.html")
            if not os.path.exists(template_file):
                raise FileNotFoundError(f"Template file not found: {template_file}")
            
            templates = Jinja2Templates(directory=template_dir)
            debug_info.append(f"✅ Template directory: {template_dir}")
            debug_info.append(f"✅ Template file exists: {template_file}")
            
            return templates.TemplateResponse(
                "create_invoice.html",
                {
                    "request": request,
                    "user": None,
                    "package": package,
                    "package_id": package_id,
                    "error_message": error_message,
                    "warning_message": warning_message,
                    "debug_info": debug_info,
                    "panel_qty": panel_qty,
                    "panel_rating": panel_rating,
                    "discount_given": discount_given,
                    "customer_name": customer_name,
                    "customer_phone": customer_phone,
                    "customer_address": customer_address,
                    "template_id": template_id,
                    "apply_sst": apply_sst
                }
            )
        except FileNotFoundError as e:
            return HTMLResponse(
                content=f"""
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Template Error - Invoice Creation</title>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <script src="https://cdn.tailwindcss.com"></script>
                </head>
                <body class="bg-gray-100 min-h-screen p-4">
                    <div class="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-6">
                        <h1 class="text-2xl font-bold text-red-600 mb-4">❌ Template File Missing</h1>
                        <div class="bg-red-50 border-2 border-red-300 rounded p-4 mb-4">
                            <p class="font-semibold text-red-900 mb-2">Error Details:</p>
                            <p class="text-red-800">{str(e)}</p>
                        </div>
                        <div class="bg-blue-50 border-2 border-blue-300 rounded p-4">
                            <p class="font-semibold text-blue-900 mb-2">Debug Information:</p>
                            <ul class="list-disc list-inside text-blue-800 space-y-1">
                                {"".join([f"<li>{info}</li>" for info in debug_info])}
                            </ul>
                        </div>
                    </div>
                </body>
                </html>
                """,
                status_code=200
            )
        except Exception as e:
            error_trace = traceback.format_exc()
            return HTMLResponse(
                content=f"""
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Template Error - Invoice Creation</title>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <script src="https://cdn.tailwindcss.com"></script>
                </head>
                <body class="bg-gray-100 min-h-screen p-4">
                    <div class="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-6">
                        <h1 class="text-2xl font-bold text-red-600 mb-4">❌ Template Rendering Error</h1>
                        <div class="bg-red-50 border-2 border-red-300 rounded p-4 mb-4">
                            <p class="font-semibold text-red-900 mb-2">Error:</p>
                            <p class="text-red-800 font-mono">{str(e)}</p>
                        </div>
                        <div class="bg-gray-50 border-2 border-gray-300 rounded p-4 mb-4">
                            <p class="font-semibold text-gray-900 mb-2">Technical Details:</p>
                            <pre class="text-xs overflow-auto bg-gray-900 text-green-400 p-4 rounded">{error_trace}</pre>
                        </div>
                    </div>
                </body>
                </html>
                """,
                status_code=200
            )
    except Exception as e:
        error_trace = traceback.format_exc()
        return HTMLResponse(
            content=f"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>Critical Error - Invoice Creation</title>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <script src="https://cdn.tailwindcss.com"></script>
            </head>
            <body class="bg-gray-100 min-h-screen p-4">
                <div class="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-6">
                    <h1 class="text-2xl font-bold text-red-600 mb-4">❌ Critical Error</h1>
                    <div class="bg-red-50 border-2 border-red-300 rounded p-4 mb-4">
                        <p class="font-semibold text-red-900 mb-2">Error:</p>
                        <p class="text-red-800 font-mono">{str(e)}</p>
                    </div>
                    <div class="bg-gray-50 border-2 border-gray-300 rounded p-4 mb-4">
                        <p class="font-semibold text-gray-900 mb-2">Full Error Trace:</p>
                        <pre class="text-xs overflow-auto bg-gray-900 text-green-400 p-4 rounded">{error_trace}</pre>
                    </div>
                </div>
            </body>
            </html>
            """,
            status_code=200
        )
    finally:
        # Close database session if it was opened
        if 'db' in locals() and db:
            try:
                db.close()
            except:
                pass

