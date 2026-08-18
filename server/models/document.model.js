const db = require('../config/db');

/**
 * Create a new document record
 */
const createDocument = async ({ userId, title, fileName, fileType, filePath, fileSize }) => {
    const { rows } = await db.query(
        `INSERT INTO documents (user_id, title, file_name, file_type, file_path, file_size, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'uploaded')
         RETURNING *`,
        [userId, title, fileName, fileType, filePath, fileSize]
    );
    return rows[0];
};

/**
 * Get all documents for a user (with OCR + summary status)
 * Ordered by newest first
 */
const getDocumentsByUser = async (userId, { limit = 20, offset = 0 } = {}) => {
    const { rows } = await db.query(
        `SELECT
            d.*,
            o.word_count,
            o.confidence,
            CASE WHEN s.id IS NOT NULL THEN true ELSE false END AS has_summary
         FROM documents d
         LEFT JOIN ocr_results  o ON o.document_id = d.id
         LEFT JOIN summaries    s ON s.document_id = d.id
         WHERE d.user_id = $1
         ORDER BY d.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
    );
    return rows;
};

/**
 * Count total documents for a user (for pagination)
 */
const countDocumentsByUser = async (userId) => {
    const { rows } = await db.query(
        `SELECT COUNT(*) AS total FROM documents WHERE user_id = $1`,
        [userId]
    );
    return parseInt(rows[0].total);
};

/**
 * Get a single document by ID — verifies ownership
 */
const getDocumentById = async (documentId, userId) => {
    const { rows } = await db.query(
        `SELECT
            d.*,
            o.id          AS ocr_id,
            o.raw_text,
            o.confidence,
            o.word_count,
            o.char_count,
            o.page_count,
            s.id          AS summary_id,
            s.summary_text,
            s.key_points,
            s.sentiment
         FROM documents d
         LEFT JOIN ocr_results o ON o.document_id = d.id
         LEFT JOIN summaries   s ON s.document_id = d.id
         WHERE d.id = $1 AND d.user_id = $2`,
        [documentId, userId]
    );
    return rows[0] || null;
};

/**
 * Update document title or status
 */
const updateDocument = async (documentId, userId, fields) => {
    const { title, status } = fields;
    const { rows } = await db.query(
        `UPDATE documents
         SET title  = COALESCE($1, title),
             status = COALESCE($2, status)
         WHERE id = $3 AND user_id = $4
         RETURNING *`,
        [title, status, documentId, userId]
    );
    return rows[0] || null;
};

/**
 * Delete document (cascades to ocr_results + summaries)
 * Returns the deleted row so we can clean up the file
 */
const deleteDocument = async (documentId, userId) => {
    const { rows } = await db.query(
        `DELETE FROM documents
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [documentId, userId]
    );
    return rows[0] || null;
};

/**
 * Full-text search across OCR text + document titles
 */
const searchDocuments = async (userId, query, { limit = 20, offset = 0 } = {}) => {
    const { rows } = await db.query(
        `SELECT
            d.id, d.title, d.file_type, d.status, d.file_size, d.created_at,
            o.word_count,
            ts_rank(to_tsvector('english', o.raw_text), plainto_tsquery('english', $2)) AS rank,
            ts_headline('english', o.raw_text, plainto_tsquery('english', $2),
                'MaxWords=20, MinWords=10, StartSel=<mark>, StopSel=</mark>') AS snippet
         FROM documents d
         LEFT JOIN ocr_results o ON o.document_id = d.id
         WHERE d.user_id = $1
           AND (
               d.title ILIKE $3
               OR to_tsvector('english', COALESCE(o.raw_text, '')) @@ plainto_tsquery('english', $2)
           )
         ORDER BY rank DESC, d.created_at DESC
         LIMIT $4 OFFSET $5`,
        [userId, query, `%${query}%`, limit, offset]
    );
    return rows;
};

/**
 * Save OCR result for a document
 */
const saveOcrResult = async ({ documentId, rawText, confidence, pageCount }) => {
    const wordCount = rawText.trim().split(/\s+/).filter(Boolean).length;
    const charCount = rawText.length;

    const { rows } = await db.query(
        `INSERT INTO ocr_results (document_id, raw_text, confidence, page_count, word_count, char_count)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (document_id)
         DO UPDATE SET
             raw_text   = EXCLUDED.raw_text,
             confidence = EXCLUDED.confidence,
             page_count = EXCLUDED.page_count,
             word_count = EXCLUDED.word_count,
             char_count = EXCLUDED.char_count
         RETURNING *`,
        [documentId, rawText, confidence, pageCount, wordCount, charCount]
    );
    return rows[0];
};

/**
 * Upsert an AI summary for a document
 */
const saveSummary = async ({ documentId, summaryText, keyPoints, sentiment, wordCount }) => {
    const { rows } = await db.query(
        `INSERT INTO summaries (document_id, summary_text, key_points, sentiment, word_count)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (document_id)
         DO UPDATE SET
             summary_text = EXCLUDED.summary_text,
             key_points   = EXCLUDED.key_points,
             sentiment    = EXCLUDED.sentiment,
             word_count   = EXCLUDED.word_count,
             updated_at   = NOW()
         RETURNING *`,
        [documentId, summaryText, JSON.stringify(keyPoints), sentiment, wordCount]
    );
    return rows[0];
};

/**
 * Get summary for a document (verifies ownership via JOIN)
 */
const getSummary = async (documentId, userId) => {
    const { rows } = await db.query(
        `SELECT s.*
         FROM summaries s
         JOIN documents d ON d.id = s.document_id
         WHERE s.document_id = $1 AND d.user_id = $2`,
        [documentId, userId]
    );
    return rows[0] || null;
};

module.exports = {
    createDocument,
    getDocumentsByUser,
    countDocumentsByUser,
    getDocumentById,
    updateDocument,
    deleteDocument,
    searchDocuments,
    saveOcrResult,
    saveSummary,
    getSummary,
};
