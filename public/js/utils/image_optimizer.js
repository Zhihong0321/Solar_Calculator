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

    async function optimizeImageFile(file, options = {}) {
        const settings = { ...DEFAULTS, ...options };
        const sourceDataUrl = await readFileAsDataUrl(file);
        const img = await loadImage(sourceDataUrl);

        const sourceW = img.naturalWidth || img.width;
        const sourceH = img.naturalHeight || img.height;
        const maxSide = Math.max(sourceW, sourceH);
        const scale = maxSide > settings.maxDimension ? (settings.maxDimension / maxSide) : 1;
        const targetW = Math.max(1, Math.round(sourceW * scale));
        const targetH = Math.max(1, Math.round(sourceH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.drawImage(img, 0, 0, targetW, targetH);

        let outputType = settings.outputType;
        let quality = settings.quality;
        let dataUrl = canvas.toDataURL(outputType, quality);
        let sizeBytes = estimateBase64Bytes(dataUrl);

        if (settings.targetBytes && settings.targetBytes > 0) {
            while (sizeBytes > settings.targetBytes && quality > settings.minQuality) {
                quality = Math.max(settings.minQuality, quality - settings.qualityStep);
                dataUrl = canvas.toDataURL(outputType, quality);
                sizeBytes = estimateBase64Bytes(dataUrl);
                if (quality === settings.minQuality) break;
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
    }

    global.ImageOptimizer = {
        optimizeImageFile,
        estimateBase64Bytes,
        formatBytes
    };
})(window);
