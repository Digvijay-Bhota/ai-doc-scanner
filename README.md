# DocuMind — AI Smart Document Scanner & Summarizer

> Upload images or PDFs, extract text with OCR, and get AI-powered summaries — all from a clean, responsive dashboard.

---

## Features

| Category | Details |
|----------|---------|
| **Auth** | JWT-based register / login with bcrypt password hashing |
| **Upload** | Drag-and-drop image (PNG, JPG, WEBP) and PDF upload |
| **OCR** | Tesseract.js extracts text from images; pdf-parse handles PDFs |
| **AI Summary** | Gemini generates structured summary, key points, and sentiment |
| **Document management** | View, search (full-text), edit title, delete documents |
| **Downloads** | Export summary as `.txt` or `.json` |
| **Dark / Light mode** | Toggle persisted to `localStorage`, instant switch |
| **Responsive UI** | Works on desktop and mobile |

---

## Architecture

```
ai-doc-scanner/
├── client/                  # React + Vite frontend (port 5173)
│   └── src/
│       ├── components/
│       │   ├── layout/      # AppShell, Sidebar, Topbar
│       │   └── ui/          # DocumentCard
│       ├── context/         # AuthContext, ThemeContext
│       ├── pages/           # Login, Register, Dashboard, Documents, Detail, Upload
│       ├── services/        # api.js — Axios client
│       └── utils/           # date.js
│
├── server/                  # Node.js + Express backend (port 5000)
│   ├── config/db.js         # PostgreSQL connection pool
│   ├── controllers/         # auth, document, summary
│   ├── middleware/          # auth guard, error handler, multer upload
│   ├── models/              # user.model.js, document.model.js
│   ├── routes/              # auth, document, summary routes
│   ├── services/
│   │   ├── ai.service.js    # Gemini summarization with retry + fallback
│   │   └── ocr.service.js   # Tesseract / pdf-parse text extraction
│   ├── uploads/             # Uploaded files (gitignored)
│   └── index.js             # Express entry point
│
└── database/
    └── schema.sql           # PostgreSQL schema (4 tables)
```

### Database schema

```sql
users          -- id, name, email, password_hash, created_at
documents      -- id, user_id, title, file_name, file_type, file_path, file_size, status, created_at
ocr_results    -- id, document_id, raw_text, confidence, page_count, created_at
summaries      -- id, document_id, summary_text, key_points (JSONB), sentiment, word_count, created_at
```

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 18.x |
| npm | 9.x |
| PostgreSQL | 14.x |

---

## Backend Setup

### 1. Create the PostgreSQL database and user

```sql
psql -U postgres
CREATE DATABASE ai_doc_scanner;
CREATE USER docscanner_user WITH ENCRYPTED PASSWORD 'your_strong_password';
GRANT ALL PRIVILEGES ON DATABASE ai_doc_scanner TO docscanner_user;
\q
```

### 2. Run the schema migration

```bash
psql -U docscanner_user -d ai_doc_scanner -f database/schema.sql
```

### 3. Configure environment variables

Create `server/.env` with the following keys (never commit real secrets):

```env
# ── Server ──────────────────────────────────────────────────────
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# ── Database ────────────────────────────────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_doc_scanner
DB_USER=docscanner_user
DB_PASSWORD=your_strong_password

# ── JWT ─────────────────────────────────────────────────────────
JWT_SECRET=change_this_to_a_long_random_string
JWT_EXPIRES_IN=7d

# ── Gemini AI ───────────────────────────────────────────────────
GEMINI_API_KEY=your_gemini_api_key   # https://aistudio.google.com/app/apikey

# ── File Upload ─────────────────────────────────────────────────
MAX_FILE_SIZE=10485760               # 10 MB in bytes
UPLOAD_PATH=./uploads
```

### 4. Install dependencies and start

```bash
cd server
npm install
npm run dev          # nodemon — auto-restarts on change
# or: npm start      # plain node
```

The backend health check:

```bash
curl http://localhost:5000/api/health
# → { "success": true, "database": "connected", ... }
```

---

## Frontend Setup

### 1. Configure environment variables

Create `client/.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

### 2. Install dependencies and start

```bash
cd client
npm install
npm run dev          # Vite dev server at http://localhost:5173
```

---

## Running Both Together

Open two terminals:

```bash
# Terminal 1 — backend
cd server && npm run dev

# Terminal 2 — frontend
cd client && npm run dev
```

Navigate to **http://localhost:5173**, register an account, and start uploading documents.

---

## API Endpoints

All protected routes require `Authorization: Bearer <token>`.

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register new user |
| `POST` | `/api/auth/login` | Login → returns JWT |
| `GET` | `/api/auth/me` | Get current user profile |

### Documents

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/documents/upload` | Upload file (multipart), triggers async OCR |
| `GET` | `/api/documents` | List documents (paginated: `?page=1&limit=12`) |
| `GET` | `/api/documents/search` | Full-text search (`?q=keyword`) |
| `GET` | `/api/documents/:id` | Get single document + OCR text |
| `PUT` | `/api/documents/:id` | Update document title |
| `DELETE` | `/api/documents/:id` | Delete document and its files |

### Summaries

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/summaries/:documentId` | Generate AI summary (Gemini) |
| `GET` | `/api/summaries/:documentId` | Fetch stored summary |
| `GET` | `/api/summaries/:documentId/download` | Download as `.txt` or `.json` (`?format=txt`) |

---

## OCR + Gemini Workflow

```
User uploads file
    │
    ▼
Multer saves file to server/uploads/
    │
    ▼
Document record created (status: "pending")
    │
    ▼  [background — does not block upload response]
ocr.service.js
  ├── image → Tesseract.js → raw_text
  └── PDF   → pdf-parse    → raw_text
    │
    ▼
ocr_results row saved, document status → "completed"
    │
    ▼  [on explicit user request]
ai.service.js
  ├── Primary model:  gemini-3.6-flash
  │   └── Up to 3 retries (1s/2s/4s backoff) on 408/429/500/502/503/504
  └── Fallback model: gemini-3.5-flash (only on primary transient exhaustion)
    │
    ▼
Gemini returns JSON { summary, key_points, sentiment, word_count }
    │
    ▼
summaries row saved → returned to frontend
```

---

## Development Notes

### Build for production

```bash
cd client && npm run build   # outputs to client/dist/
```

### Linting

```bash
cd client && npm run lint
```

### Resetting the database

```bash
psql -U docscanner_user -d ai_doc_scanner -f database/schema.sql
```

### Uploaded files

Files are stored locally in `server/uploads/`. This directory is gitignored. In production, replace with cloud storage (S3, GCS, etc.).

---

## Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Backend port (default: 5000) |
| `NODE_ENV` | No | `development` or `production` |
| `CLIENT_URL` | Yes | Frontend origin for CORS |
| `DB_HOST` | Yes | PostgreSQL host |
| `DB_PORT` | Yes | PostgreSQL port (default: 5432) |
| `DB_NAME` | Yes | Database name |
| `DB_USER` | Yes | Database user |
| `DB_PASSWORD` | Yes | Database password |
| `JWT_SECRET` | Yes | Long random string for signing JWTs |
| `JWT_EXPIRES_IN` | No | Token lifetime (default: `7d`) |
| `GEMINI_API_KEY` | Yes | Google AI Studio API key |
| `MAX_FILE_SIZE` | No | Max upload bytes (default: 10485760) |
| `UPLOAD_PATH` | No | Upload directory (default: `./uploads`) |
| `VITE_API_URL` | Yes (client) | Backend API base URL |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 8, vanilla CSS |
| Routing | React Router v6 |
| HTTP client | Axios |
| Icons | Lucide React |
| Toasts | React Hot Toast |
| File upload UI | React Dropzone |
| Backend | Node.js, Express 5 |
| Database | PostgreSQL 14+, `pg` pool |
| Auth | JWT (`jsonwebtoken`), bcrypt |
| OCR | Tesseract.js, pdf-parse |
| AI | Google Gemini (`@google/genai` v2) |
| File uploads | Multer |
