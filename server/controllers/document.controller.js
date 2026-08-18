const path = require('path');
const fs   = require('fs');
const { validationResult } = require('express-validator');
const {
    createDocument,
    getDocumentsByUser,
    countDocumentsByUser,
    getDocumentById,
    updateDocument,
    deleteDocument,
    searchDocuments,
    saveOcrResult,
} = require('../models/document.model');
const { getFileType }  = require('../middleware/upload.middleware');
const { ApiError }     = require('../middleware/error.middleware');
const ocrService       = require('../services/ocr.service');
const aiService        = require('../services/ai.service');

// ─────────────────────────────────────────────────────────────
// @route   POST /api/documents/upload
// @desc    Upload a file, run OCR, optionally summarize
// @access  Protected
// ─────────────────────────────────────────────────────────────
const uploadDocument = async (req, res, next) => {
    try {
        if (!req.file) {
            throw new ApiError(400, 'No file uploaded. Use the "document" field.');
        }

        const { originalname, filename, path: filePath, size, mimetype } = req.file;
        const title    = req.body.title || path.parse(originalname).name;
        const fileType = getFileType(mimetype);

        // 1. Persist document record (status: 'uploaded')
        const document = await createDocument({
            userId:   req.user.id,
            title,
            fileName: filename,
            fileType,
            filePath,
            fileSize: size,
        });

        // 2. Respond immediately so client doesn't wait for OCR
        res.status(202).json({
            success: true,
            message: 'File uploaded. OCR processing started.',
            document,
        });

        // 3. Run OCR asynchronously (non-blocking).
        // IMPORTANT: attach .catch() so any unhandled rejection from
        // processOcr is visible in logs rather than swallowed silently.
        processOcr(document.id, req.user.id, filePath, fileType, mimetype)
            .catch((err) => {
                console.error(`❌ Unhandled rejection in processOcr [doc=${document.id}]:`, err);
            });

    } catch (err) {
        // Clean up uploaded file if DB insert failed
        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        next(err);
    }
};

/**
 * Background OCR processing — runs after response is sent.
 *
 * Errors are caught here and written to the DB as status='failed'.
 * The outer .catch() in uploadDocument handles any unexpected rejection
 * that somehow escapes this function (e.g. a DB failure inside the catch).
 */
const processOcr = async (documentId, userId, filePath, fileType, mimetype) => {
    const db = require('../config/db');

    // Mark as processing first
    try {
        await db.query(
            `UPDATE documents SET status = 'processing' WHERE id = $1`,
            [documentId]
        );
    } catch (dbErr) {
        console.error(`❌ Could not mark document ${documentId} as processing:`, dbErr.message);
        return; // nothing more we can do
    }

    try {
        console.log(`🔍 Starting OCR for document ${documentId} [${fileType}] at: ${filePath}`);

        // Run OCR — errors from Tesseract worker thread are now properly
        // caught inside ocr.service.js via the createWorker errorHandler
        const ocrResult = await ocrService.extractText(filePath, mimetype);

        console.log(`💾 Saving OCR result for document ${documentId} (${ocrResult.text.length} chars, ${ocrResult.confidence}% confidence)`);

        // Save OCR result
        await saveOcrResult({
            documentId,
            rawText:    ocrResult.text,
            confidence: ocrResult.confidence,
            pageCount:  ocrResult.pageCount || 1,
        });

        // Mark as completed
        await db.query(
            `UPDATE documents SET status = 'completed' WHERE id = $1`,
            [documentId]
        );

        console.log(`✅ OCR complete for document ${documentId}`);

    } catch (err) {
        // Log full stack so the actual cause is visible in server logs
        console.error(`❌ OCR failed for document ${documentId}:`);
        console.error(`   Reason : ${err.message}`);
        console.error(`   Stack  : ${err.stack}`);

        // Safely update status — wrap in its own try/catch so a DB failure
        // here doesn't mask the original OCR error in the logs
        try {
            await db.query(
                `UPDATE documents SET status = 'failed' WHERE id = $1`,
                [documentId]
            );
        } catch (dbErr) {
            console.error(`❌ Also failed to update status to 'failed' for doc ${documentId}:`, dbErr.message);
        }
    }
};

// ─────────────────────────────────────────────────────────────
// @route   GET /api/documents
// @desc    List all documents for current user (paginated)
// @access  Protected
// ─────────────────────────────────────────────────────────────
const listDocuments = async (req, res, next) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 10);
        const offset = (page - 1) * limit;

        const [documents, total] = await Promise.all([
            getDocumentsByUser(req.user.id, { limit, offset }),
            countDocumentsByUser(req.user.id),
        ]);

        res.json({
            success: true,
            documents,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1,
            },
        });
    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────────────────────
// @route   GET /api/documents/search
// @desc    Full-text search across documents
// @access  Protected
// ─────────────────────────────────────────────────────────────
const search = async (req, res, next) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q || q.length < 2) {
            throw new ApiError(400, 'Search query must be at least 2 characters.');
        }

        const limit  = Math.min(50, parseInt(req.query.limit) || 10);
        const offset = Math.max(0, parseInt(req.query.offset) || 0);

        const results = await searchDocuments(req.user.id, q, { limit, offset });

        res.json({
            success: true,
            query: q,
            count: results.length,
            results,
        });
    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────────────────────
// @route   GET /api/documents/:id
// @desc    Get single document with OCR + summary
// @access  Protected
// ─────────────────────────────────────────────────────────────
const getDocument = async (req, res, next) => {
    try {
        const document = await getDocumentById(req.params.id, req.user.id);
        if (!document) {
            throw new ApiError(404, 'Document not found.');
        }

        res.json({ success: true, document });
    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────────────────────
// @route   PUT /api/documents/:id
// @desc    Update document title
// @access  Protected
// ─────────────────────────────────────────────────────────────
const updateDocumentTitle = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            throw new ApiError(400, 'Validation failed', errors.array());
        }

        const updated = await updateDocument(req.params.id, req.user.id, {
            title: req.body.title,
        });

        if (!updated) {
            throw new ApiError(404, 'Document not found.');
        }

        res.json({ success: true, document: updated });
    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────────────────────
// @route   DELETE /api/documents/:id
// @desc    Delete document + file from disk
// @access  Protected
// ─────────────────────────────────────────────────────────────
const removeDocument = async (req, res, next) => {
    try {
        const deleted = await deleteDocument(req.params.id, req.user.id);
        if (!deleted) {
            throw new ApiError(404, 'Document not found.');
        }

        // Remove physical file from disk
        if (deleted.file_path && fs.existsSync(deleted.file_path)) {
            fs.unlinkSync(deleted.file_path);
        }

        res.json({ success: true, message: 'Document deleted successfully.' });
    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────────────────────
// @route   POST /api/documents/:id/reprocess
// @desc    Re-run OCR on an existing document
// @access  Protected
// ─────────────────────────────────────────────────────────────
const reprocessDocument = async (req, res, next) => {
    try {
        const document = await getDocumentById(req.params.id, req.user.id);
        if (!document) {
            throw new ApiError(404, 'Document not found.');
        }

        if (document.status === 'processing') {
            throw new ApiError(409, 'Document is already being processed.');
        }

        res.json({ success: true, message: 'Reprocessing started.' });

        // Re-run OCR asynchronously
        processOcr(document.id, req.user.id, document.file_path, document.file_type, null)
            .catch((err) => {
                console.error(`❌ Unhandled rejection in processOcr [doc=${document.id}]:`, err);
            });

    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────────────────────
// @route   GET /api/documents/:id/file
// @desc    Stream the raw uploaded file to the authenticated owner
// @access  Protected
// ─────────────────────────────────────────────────────────────
const serveFile = async (req, res, next) => {
    try {
        // getDocumentById already enforces req.user.id ownership
        const document = await getDocumentById(req.params.id, req.user.id);
        if (!document) {
            throw new ApiError(404, 'Document not found.');
        }

        // file_path is the absolute path stored by multer at upload time
        const filePath = document.file_path;

        if (!filePath || !fs.existsSync(filePath)) {
            throw new ApiError(404, 'Uploaded file no longer exists on disk.');
        }

        // Map stored file_type ('image' | 'pdf') back to a MIME type for the
        // Content-Type header.  We use the file extension as the authoritative
        // source so we don't rely on client-supplied data.
        const ext = path.extname(filePath).toLowerCase();
        const MIME_BY_EXT = {
            '.jpg':  'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png':  'image/png',
            '.webp': 'image/webp',
            '.tiff': 'image/tiff',
            '.tif':  'image/tiff',
            '.pdf':  'application/pdf',
        };
        const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';

        res.setHeader('Content-Type', contentType);
        // inline: let browser display images/PDFs directly; attachment would force download
        res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);

        res.sendFile(filePath, (err) => {
            if (err && !res.headersSent) {
                next(new ApiError(500, 'Failed to stream file.'));
            }
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    uploadDocument,
    listDocuments,
    getDocument,
    updateDocumentTitle,
    removeDocument,
    search,
    reprocessDocument,
    serveFile,
};
