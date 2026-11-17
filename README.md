# CommunitySignalAI

**PeopleCare AI** is a community-support prototype for reporting civic issues, reviewing community signals, and finding assistance resources. This repository keeps the existing React frontend and Flask API together; Vercel serves the frontend and Render runs the API.

> This is a student/demo project. Emergency pages provide guidance and links; the app does not dispatch responders. The complaint model is trained on NYC 311 data and has not been validated for West Bengal reports.

## Start here

- Application source and local setup: [`communitysignalai/README.md`](communitysignalai/README.md)
- Beginner-friendly Vercel + Render guide: [`communitysignalai/RENDER_DEPLOYMENT.md`](communitysignalai/RENDER_DEPLOYMENT.md)
- ML evaluation and limitations: [`communitysignalai/ML_EVALUATION_REPORT_v3.md`](communitysignalai/ML_EVALUATION_REPORT_v3.md)

## What is in the project?

| Folder | Contents |
| --- | --- |
| `communitysignalai/frontend/` | React 19 + Vite website and Android client source |
| `communitysignalai/app/` | Flask API, reports, admin endpoints, and health checks |
| `communitysignalai/models/` | Existing TF-IDF/classifier artifacts used by the API |
| `communitysignalai/data/` | NYC 311 reference dataset and prepared data |
| `communitysignalai/outputs/` | Precomputed signal data; private local report files are ignored by Git |
| `communitysignalai/tests/` | Backend, ML preprocessing, and integration checks |

## Run locally on Windows

Requirements: Python 3.13.3, Node.js 22 or newer, and Git (optional Ollama for local chat).

1. Open PowerShell in this repository folder.
2. Install backend packages:

   ```powershell
   cd communitysignalai
   python -m pip install -r requirements.txt
   ```

3. Start Flask from the `communitysignalai` folder:

   ```powershell
   python -m app.app
   ```

4. Open a second PowerShell window in `communitysignalai/frontend` and run:

   ```powershell
   npm ci
   npm run dev
   ```

5. Open the Vite URL shown in the terminal (normally `http://localhost:5173`). Vite proxies `/api` and `/predict` to Flask on port 5000 for local development.

Check the backend at `http://127.0.0.1:5000/api/health`. For admin access, set a new local `PEOPLECARE_ADMIN_PASSWORD` in the ignored `communitysignalai/.env` file. Do not reuse a password shared in chat.

## Deploy the split application

The checked-in [`render.yaml`](render.yaml) configures the Flask API only. Vercel serves `communitysignalai/frontend`; `communitysignalai/frontend/vercel.json` contains the single-page-app refresh rule. Follow [`communitysignalai/RENDER_DEPLOYMENT.md`](communitysignalai/RENDER_DEPLOYMENT.md) for the exact dashboard settings, environment variables, and deployment checks.

The free Render API is suitable for a preview only: it sleeps when idle and has temporary file storage. Do not collect real reports until durable storage and a safe migration of any local reports are arranged. See the deployment guide for details.

## Keep the repository safe

- Never commit `.env`, passwords, API keys, VAPID private keys, or private report data.
- The root `.gitignore` excludes local backups, ZIP exports, generated build folders, and runtime report records. It keeps the actual source, datasets, and model artifacts available to the app.
- Before publishing, review GitHub's changed-files list and confirm no private data or credentials are included.

## Upload updates with GitHub Desktop

This local working folder is not connected to Git, so changes made here are not yet on GitHub. To update the repository that already exists:

1. Open GitHub Desktop and sign in.
2. Choose **File → Clone repository → URL** and enter `https://github.com/santanudhibar058-star/CommunitySignalAI.git`.
3. Clone it into a **new, separate folder**. Do not clone over this working folder.
4. Copy these updated files from this working folder into the cloned repository, keeping the same folder paths: `README.md`, `.gitignore`, `render.yaml`, `communitysignalai/.gitignore`, `communitysignalai/requirements.txt`, `communitysignalai/RENDER_DEPLOYMENT.md`, and `communitysignalai/frontend/vercel.json`.
5. In GitHub Desktop, review the changed-file list. Do not continue if `.env`, private report CSVs, backups, ZIPs, `node_modules`, or `dist` appear.
6. Enter a short summary such as `Prepare Vercel and Render deployment`, click **Commit to main**, then **Push origin**.

The original working folder remains separate and unchanged by the clone step. After the commit reaches GitHub, connect that repository to Vercel and Render using the deployment guide above.
