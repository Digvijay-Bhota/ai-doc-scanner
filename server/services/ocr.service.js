const Tesseract = require('tesseract.js');
const { PDFParse } = require('pdf-parse');
const fs        = require('fs');
const path      = require('path');

/**
 * Extract text from an image using Tesseract.js.
 *
 * Tesseract.js v5+ runs recognition inside a Node worker_thread.
 * Errors from the worker are re-thrown via process.nextTick, which
 * means they CANNOT be caught with a normal try/catch around
 * Tesseract.recognize(). We must wrap the call in an explicit
 * Promise that rejects cleanly on any worker message error.
 *
 * @param {string} filePath - Absolute path to image file
 * @returns {Promise<{ text: string, confidence: number, pageCount: number }>}
 */
const extractFromImage = async (filePath) => {
    return new Promise(async (resolve, reject) => {
        let worker;

        try {
            // createWorker is the safe API — gives us explicit control over
            // the worker lifecycle and error surface.
            worker = await Tesseract.createWorker('eng', 1, {
                logger: (m) => {
                    if (m.status === 'recognizing text') {
                        const pct = Math.round(m.progress * 100);
                        process.stdout.write(`\r🔍 OCR progress: ${pct}%  `);
                    }
                },
                errorHandler: (err) => {
                    // Worker-internal errors: reject the wrapping Promise
                    // instead of letting them bubble via process.nextTick
                    reject(new Error(`Tesseract worker error: ${err}`));
                },
            });

            const { data } = await worker.recognize(filePath);
            process.stdout.write('\n');

            resolve({
                text:      data.text.trim(),
                confidence: parseFloat((data.confidence || 0).toFixed(2)),
                pageCount:  1,
            });
        } catch (err) {
            reject(new Error(`OCR image extraction failed: ${err.message}`));
        } finally {
            // Always terminate the worker to free memory
            if (worker) {
                try { await worker.terminate(); } catch (_) {}
            }
        }
    });
};

/**
 * Extract text from a PDF file.
 * Tries the native text layer first; falls back to image OCR for scanned PDFs.
 *
 * @param {string} filePath - Absolute path to PDF file
 * @returns {Promise<{ text: string, confidence: number, pageCount: number }>}
 */
const extractFromPdf = async (filePath) => {
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buffer });
    let nativeText = '';
    let pageCount  = 1;

    try {
        const data = await parser.getText();
        nativeText = data.pages
            ? data.pages.map((p) => p.text).join('\n\n').trim()
            : (data.text || '').trim();
        pageCount = data.total || (data.pages ? data.pages.length : 1);
    } catch (err) {
        console.warn('⚠️ PDF text extraction warning:', err.message);
    } finally {
        try { await parser.destroy(); } catch (_) {}
    }

    // Native text layer is present and meaningful — use it directly
    if (nativeText.length > 50) {
        return {
            text:       nativeText,
            confidence: 99.0,
            pageCount,
        };
    }

    // Image-based PDF (scanned) — fall back to Tesseract
    console.log('📄 Image-based PDF detected — falling back to OCR...');
    const ocrResult = await extractFromImage(filePath);
    return { ...ocrResult, pageCount };
};

/**
 * Main entry point.
 * Routes to the correct extractor based on MIME type or file extension.
 *
 * @param {string} filePath  - Absolute path to the uploaded file
 * @param {string} mimeType  - File MIME type (may be null for reprocess calls)
 * @returns {Promise<{ text: string, confidence: number, pageCount: number }>}
 */
const extractText = async (filePath, mimeType) => {
    if (!fs.existsSync(filePath)) {
        throw new Error(`OCR failed: file not found at path "${filePath}"`);
    }

    const isPdf =
        mimeType === 'application/pdf' ||
        path.extname(filePath).toLowerCase() === '.pdf';

    if (isPdf) {
        return extractFromPdf(filePath);
    }

    return extractFromImage(filePath);
};

module.exports = { extractText };
