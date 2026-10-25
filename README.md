# Translation Review v2 (TR v2)

A production-grade translation review system for managing, reviewing, and quality-checking software translations. Built for the Swedish open-source translation community.

## Features

- **Multi-format import**: PO (gettext) and TS (Qt) translation files
- **Quality pipeline**: Automated quality checks via review-po-v3 (hunspell, pofilter, consistency, terminology)
- **Review workflow**: Human and AI review queues with keyboard shortcuts (G/A/E/J/K)
- **Translation memory**: Cross-project string deduplication and TM search
- **Dirty tracking**: Know which files have unreviewed changes
- **PO export**: Download reviewed translations as PO files for upstream push
- **Search**: Full-text search across source and translated strings
- **Quality levels**: 10-point scale from raw machine translation (1) to visually verified (10)

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   React 18  │────▶│  FastAPI      │────▶│ PostgreSQL  │
│  TailwindCSS│     │  SQLAlchemy   │     │    17       │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │ review-po-v3│
                    │ (hunspell,  │
                    │  pofilter)  │
                    └─────────────┘
```

## Quick Start

### Docker

```bash
cp .env.example .env
# Generate a URI-safe password, then put it in POSTGRES_PASSWORD in .env:
openssl rand -hex 32
docker compose up -d
```

The Compose ports bind to loopback, so the UI and API are available only on
this machine by default. The application does not currently implement API
authentication or the admin/API-key endpoints; do not expose it through a
public interface or reverse proxy.

### Manual Installation

#### Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL 17
- hunspell with sv_SE dictionary

#### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Create database
createdb trv2
export DATABASE_URL="postgresql+asyncpg://user:pass@localhost/trv2"

# Run (tables auto-created on first start)
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

#### Frontend

```bash
cd frontend
npm install
npm run build

# Serve dist/ with nginx or any static file server
# Configure reverse proxy: /api/* → http://localhost:8000/api/*
```

## API Endpoints

### Dashboard
- `GET /api/health` — Health check
- `GET /api/dashboard/overview` — Project statistics
- `GET /api/dashboard/dirty` — Files with unreviewed changes

### Import
- `POST /api/import` — Upload PO/TS file (multipart)
- `POST /api/import/url` — Import from Weblate/Transifex URL

### Review
- `GET /api/review/batch?limit=50` — Get next review batch
- `POST /api/review/submit` — Submit review decisions
- `GET /api/review/stats` — Review statistics

### AI Review
- `GET /api/ai/queue?limit=1000` — Strings for AI review
- `POST /api/ai/review` — Batch AI review submission
- `GET /api/ai/stats` — AI review statistics

### Quality
- `POST /api/quality/run/{file_id}` — Run quality checks on a file
- `POST /api/quality/run-batch` — Batch quality check

### Export
- `GET /api/export/po/{file_id}` — Download file as PO
- `POST /api/export/mark/{file_id}` — Mark file as exported

### Search
- `GET /api/search?q=term&limit=50` — Full-text search

### Security

The API currently has no authentication. The Compose setup binds its ports to
localhost and configures CORS for the local frontend only. Keep these network
restrictions in place until an authenticated multi-user workflow is available.

## Quality Levels

| Level | Meaning |
|-------|---------|
| 1 | Untranslated / unknown quality |
| 2 | Failed quality checks |
| 3 | Pending review (machine translated) |
| 4 | Passed automated checks |
| 5 | AI pre-reviewed |
| 6 | AI approved |
| 7 | Human edited |
| 8 | Human approved |
| 9 | Professional review without visual test |
| 10 | Professional review + visually verified |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `REVIEW_PO_PATH` | Path to review-po-v3.py | `~/tools/review-po-v3/review-po-v3.py` |
| `CORS_ORIGINS` | Comma-separated browser origins allowed by CORS | Local frontend origins |

## License

MIT
