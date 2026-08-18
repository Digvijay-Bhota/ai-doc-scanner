const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { ApiError } = require('./error.middleware');

// ── Ensure uploads directory exists ──────────────────────────
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ── Allowed MIME types ────────────────────────────────────────
const ALLOWED_MIME_TYPES = {
    'image/jpeg':      'jpg',
    'image/jpg':       'jpg',
    'image/png':       'png',
    'image/webp':      'webp',
    'image/tiff':      'tiff',
    'application/pdf': 'pdf',
};

// ── Storage engine ────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Pattern: userId_timestamp_randomhex.ext
        const ext    = ALLOWED_MIME_TYPES[file.mimetype] || 'bin';
        const userId = req.user?.id?.replace(/-/g, '').slice(0, 8) || 'anon';
        const unique = `${userId}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}.${ext}`;
        cb(null, unique);
    },
});

// ── MIME-type filter ──────────────────────────────────────────
const fileFilter = (req, file, cb) => {
    if (ALLOWED_MIME_TYPES[file.mimetype]) {
        cb(null, true);
    } else {
        cb(
            new ApiError(
                415,
                `Unsupported file type: ${file.mimetype}. Allowed types: JPEG, PNG, WEBP, TIFF, PDF.`
            ),
            false
        );
    }
};

// ── Multer instance ───────────────────────────────────────────
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10 MB default
        files: 1, // one file per request
    },
});

/**
 * Verify physical file contents against known magic bytes.
 * @param {string} filePath - Absolute path to uploaded file
 * @returns {string|null} Detected MIME type or null if unsupported/corrupted
 */
const detectMagicMimeType = (filePath) => {
    let fd;
    try {
        const buffer = Buffer.alloc(12);
        fd = fs.openSync(filePath, 'r');
        const bytesRead = fs.readSync(fd, buffer, 0, 12, 0);
        if (bytesRead < 4) return null;

        // JPEG: FF D8 FF
        if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
            return 'image/jpeg';
        }

        // PNG: 89 50 4E 47 0D 0A 1A 0A
        if (
            bytesRead >= 8 &&
            buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
            buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A
        ) {
            return 'image/png';
        }

        // WEBP: "RIFF" at 0..3 and "WEBP" at 8..11
        if (
            bytesRead >= 12 &&
            buffer.toString('ascii', 0, 4) === 'RIFF' &&
            buffer.toString('ascii', 8, 12) === 'WEBP'
        ) {
            return 'image/webp';
        }

        // TIFF (little-endian: 49 49 2A 00, big-endian: 4D 4D 00 2A)
        if (
            (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2A && buffer[3] === 0x00) ||
            (buffer[0] === 0x4D && buffer[1] === 0x4D && buffer[2] === 0x00 && buffer[3] === 0x2A)
        ) {
            return 'image/tiff';
        }

        // PDF: 25 50 44 46 (%PDF)
        if (
            buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46
        ) {
            return 'application/pdf';
        }

        return null;
    } catch {
        return null;
    } finally {
        if (fd !== undefined) {
            try { fs.closeSync(fd); } catch (_) {}
        }
    }
};

/**
 * Single file upload middleware
 * Field name: "document"
 * Wraps multer errors into ApiError for the global handler
 * Validates file magic bytes post-upload and auto-cleans invalid files
 */
const uploadSingle = (req, res, next) => {
    upload.single('document')(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return next(new ApiError(413, `File too large. Maximum size is ${(parseInt(process.env.MAX_FILE_SIZE) || 10485760) / 1024 / 1024} MB.`));
                }
                if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                    return next(new ApiError(400, 'Unexpected field name. Use "document" as the field name.'));
                }
                return next(new ApiError(400, `Upload error: ${err.message}`));
            }
            return next(err); // ApiError from fileFilter or other
        }

        if (!req.file) return next();

        // Secondary validation: Check physical file magic bytes
        const detectedMime = detectMagicMimeType(req.file.path);

        if (!detectedMime) {
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return next(new ApiError(415, 'Invalid file content. Uploaded file signature does not match any allowed document format (JPEG, PNG, WEBP, TIFF, PDF).'));
        }

        // Standardize image/jpg to image/jpeg for matching if needed
        const declaredMime = req.file.mimetype === 'image/jpg' ? 'image/jpeg' : req.file.mimetype;

        if (detectedMime !== declaredMime) {
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return next(new ApiError(415, `MIME type mismatch: Declared "${req.file.mimetype}" but actual content is "${detectedMime}".`));
        }

        next();
    });
};

/**
 * Determine file category from MIME type
 * @param {string} mimetype
 * @returns {'image'|'pdf'}
 */
const getFileType = (mimetype) => {
    return mimetype === 'application/pdf' ? 'pdf' : 'image';
};

module.exports = { uploadSingle, getFileType };

