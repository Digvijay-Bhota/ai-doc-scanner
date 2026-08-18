/**
 * Custom API Error class
 * Usage: throw new ApiError(404, 'Document not found')
 */
class ApiError extends Error {
    constructor(statusCode, message, details = null) {
        super(message);
        this.statusCode = statusCode;
        this.details    = details;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * 404 Not Found handler — mount BEFORE the global error handler
 */
const notFound = (req, res, next) => {
    next(new ApiError(404, `Route not found: ${req.method} ${req.path}`));
};

/**
 * Global error handler — mount LAST in Express middleware chain
 */
const errorHandler = (err, req, res, next) => {
    // Default values
    let statusCode = err.statusCode || 500;
    let message    = err.message    || 'Internal Server Error';

    // Postgres unique violation (e.g. duplicate email)
    if (err.code === '23505') {
        statusCode = 409;
        message = 'A record with that value already exists.';
    }

    // Postgres foreign key violation
    if (err.code === '23503') {
        statusCode = 400;
        message = 'Referenced record does not exist.';
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Invalid authentication token.';
    }
    if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Authentication token has expired.';
    }

    // Log non-operational errors (programming bugs)
    if (!err.isOperational) {
        console.error('🔴 UNHANDLED ERROR:', err);
    }

    res.status(statusCode).json({
        success: false,
        message,
        ...(err.details && { details: err.details }),
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
};

module.exports = { ApiError, notFound, errorHandler };
