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
python -m uvicorn app.main:app --reload --port 8000
```

### 3. Frontend Installation
Open a new terminal window at the project root:
```sh
npm install
npm run dev
```

The frontend will be available at `http://localhost:8080`.

## ☁️ Deploy for Free (Cloud Hosting)

You can easily host this entire stack for **free** using modern cloud providers:

### 1. Database: Supabase (Free Tier)
1. Create a free account at [Supabase](https://supabase.com/).
2. Create a new project and navigate to Database settings to retrieve your `DATABASE_URL` (Connection String).
3. Supabase comes with `pgvector` pre-installed! Run your Alembic migrations against this database URL locally:
   `DATABASE_URL="your-supabase-url" alembic upgrade head`

### 2. Backend: Render (Free Web Service)
1. Create a free account at [Render](https://render.com/).
2. Connect your GitHub repository and create a new **Web Service**.
3. Choose **Docker** as the environment (Render will automatically detect your `backend/Dockerfile`).
4. Set the Root Directory to `backend` (if needed, though the Dockerfile handles context).
5. Add your Environment Variables:
   - `DATABASE_URL`: Your Supabase connection string
   - `CORS_ORIGINS`: `["https://your-frontend-url.vercel.app"]`
   - `OPENAI_API_KEY`: Your API key

### 3. Frontend: Vercel or Netlify (Free Tier)
1. Connect your repository to [Vercel](https://vercel.com/) or Netlify.
2. The platform will auto-detect Vite.
3. Add the Environment Variable:
   - `VITE_API_BASE_URL`: `https://your-backend-url.onrender.com/api/v1`
4. Deploy!

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the issues page.
