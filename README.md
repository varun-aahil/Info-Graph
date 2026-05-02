# InfoGraph

Welcome to **InfoGraph** — a next-generation visual knowledge engine designed to help you organize, explore, and converse with massive collections of unstructured documents.

By combining cutting-edge high-dimensional data clustering with Interactive Retrieval-Augmented Generation (RAG), InfoGraph transforms your raw PDFs into an interactive, explorable universe.

---

## 🌟 Key Features

### 1. Visual Document Clustering
Upload your documents and watch them organize themselves. InfoGraph automatically computes semantic embeddings for every document and projects them onto an interactive 2D scatter plot using advanced clustering algorithms (like DBSCAN or K-Means).
- Spot hidden relationships between documents at a glance.
- Identify outliers and distinct topic groups immediately.
- Visually navigate through hundreds of files without losing context.

### 2. Auto-Titling Intelligence
You don't need to manually label anything. Once a cluster is formed, our built-in LLM pipeline analyzes the semantic contents of the group and automatically assigns a highly descriptive, human-readable title. 

### 3. Contextual Chat (Interactive RAG)
Click on any cluster, or any individual document node, to open a focused chat window. 
- Ask questions and get precise answers derived *only* from that specific cluster or document.
- The AI assistant streams responses token-by-token.
- Every answer is grounded in your source material, preventing hallucinations.

### 4. Seamless Synchronization
The interface is entirely reactive. Clicking on a previous chat session will automatically pan and zoom the scatter plot to the exact document or cluster you were discussing, keeping you perfectly oriented within your knowledge graph.

### 5. Universal Document Support & OCR
Got scanned PDFs? No problem. InfoGraph includes a robust fallback OCR (Optical Character Recognition) pipeline. If a document lacks an encoded text layer, the system will automatically convert the pages to images and extract the text for you, ensuring nothing slips through the cracks.

### 6. Flexible AI Backend
InfoGraph doesn't lock you into a single provider. You can hot-swap your intelligence layer directly from the Settings panel:
- Use **Cloud Models** like OpenAI or Gemini for maximum speed and capability.
- Switch to **Local Models** via Ollama for 100% private, offline processing where your data never leaves your machine.

### 7. Secure Multi-Tenant Architecture
Built for scale, InfoGraph features full user authentication via Email OTPs and Google OAuth. Every user operates within their own isolated workspace—meaning embeddings, documents, and chat sessions are strictly private and sandboxed.

---

## 🛠 Tech Stack

InfoGraph is built using a modern, robust stack optimized for machine learning and real-time interactions:

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Graph Visualization:** Plotly.js
- **Backend API:** FastAPI, Python 3.10+
- **Database:** PostgreSQL with the `pgvector` extension
- **Machine Learning:** scikit-learn, numpy, UMAP, Sentence-Transformers
- **Document Processing:** PyMuPDF, pytesseract, pdf2image

---

*InfoGraph turns your unorganized data into an explorable, intelligent map.*
