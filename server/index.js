require('dotenv').config();

// ── Secret Validation ────────────────────────────────────────
// Runs before any other setup so the process exits immediately
// with a clear message when required secrets are absent or unsafe.
(function validateSecrets() {
    const errors = [];

    // JWT_SECRET: required, non-empty, not a known placeholder, min 32 chars
    const jwtSecret = process.env.JWT_SECRET || '';
    const PLACEHOLDER_PATTERNS = [
        'your_super_secret',
        'REPLACE_ME',
        'changeme',
        'change_this',
        'secret',
    ];
    const isPlaceholder = PLACEHOLDER_PATTERNS.some((p) =>
        jwtSecret.toLowerCase().includes(p.toLowerCase())
    );

    if (!jwtSecret) {
        errors.push('JWT_SECRET is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
    } else if (jwtSecret.length < 32) {
        errors.push(`JWT_SECRET is too short (${jwtSecret.length} chars). Minimum is 32.`);
    } else if (isPlaceholder) {
        if (process.env.NODE_ENV === 'production') {
            // Hard-fail in production — placeholder secrets are publicly known
            errors.push('JWT_SECRET is a placeholder value. Set a strong random secret before running in production.');
        } else {
            // Warn loudly in development so the developer knows to fix it
            console.warn('\n⚠️  WARNING: JWT_SECRET looks like a placeholder. Rotate it before going to production.\n');
        }
    }

    // GEMINI_API_KEY: warn if missing or placeholder
    const geminiKey = process.env.GEMINI_API_KEY || '';
    if (!geminiKey || geminiKey.startsWith('REPLACE_ME')) {
        console.warn('⚠️  WARNING: GEMINI_API_KEY is not set. AI summarization will fail.');
    }

    // DB_PASSWORD: warn if missing or placeholder
    const dbPass = process.env.DB_PASSWORD || '';
    if (!dbPass || dbPass.startsWith('REPLACE_ME')) {
        console.warn('⚠️  WARNING: DB_PASSWORD is not set. Database connection will likely fail.');
    }

    if (errors.length > 0) {
        console.error('\n🔴 FATAL — Server cannot start due to missing/unsafe secrets:');
        errors.forEach((e) => console.error(`   • ${e}`));
        console.error('\nSet the required values in server/.env and restart.\n');
        process.exit(1);
    }
})();

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const cookieParser = require('cookie-parser');
const { pool }     = require('./config/db');
const { notFound, errorHandler } = require('./middleware/error.middleware');

// ── Route Imports ─────────────────────────────────────────────
const authRoutes     = require('./routes/auth.routes');
const documentRoutes = require('./routes/document.routes');
const summaryRoutes  = require('./routes/summary.routes');

// ── App Init ─────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 5000;

const isProd = process.env.NODE_ENV === 'production';

// ── Security Middleware ───────────────────────────────────────
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'same-site' },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc:  ["'self'"],
            styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc:    ["'self'", 'https://fonts.gstatic.com', 'data:'],
            imgSrc:     ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'", process.env.CLIENT_URL || 'http://localhost:5173', 'ws:', 'wss:'],
            objectSrc:  ["'none'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: isProd ? [] : null,
        },
    },
}));

// ── CORS ─────────────────────────────────────────────────────
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Request Logging ───────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
    app.use(morgan('combined'));
} else if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
}

// ── Body & Cookie Parsers ─────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// ── Static Files ──────────────────────────────────────────────
// NOTE: uploaded files are intentionally NOT served as public static assets.
// Access is gated through the authenticated GET /api/documents/:id/file
// endpoint defined in routes/document.routes.js.

// ── Health Check ──────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({
            status: 'UP',
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        res.status(503).json({
            status: 'DOWN',
        });
    }
});

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/summaries', summaryRoutes);

// ── 404 + Global Error Handler ────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start Server ──────────────────────────────────────────────
const startServer = async () => {
    try {
        // Verify DB connection before accepting traffic
        await pool.query('SELECT NOW()');
        console.log('✅ Database connection verified');

        app.listen(PORT, () => {
            console.log(`\n🚀 Server running in ${process.env.NODE_ENV} mode`);
            console.log(`📡 API: http://localhost:${PORT}/api`);
            console.log(`🏥 Health: http://localhost:${PORT}/api/health\n`);
        });
    } catch (err) {
        console.error('❌ Failed to start server:', err.message);
        process.exit(1);
    }
};

startServer();

// ── Graceful Shutdown ─────────────────────────────────────────
process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received — shutting down gracefully');
    await pool.end();
    process.exit(0);
});

module.exports = app; // for testing
