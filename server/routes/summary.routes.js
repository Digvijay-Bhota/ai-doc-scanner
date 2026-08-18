const router = require('express').Router();
const { generateSummary, fetchSummary, downloadResult } = require('../controllers/summary.controller');
const { protect } = require('../middleware/auth.middleware');

// All summary routes require authentication
router.use(protect);

// ── Routes ────────────────────────────────────────────────────

// Generate or regenerate a summary for a document
router.post('/:documentId',              generateSummary);

// Retrieve existing summary
router.get('/:documentId',               fetchSummary);

// Download OCR + summary results as txt or json
router.get('/:documentId/download',      downloadResult);

module.exports = router;
