const db = require('../config/db');

/**
 * Create a new user record
 * @param {Object} data - { name, email, passwordHash }
 * @returns {Object} Created user row (without password_hash)
 */
const createUser = async ({ name, email, passwordHash }) => {
    const { rows } = await db.query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email, avatar_url, created_at`,
        [name, email, passwordHash]
    );
    return rows[0];
};

/**
 * Find user by email (includes password_hash for auth comparison)
 * @param {string} email
 * @returns {Object|null}
 */
const findByEmail = async (email) => {
    const { rows } = await db.query(
        `SELECT id, name, email, password_hash, avatar_url, created_at
         FROM users WHERE email = $1`,
        [email]
    );
    return rows[0] || null;
};

/**
 * Find user by ID (safe — no password_hash)
 * @param {string} id - UUID
 * @returns {Object|null}
 */
const findById = async (id) => {
    const { rows } = await db.query(
        `SELECT id, name, email, avatar_url, created_at, updated_at
         FROM users WHERE id = $1`,
        [id]
    );
    return rows[0] || null;
};

/**
 * Update user profile fields
 * @param {string} id - UUID
 * @param {Object} fields - { name?, avatar_url? }
 * @returns {Object} Updated user row
 */
const updateUser = async (id, fields) => {
    const { name, avatar_url } = fields;
    const { rows } = await db.query(
        `UPDATE users
         SET name = COALESCE($1, name),
             avatar_url = COALESCE($2, avatar_url)
         WHERE id = $3
         RETURNING id, name, email, avatar_url, created_at, updated_at`,
        [name, avatar_url, id]
    );
    return rows[0] || null;
};

/**
 * Get user document statistics for the dashboard
 * @param {string} userId - UUID
 * @returns {Object} stats
 */
const getUserStats = async (userId) => {
    const { rows } = await db.query(
        `SELECT
            COUNT(d.id)                                            AS total_documents,
            COUNT(d.id) FILTER (WHERE d.status = 'completed')     AS completed_documents,
            COUNT(d.id) FILTER (WHERE d.status = 'processing')    AS processing_documents,
            COUNT(d.id) FILTER (WHERE d.status = 'failed')        AS failed_documents,
            COALESCE(SUM(d.file_size), 0)                         AS total_size_bytes
         FROM documents d
         WHERE d.user_id = $1`,
        [userId]
    );
    return rows[0];
};

module.exports = { createUser, findByEmail, findById, updateUser, getUserStats };
