# Render deployment

This repository contains the application under `communitysignalai/`; the GitHub repository root also contains a short `README.md`. A root-level `render.yaml` provisions the React site and Flask API from that nested project folder.

## Important data and service limits

The reports, admin notifications, push subscriptions, and audit records are currently CSV/JSON files. Render Free web services have an ephemeral filesystem, so these records are lost on restart, redeploy, or spin-down. Use the Free deployment only as a preview with test data. Do not accept real community reports until the API has durable storage.

To keep the existing file-based persistence without changing the app's storage format, use a paid Render web service with a persistent disk mounted at `/var/data`, then set `PEOPLECARE_DATA_DIR=/var/data`. The model, historical datasets, and precomputed signal data remain read from the repository. A database migration is another option, but this project does not currently use a database. Render Free Postgres expires after 30 days, so it is not durable production storage.

Free API services also sleep after inactivity and can take about a minute to wake. Use the paid plan if the site needs consistently available responses.

## Create both services from the Blueprint

1. Push the repository with the root `render.yaml` to GitHub.
2. In Render, choose **New → Blueprint**, connect `santanudhibar058-star/CommunitySignalAI`, and select its default branch.
3. Review the two services. The Blueprint sets both compute services to Free for preview use and links the frontend API URL and backend CORS origin using Render service references.
4. Set `PEOPLECARE_ADMIN_PASSWORD` in the backend's secret prompt to a new, unique, strong password. Do not reuse a password that has appeared in chat or a local `.env` file.
5. If you have an OpenAI-compatible provider, set `PEOPLECARE_API_KEY` in the backend Environment page. Without it, the backend will start but cloud chat will report that the provider is not configured; Ollama is not installed or assumed on Render. Set `PEOPLECARE_API_BASE` and `PEOPLECARE_MODEL` if your provider is not OpenAI-compatible at the default endpoint/model.
6. Apply the Blueprint and wait for the API and static site deploys to finish.

If the Blueprint's service references cannot resolve in your Render workspace, deploy in this order manually: create the API, copy its public URL into the static site's `VITE_API_BASE_URL`, create the static site, then set the static site's public origin in the API's `PEOPLECARE_CORS_ORIGINS` and redeploy both.

## Exact service settings

| Setting | Frontend | Backend |
| --- | --- | --- |
| Service type | Static Site | Web Service, Python |
| Root directory | `communitysignalai/frontend` | `communitysignalai` |
| Build command | `npm ci && npm run build` | `pip install -r requirements.txt` |
| Publish directory | `dist` | — |
| Start command | — | `gunicorn --chdir app --worker-class gthread --workers 1 --threads 4 --timeout 120 app:app --bind 0.0.0.0:$PORT` |
| Health check | — | `/api/health` |
| Rewrite | `/*` → `/index.html` | — |

The single Gunicorn worker keeps the existing process-local CSV/JSON locks coherent. The frontend uses Vite's default `/` asset base and the API helper reads `VITE_API_BASE_URL` at build time. The Vite development proxy remains for local development only.

## Environment variables

### Backend

| Name | Value / purpose |
| --- | --- |
| `PEOPLECARE_ENV` | `production` |
| `PEOPLECARE_HOST` | `0.0.0.0` |
| `PEOPLECARE_DEBUG` | `false` |
| `PEOPLECARE_ADMIN_DEV_BYPASS` | `false` |
| `PEOPLECARE_ADMIN_PASSWORD` | Required. Set a fresh, unique secret in Render; never commit it. |
| `PEOPLECARE_PROVIDER` | `openai_compatible` so deployment does not try local Ollama. |
| `PEOPLECARE_API_KEY` | Optional for service startup; required for cloud AI responses. Store only in Render's Environment settings. |
| `PEOPLECARE_API_BASE` | Optional; default OpenAI API base URL. |
| `PEOPLECARE_MODEL` | Optional; default model is `gpt-4o-mini`. Use a model enabled for your provider. |
| `PEOPLECARE_CORS_ORIGINS` | Set by the Blueprint to the frontend's public HTTPS origin. |
| `PEOPLECARE_DATA_DIR` | Optional; for a paid persistent disk, set to its mount path such as `/var/data`. Do not set this on Free expecting persistence. |
| `PEOPLECARE_VAPID_PUBLIC_KEY` | Optional; required for phone/browser push alerts. |
| `PEOPLECARE_VAPID_PRIVATE_KEY_B64` | Optional secret; generate and store only in Render. |
| `PEOPLECARE_VAPID_SUBJECT` | Optional; e.g. `mailto:admin@example.com`. |

The model artifacts and NYC 311 reference data are versioned under `models/`, `data/`, and `outputs/community_signal_results.csv`. The app loads them relative to its project directory; no Windows paths or model download step is needed.

### Frontend

| Name | Value / purpose |
| --- | --- |
| `VITE_API_BASE_URL` | The public HTTPS origin of the Flask service, without a trailing `/api`. The Blueprint wires this to the backend service URL. |
| `NODE_VERSION` | `22.15.0`, pinned by the Blueprint for Vite 8 compatibility. |

Only public URLs belong in `VITE_*` variables. Never put an AI key, admin password, or VAPID private key in frontend variables.

## Verify after deployment

1. Open the static site's `onrender.com` URL. The homepage should render the existing React application.
2. Open `/admin` directly and refresh to verify the SPA rewrite serves `index.html`.
3. Open `https://<api-service>.onrender.com/api/health`; it should return JSON with `status: online`, `model_loaded: true`, and `vectorizer_loaded: true`.
4. Verify a valid admin password with the Admin Console and confirm a wrong password is rejected.
5. Submit only a clearly marked test report until durable storage is configured. On a Free service, that record will not survive service restart or spin-down.
6. Cloud AI can be tested only after setting a valid provider key. Ollama on your PC is not reachable from Render by default.

## Existing local data and phone alerts

The private local `.env`, report CSV, admin logs, and push subscriptions are ignored by Git and are not uploaded by this deployment setup. Existing local reports are not automatically migrated. Back them up and choose a secure migration process after selecting durable hosted storage.

For phone push alerts, use HTTPS, generate a VAPID key pair with `scripts/generate_vapid_keys.py`, add the public/private key and subject to the backend environment, sign into the deployed admin panel on the phone, and grant notification permission. Browsers may restrict push delivery when the site is not installed or notification permission is denied.
