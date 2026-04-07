#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DEFAULTS = {
    dryRun: false,
    minAgeMinutes: 15,
    minBytes: 2 * 1024 * 1024,
    maxDimension: 2560,
    jpegQuality: 82,
    webpQuality: 82
};

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function parseArgs(argv) {
    const config = { ...DEFAULTS };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--dry-run') {
            config.dryRun = true;
            continue;
        }
        if (arg === '--min-age-minutes' && argv[i + 1]) {
            config.minAgeMinutes = Number(argv[i + 1]) || config.minAgeMinutes;
            i += 1;
            continue;
        }
        if (arg === '--min-bytes' && argv[i + 1]) {
            config.minBytes = Number(argv[i + 1]) || config.minBytes;
            i += 1;
            continue;
        }
        if (arg === '--max-dimension' && argv[i + 1]) {
            config.maxDimension = Number(argv[i + 1]) || config.maxDimension;
            i += 1;
        }
    }

    return config;
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getStorageRoot() {
    return process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..', 'storage');
}

function isOldEnough(stat, minAgeMinutes) {
    const ageMs = Date.now() - stat.mtimeMs;
    return ageMs >= minAgeMinutes * 60 * 1000;
}

async function walkFiles(rootDir) {
    const results = [];
    const entries = await fs.promises.readdir(rootDir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) {
            const nested = await walkFiles(fullPath);
            results.push(...nested);
            continue;
        }
        if (entry.isFile()) {
            results.push(fullPath);
        }
    }

    return results;
}

async function optimizeFile(filePath, config) {
    const ext = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
        return { status: 'skipped', reason: `unsupported extension ${ext || '(none)'}` };
    }

    const stat = await fs.promises.stat(filePath);
    if (stat.size < config.minBytes) {
        return { status: 'skipped', reason: `smaller than ${formatBytes(config.minBytes)}` };
    }
    if (!isOldEnough(stat, config.minAgeMinutes)) {
        return { status: 'skipped', reason: `modified within ${config.minAgeMinutes} minute(s)` };
    }

    let pipeline = sharp(filePath, { failOn: 'none' }).rotate();
    const metadata = await pipeline.metadata();
    const width = metadata.width || null;
    const height = metadata.height || null;

    if ((width && width > config.maxDimension) || (height && height > config.maxDimension)) {
        pipeline = pipeline.resize({
            width: config.maxDimension,
            height: config.maxDimension,
            fit: 'inside',
            withoutEnlargement: true
        });
    }

    if (ext === '.jpg' || ext === '.jpeg') {
        pipeline = pipeline.jpeg({
            quality: config.jpegQuality,
            mozjpeg: true,
            progressive: true
        });
    } else if (ext === '.png') {
        pipeline = pipeline.png({
            compressionLevel: 9,
            adaptiveFiltering: true,
            palette: true
        });
    } else if (ext === '.webp') {
        pipeline = pipeline.webp({
            quality: config.webpQuality,
            effort: 5
        });
    }

    const optimizedBuffer = await pipeline.toBuffer();
    if (!optimizedBuffer || optimizedBuffer.length === 0) {
        return { status: 'skipped', reason: 'optimizer returned empty output' };
    }

    if (optimizedBuffer.length >= stat.size) {
        return {
            status: 'skipped',
            reason: `no savings (${formatBytes(stat.size)} -> ${formatBytes(optimizedBuffer.length)})`
        };
    }

    if (config.dryRun) {
        return {
            status: 'would_optimize',
            beforeBytes: stat.size,
            afterBytes: optimizedBuffer.length
        };
    }

    const tempPath = `${filePath}.tmp`;
    await fs.promises.writeFile(tempPath, optimizedBuffer);
    await fs.promises.rename(tempPath, filePath);

    return {
        status: 'optimized',
        beforeBytes: stat.size,
        afterBytes: optimizedBuffer.length
    };
}

async function main() {
    const config = parseArgs(process.argv.slice(2));
    const sedaDir = path.join(getStorageRoot(), 'seda_registration');

    if (!fs.existsSync(sedaDir)) {
        console.log(`[SEDA Optimize] Directory not found: ${sedaDir}`);
        process.exit(0);
    }

    const files = await walkFiles(sedaDir);
    let optimizedCount = 0;
    let skippedCount = 0;
    let wouldOptimizeCount = 0;
    let bytesSaved = 0;

    console.log(`[SEDA Optimize] Scanning ${files.length} file(s) in ${sedaDir}`);

    for (const filePath of files) {
        try {
            const result = await optimizeFile(filePath, config);
            if (result.status === 'optimized') {
                optimizedCount += 1;
                bytesSaved += (result.beforeBytes - result.afterBytes);
                console.log(`[optimized] ${path.basename(filePath)} ${formatBytes(result.beforeBytes)} -> ${formatBytes(result.afterBytes)}`);
                continue;
            }
            if (result.status === 'would_optimize') {
                wouldOptimizeCount += 1;
                bytesSaved += (result.beforeBytes - result.afterBytes);
                console.log(`[dry-run] ${path.basename(filePath)} ${formatBytes(result.beforeBytes)} -> ${formatBytes(result.afterBytes)}`);
                continue;
            }

            skippedCount += 1;
            console.log(`[skipped] ${path.basename(filePath)} ${result.reason}`);
        } catch (err) {
            skippedCount += 1;
            console.error(`[error] ${path.basename(filePath)} ${err.message}`);
        }
    }

    if (config.dryRun) {
        console.log(`[SEDA Optimize] Dry run complete. ${wouldOptimizeCount} file(s) would be optimized, ${skippedCount} skipped, potential savings ${formatBytes(bytesSaved)}.`);
        return;
    }

    console.log(`[SEDA Optimize] Done. ${optimizedCount} file(s) optimized, ${skippedCount} skipped, saved ${formatBytes(bytesSaved)}.`);
}

main().catch((err) => {
    console.error('[SEDA Optimize] Fatal error:', err);
    process.exit(1);
});
