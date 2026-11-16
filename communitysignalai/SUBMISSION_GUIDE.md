# PeopleCare AI — Submission & Demo Guide

## Project summary
PeopleCare AI is a community-support prototype combining civic issue reporting, ML-assisted classification, report tracking, analytics, emerging-signal visualization, and an AI chat interface.

## Stack
- Frontend: React + Vite
- Backend: Python + Flask
- ML: scikit-learn (TF-IDF/classifier; see `models/` and `app/`)
- Persistence: CSV prototype storage under `outputs/`
- Optional conversational AI: configured provider or local Ollama (see `.env.example`)

## Windows quick start
1. Install Python 3.10+ and Node.js 20+.
2. In the project root, run:
   `python -m pip install -r requirements.txt`
3. Start backend in one terminal:
   `python -m app.app`
   (If your environment uses the provided launcher, `start_backend.bat` is also available.)
4. In another terminal:
   `cd frontend`
   `npm install`
   `npm run dev`
5. Open the local URL printed by Vite (normally `http://localhost:5173`).

## AI configuration
- Copy `.env.example` to `.env` and fill provider values only if you have a valid key.
- Never commit `.env` or expose keys in frontend code.
- Local Ollama is optional; install the model documented in README if using it.
- Without a configured model/provider, assistant replies may use a fallback/demo response.

## Demo limitations (state clearly in presentation)
- This is an academic prototype, not a production emergency dispatch system.
- Emergency assistance links/guidance do not automatically contact emergency services.
- Model outputs are decision-support predictions, not guaranteed diagnoses or validated local civic predictions.
- Some dashboard counts/visualizations may be demonstration or dataset-derived values; distinguish these from live user-submitted records.
- CSV storage is suitable for a demo, not concurrent production deployment.

## Before submission
- [ ] Confirm backend health endpoint and frontend launch.
- [ ] Submit one sample report and confirm it appears in report list.
- [ ] Test classification with 2–3 examples and capture output.
- [ ] Test assistant with provider configured (or document fallback).
- [ ] Replace any demo metrics with labeled metrics.
- [ ] Include screenshots, architecture, test cases, limitations, and future scope in report.
- [ ] Remove `.env`, API keys, private data, and local `node_modules` from ZIP.
