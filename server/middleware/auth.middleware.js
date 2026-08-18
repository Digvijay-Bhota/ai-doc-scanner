const jwt = require('jsonwebtoken');
const { findById } = require('../models/user.model');
const { ApiError } = require('./error.middleware');

/**
 * Protect routes — verifies JWT and attaches req.user
 */
const protect = async (req, res, next) => {
    try {
        // 1. Extract token from HttpOnly cookie (preferred) or Authorization header (fallback)
        let token = req.cookies?.token;

        if (!token) {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.split(' ')[1];
            }
        }

        if (!token) {
            throw new ApiError(401, 'Access denied. No token provided.');
        }

        // 2. Verify token signature + expiry
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 3. Confirm user still exists in DB (handles deleted accounts)
        const user = await findById(decoded.id);
        if (!user) {
            throw new ApiError(401, 'User no longer exists.');
        }

        // 4. Attach user to request
        req.user = user;
        next();
    } catch (err) {
        next(err);
    }
};

/**
 * Generate a signed JWT token
 * @param {string} id - User UUID
 * @returns {string} Signed JWT
 */
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
};

module.exports = { protect, generateToken };
