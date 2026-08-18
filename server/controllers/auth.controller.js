const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const { createUser, findByEmail, findById, updateUser, getUserStats } = require('../models/user.model');
const { generateToken } = require('../middleware/auth.middleware');
const { ApiError } = require('../middleware/error.middleware');

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * Helper — send token response in HttpOnly cookie
 */
const sendTokenResponse = (res, statusCode, user) => {
    const token = generateToken(user.id);
    res.cookie('token', token, COOKIE_OPTIONS);
    res.status(statusCode).json({
        success: true,
        user,
    });
};

// ─────────────────────────────────────────────────────────────
// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
// ─────────────────────────────────────────────────────────────
const register = async (req, res, next) => {
    try {
        // 1. Validate request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            throw new ApiError(400, 'Validation failed', errors.array());
        }

        const { name, email, password } = req.body;

        // 2. Check if email already exists
        const existing = await findByEmail(email);
        if (existing) {
            throw new ApiError(409, 'An account with that email already exists.');
        }

        // 3. Hash password (cost factor 12)
        const passwordHash = await bcrypt.hash(password, 12);

        // 4. Create user
        const user = await createUser({ name, email, passwordHash });

        // 5. Respond with token
        sendTokenResponse(res, 201, user);
    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────────────────────
// @route   POST /api/auth/login
// @desc    Login and receive JWT
// @access  Public
// ─────────────────────────────────────────────────────────────
const login = async (req, res, next) => {
    try {
        // 1. Validate request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            throw new ApiError(400, 'Validation failed', errors.array());
        }

        const { email, password } = req.body;

        // 2. Find user (generic error message to prevent email enumeration)
        const user = await findByEmail(email);
        if (!user) {
            throw new ApiError(401, 'Invalid email or password.');
        }

        // 3. Compare password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            throw new ApiError(401, 'Invalid email or password.');
        }

        // 4. Strip password_hash before sending
        const { password_hash, ...safeUser } = user;

        // 5. Respond with token
        sendTokenResponse(res, 200, safeUser);
    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────────────────────
// @route   GET /api/auth/me
// @desc    Get current authenticated user + stats
// @access  Protected
// ─────────────────────────────────────────────────────────────
const getMe = async (req, res, next) => {
    try {
        const user = await findById(req.user.id);
        const stats = await getUserStats(req.user.id);

        res.json({
            success: true,
            user,
            stats: {
                totalDocuments:      parseInt(stats.total_documents),
                completedDocuments:  parseInt(stats.completed_documents),
                processingDocuments: parseInt(stats.processing_documents),
                failedDocuments:     parseInt(stats.failed_documents),
                totalSizeBytes:      parseInt(stats.total_size_bytes),
            },
        });
    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────────────────────
// @route   PUT /api/auth/me
// @desc    Update current user profile
// @access  Protected
// ─────────────────────────────────────────────────────────────
const updateMe = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            throw new ApiError(400, 'Validation failed', errors.array());
        }

        const { name, avatar_url } = req.body;

        const updated = await updateUser(req.user.id, { name, avatar_url });
        res.json({ success: true, user: updated });
    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────────────────────
// @route   POST /api/auth/logout
// @desc    Logout user by clearing HttpOnly token cookie
// @access  Public / Protected
// ─────────────────────────────────────────────────────────────
const logout = async (req, res, next) => {
    try {
        res.clearCookie('token', COOKIE_OPTIONS);
        res.json({ success: true, message: 'Logged out successfully.' });
    } catch (err) {
        next(err);
    }
};

module.exports = { register, login, logout, getMe, updateMe };
