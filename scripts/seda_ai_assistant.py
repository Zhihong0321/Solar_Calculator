#!/usr/bin/env python3
"""
scripts/seda_ai_assistant.py

One-shot worker invoked by src/modules/Invoicing/services/sedaUploadAssistant.js
(one Python process per uploaded file — the Node side handles looping/concurrency
across a multi-file batch).

Classifies a single uploaded document (which SEDA form field it belongs to) and
extracts whatever applicant/site data is visible on it, using MarkItDown for the
actual file-to-text/vision plumbing:

  - PDF / DOCX / XLSX / PPTX with a real text layer: MarkItDown extracts the text
    natively (no LLM call, no tokens spent). We then send that text (capped) to
    the model in one plain chat completion.
  - Images, or PDFs with no usable text layer (scans): the file (resized to keep
    the vision call cheap) is handed to MarkItDown's own llm_client/llm_prompt
    mechanism, which base64-encodes it and calls the model directly.

Usage:
    python seda_ai_assistant.py <file_path> <mime_type>

Reads credentials from env: SEDA_AI_ASSISTANT_BASE_URL, SEDA_AI_ASSISTANT_API_KEY,
SEDA_AI_ASSISTANT_MODEL. Prints ONE line of JSON to stdout:
    {"target_field": "...", "document_type": "...", "confidence": "...",
     "reason": "...", "extracted_fields": {...}, "route": "text|vision|vision-raster"}
Never raises past main() — any failure comes back as a well-formed JSON result
with target_field=null, so the Node caller never has to parse a stack trace.
"""

import io
import json
import os
import sys
import tempfile

MIN_USABLE_TEXT = 40          # below this, treat the text layer as absent -> fall back to vision
MAX_TEXT_CHARS = 5000         # keeps the text-tier call to roughly 1-1.5k input tokens
MAX_IMAGE_EDGE = 1600         # px, longest side, before re-encoding for the vision call
MAX_IMAGE_BYTES = 500_000     # target ceiling for the base64'd image payload
JPEG_QUALITY_STEPS = (85, 70, 55, 40)
MAX_OUTPUT_TOKENS = 300       # the reply is one small JSON object — bound the cost of the tail too

TARGET_FIELDS = [
    "mykad_front", "mykad_back", "mykad_pdf", "tnb_bill", "property_proof",
    "tnb_meter", "tax_document", "ssm_registration", "ssm_form_9", "ssm_form_49",
    "company_stamp",
]

EXTRACT_KEYS = [
    "applicantName", "applicantIC", "applicantPhone", "applicantEmail", "applicantTin",
    "applicantAddress", "installAddress", "city", "state", "postcode", "tnbAccount",
    "phaseType", "emergencyName", "emergencyRel", "emergencyPhone", "emergencyEmail",
    "emergencyMyKad",
]

EMPTY_RESULT = {
    "target_field": None,
    "document_type": None,
    "confidence": "low",
    "reason": None,
    "extracted_fields": {},
}


def build_prompt():
    return "\n".join([
        "You are a document classifier and data-extraction assistant for a Malaysian SEDA",
        "(Sustainable Energy Development Authority) solar registration form.",
        "You are shown ONE uploaded file. Identify which document slot it belongs to, and pull",
        "out any of the listed data fields that are ACTUALLY visible on it.",
        "",
        "DOCUMENT SLOTS (target_field) - pick exactly one, or null if none clearly match:",
        "- mykad_front: Malaysian MyKad/IC front side - photo, chip, name, 12-digit IC number.",
        "- mykad_back: MyKad back side - barcode/address area, no photo.",
        "- mykad_pdf: ONE file with both MyKad sides scanned together. If only one side is",
        "  visible, use mykad_front or mykad_back instead.",
        "- tnb_bill: A TNB (Tenaga Nasional Berhad) electricity bill - TNB logo, account number,",
        "  kWh usage, billing address.",
        "- tnb_meter: A photo of a physical electricity meter box/dial, not a bill.",
        "- property_proof: Proof of property ownership - Sale & Purchase Agreement, Geran/land",
        "  title, or quit rent/assessment bill.",
        "- tax_document: A tax exemption letter or corporate tax document (e.g. from LHDN).",
        "- ssm_registration: SSM (Companies Commission of Malaysia) business registration cert.",
        "- ssm_form_9: SSM Form 9 / Certificate of Incorporation.",
        "- ssm_form_49: SSM Form 49 - list of company directors/particulars.",
        "- company_stamp: A photo/scan of a company rubber stamp impression only.",
        "",
        "DATA FIELDS (extracted_fields) - only include a key if that exact information is",
        "visible on THIS file. Never guess or carry over information from a different document:",
        "  applicantName, applicantIC, applicantPhone, applicantEmail, applicantTin,",
        "  applicantAddress, installAddress, city, state, postcode, tnbAccount, phaseType",
        '  ("1" or "3"), emergencyName, emergencyRel, emergencyPhone, emergencyEmail,',
        "  emergencyMyKad.",
        "",
        "Respond with ONLY this JSON, nothing else:",
        "{",
        '  "target_field": "one of the DOCUMENT SLOT keys above, or null",',
        '  "document_type": "short human label, e.g. \'MyKad (Front)\', \'TNB Electricity Bill\'",',
        '  "confidence": "high | medium | low",',
        '  "reason": "one short sentence explaining the classification",',
        '  "extracted_fields": {}',
        "}",
        "Rules: if the file is unreadable, unrelated, or you are not confident, set",
        'target_field to null and confidence to "low" - do not guess. Never invent values.',
    ])


def parse_reply(text):
    if not text:
        return dict(EMPTY_RESULT)
    first = text.find("{")
    last = text.rfind("}")
    if first < 0 or last < 0 or last <= first:
        return dict(EMPTY_RESULT)
    try:
        parsed = json.loads(text[first:last + 1])
    except Exception:
        return dict(EMPTY_RESULT)

    target = parsed.get("target_field")
    target = target if target in TARGET_FIELDS else None

    confidence = parsed.get("confidence")
    confidence = confidence if confidence in ("high", "medium", "low") else "low"

    raw_extracted = parsed.get("extracted_fields")
    extracted = {}
    if isinstance(raw_extracted, dict):
        for key in EXTRACT_KEYS:
            value = raw_extracted.get(key)
            if value is None:
                continue
            text_value = str(value).strip()
            if text_value and text_value.lower() != "null":
                extracted[key] = text_value

    def clean_str(value):
        if not isinstance(value, str):
            return None
        value = value.strip()
        return value or None

    return {
        "target_field": target,
        "document_type": clean_str(parsed.get("document_type")),
        "confidence": confidence,
        "reason": clean_str(parsed.get("reason")),
        "extracted_fields": extracted,
    }


def resize_image_for_vision(path):
    """Returns a path to a JPEG small enough to keep the vision call cheap.
    Leaves the original untouched; writes a resized copy alongside it."""
    from PIL import Image

    img = Image.open(path)
    img = img.convert("RGB")

    width, height = img.size
    longest = max(width, height)
    if longest > MAX_IMAGE_EDGE:
        scale = MAX_IMAGE_EDGE / float(longest)
        img = img.resize((max(1, int(width * scale)), max(1, int(height * scale))), Image.LANCZOS)

    out_path = path + ".vision.jpg"
    for quality in JPEG_QUALITY_STEPS:
        img.save(out_path, format="JPEG", quality=quality)
        if os.path.getsize(out_path) <= MAX_IMAGE_BYTES:
            return out_path
    return out_path  # smallest quality step tried — send it anyway rather than failing


def rasterize_pdf_first_page(path):
    """Returns a path to a PNG of page 1, or None if the PDF can't be opened/rendered."""
    try:
        import pdfplumber
        with pdfplumber.open(path) as pdf:
            if not pdf.pages:
                return None
            image = pdf.pages[0].to_image(resolution=150).original
            out_path = path + ".page1.png"
            image.save(out_path)
            return out_path
    except Exception:
        return None


def call_text_completion(client, model, prompt, document_text):
    content = f"{prompt}\n\nDocument text:\n\"\"\"\n{document_text[:MAX_TEXT_CHARS]}\n\"\"\""
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": content}],
        temperature=0,
        max_tokens=MAX_OUTPUT_TOKENS,
    )
    return response.choices[0].message.content or ""


def is_unparseable(result):
    """True when parse_reply() fell back to EMPTY_RESULT because the model's reply wasn't
    well-formed JSON (as opposed to a legitimate, deliberate 'no match' — which still carries
    a reason string per the prompt). Used to justify one retry, not to judge confidence."""
    return result["target_field"] is None and result["reason"] is None


def call_vision_completion(client, model, prompt, image_path):
    from markitdown import MarkItDown

    md = MarkItDown(llm_client=client, llm_model=model, llm_prompt=prompt)
    result = md.convert(image_path)
    text = result.markdown or ""
    # MarkItDown's ImageConverter prefixes the LLM's reply with "# Description:\n" — strip it
    # off so parse_reply() sees the same shape as the plain text-tier reply.
    marker = "# Description:"
    idx = text.find(marker)
    if idx >= 0:
        text = text[idx + len(marker):]
    return text.strip()


def classify(file_path, mime_type, client, model):
    prompt = build_prompt()

    # Tier 1: try free/deterministic text extraction first (covers PDF/DOCX/XLSX/PPTX with a
    # real text layer). MarkItDown's non-LLM converters ignore mime_type entirely and sniff the
    # file itself, so this is safe to attempt even for images (it just comes back empty).
    from markitdown import MarkItDown

    plain_text = ""
    route = "text"
    try:
        plain_result = MarkItDown().convert(file_path)
        plain_text = (plain_result.markdown or "").strip()
    except Exception:
        plain_text = ""

    is_image = mime_type.startswith("image/")
    if not is_image and len(plain_text) >= MIN_USABLE_TEXT:
        result = parse_reply(call_text_completion(client, model, prompt, plain_text))
        if is_unparseable(result):
            result = parse_reply(call_text_completion(client, model, prompt, plain_text))
        result["route"] = route
        return result

    # Tier 2: vision. For a PDF with no usable text layer, rasterize page 1 first.
    image_source = file_path
    if mime_type == "application/pdf":
        rasterized = rasterize_pdf_first_page(file_path)
        if rasterized is None:
            result = dict(EMPTY_RESULT)
            result["reason"] = "Could not read this PDF (no text layer and rasterization failed)."
            result["route"] = "pdf-empty"
            return result
        image_source = rasterized
        route = "vision-raster"
    else:
        route = "vision"

    try:
        resized = resize_image_for_vision(image_source)
    except Exception:
        resized = image_source  # fall back to sending the original rather than failing outright

    result = parse_reply(call_vision_completion(client, model, prompt, resized))
    if is_unparseable(result):
        result = parse_reply(call_vision_completion(client, model, prompt, resized))
    result["route"] = route
    return result


def main():
    if len(sys.argv) < 3:
        print(json.dumps({**EMPTY_RESULT, "reason": "Missing file_path/mime_type argument", "route": "error"}))
        return

    file_path, mime_type = sys.argv[1], sys.argv[2]

    base_url = os.environ.get("SEDA_AI_ASSISTANT_BASE_URL")
    api_key = os.environ.get("SEDA_AI_ASSISTANT_API_KEY")
    model = os.environ.get("SEDA_AI_ASSISTANT_MODEL", "deepseek-v4.1-flash")

    if not base_url or not api_key:
        print(json.dumps({**EMPTY_RESULT, "reason": "AI assistant is not configured (missing credentials).", "route": "error"}))
        return

    try:
        from openai import OpenAI
        client = OpenAI(base_url=base_url, api_key=api_key)
        result = classify(file_path, mime_type, client, model)
    except Exception as exc:  # noqa: BLE001 - this process's only job is to never crash on stdout
        result = dict(EMPTY_RESULT)
        result["reason"] = f"Assistant error: {exc}"
        result["route"] = "error"

    print(json.dumps(result))


if __name__ == "__main__":
    main()
