# InfoGraph

**InfoGraph** is a full-stack SaaS platform for Visual Document Clustering and Retrieval-Augmented Generation (RAG). Upload your documents, watch them cluster semantically on an interactive 2D graph, then chat with any cluster using a context-aware AI assistant — all with strict per-user data isolation.

## Features

- **Semantic Clustering** — Sentence-Transformers embeddings projected via PCA, clustered with DBSCAN, KMeans, or Agglomerative Clustering
- **AI Auto-Titling** — Clusters are automatically labelled by an LLM after each ingestion run
- **Contextual RAG** — PostgreSQL `pgvector` similarity search scoped strictly by user and cluster, preventing data bleed
- **Streaming Chat** — Server-Sent Events (SSE) deliver responses token-by-token with source citations
- **Hybrid AI** — Swap between cloud providers (OpenAI / Gemini) and local models (Ollama) without changing any code
- **Google OAuth** — Sign in with Google alongside email/password authentication

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, Python 3.10+ |
| Database | PostgreSQL + pgvector |
| ORM / Migrations | SQLAlchemy 2.0, Alembic |
| ML | scikit-learn, numpy |
| AI | OpenAI SDK, httpx (Ollama) |
| Frontend | React, TypeScript, Vite |
| UI | Tailwind CSS, shadcn/ui |

## Getting Started (Local Development)

### Prerequisites
- Node.js 18+ and npm
- Python 3.10+
- PostgreSQL with the `pgvector` extension

### 1. Clone the repository

```sh
git clone https://github.com/varun-aahil/Info-Graph.git
cd Info-Graph
```

### 2. Backend setup

```sh
cd backend
python -m venv .venv

# Windows
.\.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

Copy the example environment file and fill in your values:

```sh
cp .env.example .env
```

Run database migrations:

```sh
alembic upgrade head
```

Start the API server:

```sh
python -m uvicorn app.main:app --reload --port 8000
```

### 3. Frontend setup

Open a new terminal in the project root:

```sh
cp .env.example .env          # set VITE_API_BASE_URL if needed
npm install
npm run dev
```

The app will be available at `http://localhost:8080`.

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | Secret used to sign JWTs |
| `OPENAI_API_KEY` | OpenAI / Gemini API key (optional if using Ollama) |
| `OLLAMA_BASE_URL` | Ollama server URL |
| `CORS_ORIGINS` | JSON array of allowed frontend origins |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Must match the URI registered in Google Cloud Console |
| `FRONTEND_URL` | Base URL of the frontend (used for OAuth redirects) |

### Frontend (`.env`)

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Full base URL of the backend API, e.g. `https://api.example.com/api/v1` |

## Free Cloud Deployment

This stack can be deployed entirely for free using the following services:

| Service | Provider |
|---|---|
| Database | [Supabase](https://supabase.com) — pgvector is pre-installed |
| Backend | [Render](https://render.com) — deploy via Docker, free Web Service tier |
| Frontend | [Vercel](https://vercel.com) — auto-detects Vite, free Hobby tier |

### Steps

1. **Supabase** — Create a project, copy the connection string, and run `alembic upgrade head` against it.
2. **Render** — Connect the GitHub repo, select Docker environment, point Root Directory to `backend/`, and add environment variables.
3. **Vercel** — Connect the GitHub repo, set `VITE_API_BASE_URL` to your Render backend URL, and deploy.

Update `GOOGLE_REDIRECT_URI` and `FRONTEND_URL` in your Render environment variables to match your production URLs.

## Contributing

Contributions, issues, and feature requests are welcome. Feel free to open an issue or submit a pull request.

## License

MIT
