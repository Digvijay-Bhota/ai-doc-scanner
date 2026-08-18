const router    = require('express').Router();
const { body }  = require('express-validator');
const rateLimit = require('express-rate-limit');
const { register, login, logout, getMe, updateMe } = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

// ── Rate Limiters ─────────────────────────────────────────────
// In development the limits are relaxed (100 req) so developers
// can test freely without hitting the window.  In production the
// strict limits apply.
const isDev = process.env.NODE_ENV !== 'production';

const loginLimiter = rateLimit({
    windowMs:        15 * 60 * 1000,           // 15-minute window
    max:             isDev ? 100 : 10,          // 10 in prod, 100 in dev
    message:         { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
    standardHeaders: true,                      // Sends RateLimit-* headers (RFC 6585)
    legacyHeaders:   false,                     // Disables X-RateLimit-* headers
    skipFailedRequests: false,                  // Count ALL attempts, including failed ones
});

const registerLimiter = rateLimit({
    windowMs:        60 * 60 * 1000,           // 60-minute window
    max:             isDev ? 100 : 5,           // 5 in prod, 100 in dev
    message:         { success: false, message: 'Too many registration attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders:   false,
    skipFailedRequests: false,
});


// ── Validation Rules ─────────────────────────────────────────

const registerRules = [
    body('name')
        .trim()
        .notEmpty().withMessage('Name is required.')
        .isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters.'),

    body('email')
        .trim()
        .notEmpty().withMessage('Email is required.')
        .isEmail().withMessage('Please provide a valid email.')
        .normalizeEmail(),

    body('password')
        .notEmpty().withMessage('Password is required.')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number.'),
];

const loginRules = [
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required.')
        .isEmail().withMessage('Please provide a valid email.')
        .normalizeEmail(),

    body('password')
        .notEmpty().withMessage('Password is required.'),
];

const updateRules = [
    body('name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters.'),

    body('avatar_url')
        .optional()
        .isURL().withMessage('Avatar must be a valid URL.'),
];

// ── Routes ────────────────────────────────────────────────────

// Public — rate-limited
router.post('/register', registerLimiter, registerRules, register);
router.post('/login',    loginLimiter,    loginRules,    login);
router.post('/logout',   logout);

// Protected
router.get('/me',  protect, getMe);
router.put('/me',  protect, updateRules, updateMe);

module.exports = router;
