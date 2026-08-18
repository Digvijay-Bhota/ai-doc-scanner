const router = require('express').Router();
const { body } = require('express-validator');
const {
    uploadDocument,
    listDocuments,
    getDocument,
    updateDocumentTitle,
    removeDocument,
    search,
    reprocessDocument,
    serveFile,
} = require('../controllers/document.controller');
const { protect }       = require('../middleware/auth.middleware');
const { uploadSingle }  = require('../middleware/upload.middleware');

// All document routes require authentication
router.use(protect);

// ── Validation Rules ─────────────────────────────────────────
const updateTitleRules = [
    body('title')
        .trim()
        .notEmpty().withMessage('Title is required.')
        .isLength({ min: 1, max: 255 }).withMessage('Title must be 1–255 characters.'),
];

// ── Routes ────────────────────────────────────────────────────

// Search (must come before /:id to avoid route collision)
router.get('/search',           search);

// CRUD
router.post('/upload',          uploadSingle, uploadDocument);
router.get('/',                 listDocuments);
router.get('/:id/file',         serveFile);       // authenticated raw-file streaming
router.get('/:id',              getDocument);
router.put('/:id',              updateTitleRules, updateDocumentTitle);
router.delete('/:id',           removeDocument);
router.post('/:id/reprocess',   reprocessDocument);

module.exports = router;
