const path = require('path');
const fs   = require('fs');
const { getDocumentById, saveSummary, getSummary } = require('../models/document.model');
const { summarize } = require('../services/ai.service');
const { ApiError }  = require('../middleware/error.middleware');

// ─────────────────────────────────────────────────────────────
// @route   POST /api/summaries/:documentId
// @desc    Generate AI summary for a completed document
// @access  Protected
// ─────────────────────────────────────────────────────────────
const generateSummary = async (req, res, next) => {
    try {
        const { documentId } = req.params;

        // 1. Fetch document + OCR result (verifies ownership)
        const document = await getDocumentById(documentId, req.user.id);
        if (!document) {
            throw new ApiError(404, 'Document not found.');
        }

        // 2. Guard: OCR must be complete before summarizing
        if (document.status !== 'completed') {
            throw new ApiError(409, `Document is not ready for summarization. Current status: "${document.status}". Wait for OCR to complete.`);
        }

        if (!document.raw_text || document.raw_text.trim().length < 20) {
            throw new ApiError(422, 'Document has insufficient text for summarization. OCR may have returned empty results.');
        }

        // 3. Call Gemini
        console.log(`🤖 Generating AI summary for document ${documentId}...`);
        const aiResult = await summarize(document.raw_text);

        // 4. Persist to DB (upsert — regenerating replaces old summary)
        const saved = await saveSummary({
            documentId,
            summaryText: aiResult.summary,
            keyPoints:   aiResult.key_points,
            sentiment:   aiResult.sentiment,
            wordCount:   aiResult.word_count,
        });

        console.log(`✅ Summary generated for document ${documentId}`);

        res.status(201).json({
            success: true,
            message: 'Summary generated successfully.',
            summary: {
                id:           saved.id,
                document_id:  saved.document_id,
                summary_text: saved.summary_text,
                key_points:   saved.key_points,
                sentiment:    saved.sentiment,
                word_count:   saved.word_count,
                created_at:   saved.created_at,
                updated_at:   saved.updated_at,
            },
        });
    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────────────────────
// @route   GET /api/summaries/:documentId
// @desc    Retrieve existing summary for a document
// @access  Protected
// ─────────────────────────────────────────────────────────────
const fetchSummary = async (req, res, next) => {
    try {
        const { documentId } = req.params;

        // Verify document ownership
        const document = await getDocumentById(documentId, req.user.id);
        if (!document) {
            throw new ApiError(404, 'Document not found.');
        }

        const summary = await getSummary(documentId, req.user.id);
        if (!summary) {
            throw new ApiError(404, 'No summary found for this document. Generate one first.');
        }

        res.json({ success: true, summary });
    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────────────────────
// @route   GET /api/summaries/:documentId/download?format=txt|json
// @desc    Download OCR text + summary as .txt or .json
// @access  Protected
// ─────────────────────────────────────────────────────────────
const downloadResult = async (req, res, next) => {
    try {
        const { documentId } = req.params;
        const format = (req.query.format || 'txt').toLowerCase();

        if (!['txt', 'json'].includes(format)) {
            throw new ApiError(400, 'Invalid format. Use ?format=txt or ?format=json');
        }

        const document = await getDocumentById(documentId, req.user.id);
        if (!document) {
            throw new ApiError(404, 'Document not found.');
        }

        if (document.status !== 'completed') {
            throw new ApiError(409, 'Document processing is not complete yet.');
        }

        const summary = await getSummary(documentId, req.user.id);
        const safeTitle = (document.title || 'document').replace(/[^a-z0-9_\-\s]/gi, '_');

        if (format === 'json') {
            const payload = {
                document: {
                    id:         document.id,
                    title:      document.title,
                    file_type:  document.file_type,
                    created_at: document.created_at,
                },
                ocr: {
                    raw_text:   document.raw_text,
                    confidence: document.confidence,
                    word_count: document.word_count,
                    page_count: document.page_count,
                },
                summary: summary ? {
                    summary_text: summary.summary_text,
                    key_points:   summary.key_points,
                    sentiment:    summary.sentiment,
                } : null,
            };

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.json"`);
            return res.send(JSON.stringify(payload, null, 2));
        }

        // Plain text format
        const lines = [
            `DOCUMENT: ${document.title}`,
            `DATE:      ${new Date(document.created_at).toLocaleString()}`,
            `TYPE:      ${document.file_type.toUpperCase()}`,
            `STATUS:    ${document.status}`,
            '',
            '═'.repeat(60),
            'EXTRACTED TEXT (OCR)',
            '═'.repeat(60),
            '',
            document.raw_text || '(No text extracted)',
            '',
        ];

        if (summary) {
            lines.push(
                '═'.repeat(60),
                'AI SUMMARY',
                '═'.repeat(60),
                '',
                summary.summary_text,
                '',
                '─'.repeat(60),
                'KEY POINTS',
                '─'.repeat(60),
                '',
                ...(summary.key_points || []).map((p, i) => `  ${i + 1}. ${p}`),
                '',
                `Sentiment: ${summary.sentiment}`,
                '',
            );
        }

        const content = lines.join('\n');

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.txt"`);
        res.setHeader('Content-Length', Buffer.byteLength(content, 'utf-8'));
        return res.send(content);

    } catch (err) {
        next(err);
    }
};

module.exports = { generateSummary, fetchSummary, downloadResult };
