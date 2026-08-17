(function (global) {
    const DEFAULTS = {
        maxDimension: 2560,
        outputType: 'image/webp',
        quality: 0.82,
        minQuality: 0.55,
        qualityStep: 0.07,
        targetBytes: null
    };

    function formatBytes(bytes) {
        if (!Number.isFinite(bytes)) return '0 B';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    function estimateBase64Bytes(dataUrl) {
        if (!dataUrl || typeof dataUrl !== 'string') return 0;
        const base64 = dataUrl.split(',')[1] || '';
        const padding = (base64.match(/=*$/) || [''])[0].length;
        return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function loadImage(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = dataUrl;
        });
    }

    function baseName(filename) {
        if (!filename) return 'upload';
        const idx = filename.lastIndexOf('.');
        return idx > 0 ? filename.substring(0, idx) : filename;
    }

    async function loadImageSource(file) {
        // Use createImageBitmap when available for orientation correction and speed
        if (typeof window.createImageBitmap === 'function') {
            try {
                const bmp = await window.createImageBitmap(file, { imageOrientation: 'from-image' });
                return {
                    width: bmp.width,
                    height: bmp.height,
                    drawable: bmp,
                    cleanup: () => {
                        if (typeof bmp.close === 'function') bmp.close();
                    }
                };
            } catch (_) {
                // Fallback to Image element if createImageBitmap fails on specific format
            }
        }

        const sourceDataUrl = await readFileAsDataUrl(file);
        const img = await loadImage(sourceDataUrl);
        return {
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height,
            drawable: img,
            cleanup: () => {}
        };
    }

    async function optimizeImageFile(file, options = {}) {
        const settings = { ...DEFAULTS, ...options };
        const src = await loadImageSource(file);

        try {
            const sourceW = src.width;
            const sourceH = src.height;
            const maxSide = Math.max(sourceW, sourceH);
            const scale = maxSide > settings.maxDimension ? (settings.maxDimension / maxSide) : 1;
            const targetW = Math.max(1, Math.round(sourceW * scale));
            const targetH = Math.max(1, Math.round(sourceH * scale));

            // High-quality canvas scaling with stepping if downscaling by more than 2x (preserves fine text sharpness)
            let curCanvas = document.createElement('canvas');
            curCanvas.width = sourceW;
            curCanvas.height = sourceH;
            let curCtx = curCanvas.getContext('2d', { alpha: false });
            curCtx.imageSmoothingEnabled = true;
            curCtx.imageSmoothingQuality = 'high';
            curCtx.drawImage(src.drawable, 0, 0, sourceW, sourceH);

            // Step-down downsampling to prevent aliasing and retain crisp document text
            let curW = sourceW;
            let curH = sourceH;
            while (curW * 0.5 > targetW && curH * 0.5 > targetH) {
                const nextW = Math.round(curW * 0.5);
                const nextH = Math.round(curH * 0.5);
                const nextCanvas = document.createElement('canvas');
                nextCanvas.width = nextW;
                nextCanvas.height = nextH;
                const nextCtx = nextCanvas.getContext('2d', { alpha: false });
                nextCtx.imageSmoothingEnabled = true;
                nextCtx.imageSmoothingQuality = 'high';
                nextCtx.drawImage(curCanvas, 0, 0, nextW, nextH);
                curCanvas = nextCanvas;
                curW = nextW;
                curH = nextH;
            }

            // Final target canvas
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = targetW;
            finalCanvas.height = targetH;
            const finalCtx = finalCanvas.getContext('2d', { alpha: false });
            finalCtx.imageSmoothingEnabled = true;
            finalCtx.imageSmoothingQuality = 'high';
            finalCtx.drawImage(curCanvas, 0, 0, targetW, targetH);

            let outputType = settings.outputType;
            let quality = settings.quality;
            let dataUrl = finalCanvas.toDataURL(outputType, quality);

            // Verify browser actually supports outputType (some older Safari return PNG for image/webp)
            if (outputType === 'image/webp' && !dataUrl.startsWith('data:image/webp')) {
                outputType = 'image/jpeg';
                dataUrl = finalCanvas.toDataURL(outputType, quality);
            }

            let sizeBytes = estimateBase64Bytes(dataUrl);

            if (settings.targetBytes && settings.targetBytes > 0) {
                while (sizeBytes > settings.targetBytes && quality > settings.minQuality) {
                    quality = Math.max(settings.minQuality, quality - settings.qualityStep);
                    dataUrl = finalCanvas.toDataURL(outputType, quality);
                    sizeBytes = estimateBase64Bytes(dataUrl);
                    if (quality <= settings.minQuality) break;
                }
            }

            const ext = outputType === 'image/webp' ? 'webp' : 'jpg';
            return {
                dataUrl,
                mimeType: outputType,
                fileName: `${baseName(file.name)}.${ext}`,
                width: targetW,
                height: targetH,
                originalSizeBytes: file.size,
                sizeBytes
            };
        } finally {
            src.cleanup();
        }
    }

    global.ImageOptimizer = {
        optimizeImageFile,
        estimateBase64Bytes,
        formatBytes
    };
})(window);
