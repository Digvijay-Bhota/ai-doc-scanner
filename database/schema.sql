-- ============================================================
-- AI Smart Document Scanner & Summarizer - Database Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    avatar_url    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DOCUMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       VARCHAR(255) NOT NULL,
    file_name   VARCHAR(255) NOT NULL,
    file_type   VARCHAR(50) NOT NULL,   -- 'image' | 'pdf'
    file_path   TEXT NOT NULL,
    file_size   INTEGER NOT NULL DEFAULT 0,  -- bytes
    status      VARCHAR(50) NOT NULL DEFAULT 'uploaded',
    -- status values: uploaded | processing | completed | failed
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- OCR RESULTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS ocr_results (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    raw_text      TEXT NOT NULL DEFAULT '',
    confidence    DECIMAL(5, 2) DEFAULT 0,   -- 0.00 to 100.00
    page_count    INTEGER DEFAULT 1,
    word_count    INTEGER DEFAULT 0,
    char_count    INTEGER DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SUMMARIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS summaries (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    summary_text  TEXT NOT NULL DEFAULT '',
    key_points    JSONB NOT NULL DEFAULT '[]',  -- array of strings
    sentiment     VARCHAR(50) DEFAULT 'neutral', -- positive | negative | neutral
    word_count    INTEGER DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- UNIQUE CONSTRAINTS (one OCR result + one summary per document)
-- Uses DO blocks for idempotent, safe migrations (IF NOT EXISTS
-- is not valid syntax for ADD CONSTRAINT in PostgreSQL)
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ocr_results_document_id_unique'
    ) THEN
        ALTER TABLE ocr_results ADD CONSTRAINT ocr_results_document_id_unique UNIQUE (document_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'summaries_document_id_unique'
    ) THEN
        ALTER TABLE summaries ADD CONSTRAINT summaries_document_id_unique UNIQUE (document_id);
    END IF;
END $$;

-- ============================================================
-- INDEXES for Performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_documents_user_id    ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status     ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_results_doc_id   ON ocr_results(document_id);
CREATE INDEX IF NOT EXISTS idx_summaries_doc_id     ON summaries(document_id);

-- Full-text search index on OCR raw text
CREATE INDEX IF NOT EXISTS idx_ocr_fulltext
    ON ocr_results USING GIN(to_tsvector('english', raw_text));

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_summaries_updated_at
    BEFORE UPDATE ON summaries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- VERIFICATION QUERY  (run after migration to confirm)
-- ============================================================
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public';
