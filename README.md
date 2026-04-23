# InfoGraph 📊

**InfoGraph** is a cutting-edge SaaS platform for Visual Document Clustering & Retrieval-Augmented Generation (RAG). It enables users to upload documents, visualize their semantic groupings on an interactive 2D graph, and chat intelligently with specific document clusters securely without data bleed.

## ✨ Core Features

*   **Semantic Document Clustering:** Utilizes Sentence-Transformers embeddings projected via PCA and clustered using powerful algorithms like DBSCAN, KMeans, or Hierarchical Agglomerative Clustering.
*   **AI Auto-Titling:** Automatically labels generated clusters by analyzing the most representative text chunks and querying an LLM to determine the overarching topic.
*   **Secure Contextual RAG:** Engage in a conversation with your documents. InfoGraph leverages PostgreSQL's native `pgvector` to perform lightning-fast similarity searches securely bounded by `user_id` and `cluster_id`.
*   **Streaming Chat Interface:** Real-time Server-Sent Events (SSE) streaming for AI chat responses, complete with exact document and chunk source citations.
*   **Hybrid AI Support:** Seamlessly switch between cloud providers (OpenAI, Gemini) and local, privacy-first providers (Ollama).

## 🛠️ Technology Stack

### Backend
*   **Framework:** FastAPI (Python)
*   **Database:** PostgreSQL with `pgvector` extension
*   **ORM & Migrations:** SQLAlchemy 2.0 & Alembic
*   **Machine Learning:** `scikit-learn` (PCA, Clustering), `numpy`
*   **Generative AI:** OpenAI Python SDK, `httpx` (for Ollama streaming)

### Frontend
*   **Framework:** React + TypeScript (Vite)
*   **Styling & UI:** Tailwind CSS, `shadcn/ui`

## 🚀 Getting Started

### Prerequisites
*   Node.js & npm
*   Python 3.10+
*   PostgreSQL (with the `pgvector` extension installed)

### 1. Database Setup
Ensure PostgreSQL is running and `pgvector` is enabled.
Create a database named `infograph` (or update the `.env` file accordingly).

### 2. Backend Installation
```sh
cd backend
python -m venv .venv

# On Windows
.\.venv\Scripts\activate
# On macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

Set up your `.env` file in the `backend` directory (a sample is provided below):
```ini
DATABASE_URL=postgresql+psycopg://postgres:yourpassword@localhost:5432/infograph
SECRET_KEY=your_super_secret_key
OPENAI_API_KEY=your_openai_api_key
OLLAMA_BASE_URL=http://localhost:11434
CORS_ORIGINS=["http://localhost:8080","http://127.0.0.1:8080"]
```

Apply database migrations:
```sh
alembic upgrade head
```

Start the FastAPI server:
```sh
python -m uvicorn backend.app.main:app --reload --port 8000
```

### 3. Frontend Installation
Open a new terminal window at the project root:
```sh
npm install
npm run dev
```

The frontend will be available at `http://localhost:8080`.

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the issues page.
