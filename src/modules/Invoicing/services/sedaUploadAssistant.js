/**
 * src/modules/Invoicing/services/sedaUploadAssistant.js
 *
 * "AI Upload Assistant" for the SEDA form: given one uploaded file, identifies which
 * SEDA field it belongs to and extracts any applicant/site data visible on it.
 *
 * The actual file-reading (MarkItDown text extraction + vision fallback) runs in a
 * short-lived Python subprocess (scripts/seda_ai_assistant.py) — MarkItDown
 * (https://github.com/microsoft/markitdown) is Python-only, so there is no way to call
 * it from Node directly. This module writes the uploaded buffer to a temp file, spawns
 * one Python process per file, and parses its single JSON line off stdout.
 *
 * See .agents/decisions.md ("SEDA Upload AI Assistant") for why this is a separate
 * feature/kill-switch from the OCR_ENABLED extraction endpoints in routes/sedaRoutes.js.
 */

'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const { writeAiActivity } = require('../../../core/activityLog/writeAiActivity');

const SCRIPT_PATH = path.join(__dirname, '..', '..', '..', '..', 'scripts', 'seda_ai_assistant.py');
const DEFAULT_MODEL = 'deepseek-v4.1-flash';
const PROCESS_TIMEOUT_MS = 45_000;

const EXT_BY_MIME = {
    'application/pdf': '.pdf',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/bmp': '.bmp',
};

const TARGET_FIELDS = new Set([
    'mykad_front', 'mykad_back', 'mykad_pdf', 'tnb_bill', 'property_proof',
    'tnb_meter', 'tax_document', 'ssm_registration', 'ssm_form_9', 'ssm_form_49',
    'company_stamp',
]);

const EXTRACT_KEYS = new Set([
    'applicantName', 'applicantIC', 'applicantPhone', 'applicantEmail', 'applicantTin',
    'applicantAddress', 'installAddress', 'city', 'state', 'postcode', 'tnbAccount',
    'phaseType', 'emergencyName', 'emergencyRel', 'emergencyPhone', 'emergencyEmail',
    'emergencyMyKad',
]);

const EMPTY_RESULT = Object.freeze({
    target_field: null,
    document_type: null,
    confidence: 'low',
    reason: null,
    extracted_fields: {},
});

function pythonBinary() {
    return process.env.SEDA_AI_ASSISTANT_PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
}

// Re-validated here even though the Python side already whitelists these — the
// worker's stdout should never be trusted more than any other subprocess output.
function sanitizeResult(raw) {
    if (!raw || typeof raw !== 'object') return { ...EMPTY_RESULT };

    const target_field = typeof raw.target_field === 'string' && TARGET_FIELDS.has(raw.target_field)
        ? raw.target_field
        : null;
    const confidence = ['high', 'medium', 'low'].includes(raw.confidence) ? raw.confidence : 'low';

    const extracted_fields = {};
    if (raw.extracted_fields && typeof raw.extracted_fields === 'object') {
        for (const [key, value] of Object.entries(raw.extracted_fields)) {
            if (!EXTRACT_KEYS.has(key)) continue;
            const text = typeof value === 'string' ? value.trim() : (value == null ? '' : String(value).trim());
            if (text) extracted_fields[key] = text;
        }
    }

    return {
        target_field,
        document_type: typeof raw.document_type === 'string' ? raw.document_type.trim() || null : null,
        confidence,
        reason: typeof raw.reason === 'string' ? raw.reason.trim() || null : null,
        extracted_fields,
        route: typeof raw.route === 'string' ? raw.route : null,
    };
}

/**
 * Identifies a single uploaded file: which SEDA field it belongs to, plus any
 * applicant/site data visible on it. Never throws for a "the model couldn't read
 * it" case — that comes back as sanitizeResult(EMPTY_RESULT)-shaped data with a
 * `reason`. Only throws for configuration/process-level failures.
 *
 * @param {object} opts
 * @param {Buffer} opts.buffer - the uploaded file's bytes
 * @param {string} opts.mimeType - resolved MIME type
 * @param {string} [opts.originalName] - original filename, used only for the temp file extension
 * @param {object} [opts.req] - Express request, for ai_activity_log attribution
 * @param {string} [opts.recordId] - seda_registration.bubble_id, for ai_activity_log
 * @returns {Promise<{target_field:string|null, document_type:string|null, confidence:string, reason:string|null, extracted_fields:object, route:string|null}>}
 */
async function identifyDocument({ buffer, mimeType, originalName = '', req = null, recordId = null }) {
    const baseUrl = process.env.SEDA_AI_ASSISTANT_BASE_URL;
    const apiKey = process.env.SEDA_AI_ASSISTANT_API_KEY;
    const model = process.env.SEDA_AI_ASSISTANT_MODEL || DEFAULT_MODEL;

    if (!baseUrl || !apiKey) {
        const err = new Error('SEDA AI Assistant is not configured (missing SEDA_AI_ASSISTANT_BASE_URL/API_KEY).');
        err.status = 500;
        throw err;
    }

    const ext = EXT_BY_MIME[mimeType] || path.extname(originalName) || '';
    const tmpPath = path.join(os.tmpdir(), `seda-ai-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    const cleanupPaths = [tmpPath, `${tmpPath}.vision.jpg`, `${tmpPath}.page1.png`, `${tmpPath}.page1.png.vision.jpg`];

    const startedAt = Date.now();
    fs.writeFileSync(tmpPath, buffer);

    try {
        const stdout = await new Promise((resolve, reject) => {
            execFile(
                pythonBinary(),
                [SCRIPT_PATH, tmpPath, mimeType],
                {
                    timeout: PROCESS_TIMEOUT_MS,
                    maxBuffer: 4 * 1024 * 1024,
                    env: {
                        ...process.env,
                        SEDA_AI_ASSISTANT_BASE_URL: baseUrl,
                        SEDA_AI_ASSISTANT_API_KEY: apiKey,
                        SEDA_AI_ASSISTANT_MODEL: model,
                    },
                },
                (err, out) => (err ? reject(err) : resolve(out))
            );
        });

        let parsed;
        try {
            parsed = JSON.parse(String(stdout).trim().split('\n').pop());
        } catch (_) {
            parsed = { ...EMPTY_RESULT, reason: 'Assistant returned an unreadable response.', route: 'error' };
        }

        const result = sanitizeResult(parsed);
        const durationMs = Date.now() - startedAt;
        const identified = !!result.target_field;

        writeAiActivity({
            req,
            agent: 'seda_upload_assistant',
            model,
            apiUrl: baseUrl,
            action: 'identify_seda_document',
            entityType: 'seda_registration',
            entityId: recordId,
            inputSummary: `Document upload (${mimeType}, ${buffer.length} bytes)`,
            outputSummary: JSON.stringify(result),
            durationMs,
            status: identified ? 'success' : 'partial',
            errorMessage: identified ? null : (result.reason || 'Could not confidently classify the document'),
            metadata: { route: result.route },
        });

        return result;
    } catch (err) {
        writeAiActivity({
            req,
            agent: 'seda_upload_assistant',
            model,
            apiUrl: baseUrl,
            action: 'identify_seda_document',
            entityType: 'seda_registration',
            entityId: recordId,
            inputSummary: `Document upload (${mimeType}, ${buffer.length} bytes)`,
            durationMs: Date.now() - startedAt,
            status: 'failed',
            errorMessage: err.message,
        });
        // A subprocess/timeout failure is still "the assistant couldn't read it", not a hard
        // error the caller needs to surface as a 500 — callers can fall back to manual upload.
        return { ...EMPTY_RESULT, reason: 'The assistant could not process this file. Please upload it manually.', route: 'error' };
    } finally {
        for (const p of cleanupPaths) {
            fs.promises.unlink(p).catch(() => {});
        }
    }
}

module.exports = { identifyDocument, TARGET_FIELDS, EXTRACT_KEYS };
