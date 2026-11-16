# PeopleCare AI v2.4 — Integrated AI + Android foundation

## Included in this upgrade
- Project-aware RAG API: `POST /api/project/rag` (retrieves relevant source/docs by lexical relevance).
- RAG context automatically added to PeopleCare AI chat when relevant project files match.
- Project manifest: `GET /api/project/manifest`.
- Health audit endpoint: `GET /api/project/health` (model/vectorizer, dataset, report and provider status).
- Safe agent tool registry: `GET /api/agent/tools`.
- Allowlisted agent tool execution: `POST /api/agent/execute` with `project_health`, `dataset_summary`, `report_summary`, `project_search`.
- No arbitrary shell/code execution; agent tools are read-only and allowlisted.
- Capacitor Android dependency and `android:add`, `android:sync`, `android:open` scripts.
- Professional dashboard CSS upgrade from v2.3.

## Backend
From repository root:
```bash
python -m pip install -r requirements.txt
python -m app.app
```
If the root requirements file is absent, install the packages used by the existing backend:
```bash
python -m pip install flask pandas numpy scikit-learn joblib
```
Backend runs on the configured Flask port (see `app/app.py`).

## Frontend
```bash
cd frontend
npm install
npm run dev
```

## Android (requires Android Studio + Android SDK + JDK)
```bash
cd frontend
npm install
npm run android:add       # only once; creates android/ native project
npm run android:sync
npm run android:open
```
In Android Studio choose Build > Build APK(s). The APK is produced by Android Studio; it is not included in this source ZIP.
For a phone to reach a backend on your PC, set `VITE_API_BASE_URL` to the PC's LAN IP (e.g. `http://192.168.x.x:5000`) before building and ensure both devices are on the same network. Do not use localhost in the Android app for a PC-hosted backend.

## RAG limitations
This initial RAG uses a lightweight lexical retriever and indexes source/documentation files at request time. It is functional and dependency-light, but is not yet embedding-based semantic RAG. Qdrant/FAISS + embeddings can be added after benchmarking the user's machine and dataset. RAG is not allowed to read secrets, `.env`, binaries, or model pickle contents.

## Agent limitations / safety
Agent tools are allowlisted and read-only. They can inspect project health and summarize data; they do not modify files, deploy, or execute arbitrary commands. Any future write/build agent should use a sandbox, task logs, diff preview, and explicit user approval.

## Model verification
Use `GET /api/project/health` to check model/vectorizer availability. The existing classifier is preserved; actual inference can be checked with the existing `/predict` endpoint and a sample report.
