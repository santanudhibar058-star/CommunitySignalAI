# Beginner deployment guide: Vercel + Render

This project is split into two services:

- **Vercel** builds and serves the React/Vite website from `communitysignalai/frontend`.
- **Render** runs the Flask API from `communitysignalai` using the repository-root `render.yaml`.

Use the same GitHub repository for both services. The frontend calls the API through the public URL configured as `VITE_API_BASE_URL`.

## Before you publish

1. Confirm the newest source and deployment files are on the GitHub `main` branch. This local working folder is not currently connected to a Git checkout, so local changes do not automatically appear on GitHub. Review the changed files in GitHub Desktop before committing.
2. Never upload `.env`, passwords, API keys, VAPID private keys, `outputs/community_reports.csv`, or personal report data. The root and project `.gitignore` files exclude these. Review the GitHub changed-files list before publishing.
3. Create a **new, unique admin password** directly in Render. Do not use a password that has appeared in chat or a local environment file.
4. Back up any private local reports separately. The deployed service does not import or migrate local report files.

## Important: free Render is only a preview

Render Free web services sleep after 15 minutes without traffic and may take about a minute to wake. Their local filesystem is temporary: report CSVs, notifications, push subscriptions, and audit records can be lost when the service sleeps, restarts, or redeploys. Do not use the free service for real community reports or rely on it as durable admin storage. A persistent Render disk requires a paid service; the current app has not been migrated to a durable database. See [Render's free service limits](https://render.com/docs/free) and [persistent disks](https://render.com/docs/disks).

Vercel's static frontend does not store backend reports. Existing local report files are ignored by Git and will not be deployed.

## Step 1 — Deploy the Flask API on Render

1. Sign in at [Render](https://dashboard.render.com/) and choose **New → Blueprint**.
2. Connect `santanudhibar058-star/CommunitySignalAI` and choose the `main` branch.
3. Render reads the root `render.yaml`. Check that it creates **one Python Web Service**, with:

   | Setting | Value |
   | --- | --- |
   | Root directory | `communitysignalai` |
   | Build command | `pip install -r requirements.txt` |
   | Start command | `gunicorn --chdir app --bind 0.0.0.0:$PORT --worker-class gthread --workers 1 --threads 4 --timeout 120 app:app` |
   | Health check | `/api/health` |
   | Plan | Free preview |

4. Set the `PEOPLECARE_ADMIN_PASSWORD` secret when Render asks. Generate a fresh password and save it in a password manager; do not put it in GitHub or a `VITE_*` variable.
5. Create the service and wait for the first deploy. Copy its URL, for example `https://peoplecareai-santanu-api.onrender.com`.
6. Open `<Render URL>/api/health`. It should return JSON with `status: online`, `model_loaded: true`, and `vectorizer_loaded: true`.

The start command changes into `app/` because both `app.py` and its `peoplecare_backend.py` module are stored there. The Flask app resolves datasets and model files from the project root using its absolute file path.

## Step 2 — Deploy the Vite frontend on Vercel

1. Sign in at [Vercel](https://vercel.com/dashboard), choose **Add New → Project**, and import `santanudhibar058-star/CommunitySignalAI`.
2. Set the project options:

   | Setting | Value |
   | --- | --- |
   | Framework preset | Vite |
   | Root directory | `communitysignalai/frontend` |
   | Install command | `npm ci` |
   | Build command | `npm run build` |
   | Output directory | `dist` |
   | Node.js version | 22.x |

3. Add this environment variable for **Production** (and Preview too if you want preview deployments to call the same API):

   | Name | Value |
   | --- | --- |
   | `VITE_API_BASE_URL` | Render API origin, e.g. `https://peoplecareai-santanu-api.onrender.com` |

   Use the API origin only: no trailing slash and no `/api` suffix. The frontend already adds endpoint paths. This is a public URL, not a secret. Never put an AI key or admin password in a `VITE_*` variable.

4. Deploy and copy the Vercel domain, such as `https://community-signal-ai.vercel.app`.
5. In Vercel, add or edit `VITE_API_BASE_URL` if needed, then redeploy so the production bundle contains the Render API URL.

`communitysignalai/frontend/vercel.json` includes the SPA rewrite so direct links such as `/admin` still load after a refresh. This follows [Vercel's SPA rewrite guidance](https://vercel.com/docs/project-configuration/vercel-json#rewrites).

## Step 3 — Allow the Vercel origin in Flask CORS

1. In Render, open the API service → **Environment**.
2. Add:

   | Name | Value |
   | --- | --- |
   | `PEOPLECARE_CORS_ORIGINS` | Exact Vercel origin, e.g. `https://community-signal-ai.vercel.app` |

   Enter only the origin (scheme and domain), without a path or trailing slash. If you use a Vercel preview domain, add each trusted preview origin explicitly as a comma-separated value. Do not use `*`.

3. Save and let Render redeploy. Refresh the Vercel page and check the browser console/network panel for CORS errors.

## Backend environment settings

The Blueprint sets these non-secret values:

| Variable | Value | Why |
| --- | --- | --- |
| `PEOPLECARE_ENV` | `production` | Production safety behavior |
| `PEOPLECARE_HOST` | `0.0.0.0` | Service bind configuration |
| `PEOPLECARE_DEBUG` | `false` | Keep the Flask debugger disabled |
| `PEOPLECARE_ADMIN_DEV_BYPASS` | `false` | Never bypass admin authentication on a host |
| `PEOPLECARE_PROVIDER` | `openai_compatible` | Do not expect a local Ollama daemon on Render |
| `PEOPLECARE_OLLAMA_PRELOAD` | `false` | Avoid trying to start a local model on Render |
| `PEOPLECARE_ADMIN_PASSWORD` | Set privately in Render | Protects the admin API |
| `PEOPLECARE_CORS_ORIGINS` | Set after Vercel deploy | Allows the deployed frontend origin |

### Optional cloud AI

Ollama running on your PC is not available inside Render. To use cloud chat, add a supported provider's server-side `PEOPLECARE_API_KEY` in Render → Environment. Configure `PEOPLECARE_API_BASE` and `PEOPLECARE_MODEL` if needed. Without a valid cloud key, general chat must report that its provider is unavailable; ML prediction and the other configured API features can still run. Never add provider credentials to GitHub or Vercel.

### Optional phone push alerts

Web Push needs a VAPID public key, private key, and subject configured on the Flask service. Generate keys locally with `python scripts/generate_vapid_keys.py`, then add the values to Render's environment. Store the private key only in Render. After HTTPS is deployed, open `/admin` on the phone, sign in, enable alerts, and grant browser notification permission. Browser/OS settings control sound and vibration; the site cannot force an alarm.

## Step 4 — Check the live app

1. Open the Vercel URL and confirm the dashboard renders.
2. Open the Vercel URL with `/admin` and refresh; it should serve the app rather than a 404.
3. Open the Render `/api/health` endpoint and confirm the model and vectorizer loaded.
4. From the website, submit a clearly labeled test report only if you accept that the free service's local data can disappear. Confirm it appears in the admin view, then do not treat it as a permanent record.
5. Check admin login with the Render-only password and verify an incorrect password is rejected.
6. Test AI chat only after configuring a cloud provider key. Do not expect the Render service to reach local Ollama.

## Local checks before publishing

From the repository root:

```powershell
cd communitysignalai/frontend
npm ci
npm run lint
npm run build
cd ..
python tests\test_backend_suite.py
```

The current local checks passed in this workspace: frontend lint, Vite production build, and all 121 backend/ML suite checks. Re-run them after changing the source or dependencies.

## If a deploy fails

- **Render import error for `peoplecare_backend`:** confirm the service root is `communitysignalai` and use the exact `--chdir app app:app` start command above.
- **Vercel `/admin` returns 404 on refresh:** confirm the root directory is `communitysignalai/frontend` and `frontend/vercel.json` is on GitHub.
- **Browser CORS error:** set `PEOPLECARE_CORS_ORIGINS` to the exact Vercel origin in Render and wait for redeploy.
- **Frontend cannot reach API:** check `VITE_API_BASE_URL` in Vercel, then redeploy the frontend.
- **Chat says provider unavailable:** add a valid backend cloud key; Render does not include your local Ollama installation.
- **Reports disappear:** this is the known free service storage limit. Stop accepting real reports and arrange durable storage before using the site for real community activity.
