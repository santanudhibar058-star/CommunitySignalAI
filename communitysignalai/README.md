# CommunitySignal AI / PeopleCare AI

A student project prototype for community problem reporting, ML-based complaint classification, community signals, analytics, report management, and assistance navigation.

## Features
- React + Vite dashboard (existing interface retained)
- Flask REST API and CSV-backed report persistence
- TF-IDF + trained classifier for text categorization (`/predict`)
- Reports: submit, search/filter, update status, and delete
- Protected admin console at `/admin` for report operations, live system status, and recent admin audit events
- Stable human-readable ticket IDs (`PC-YYYYMMDD-XXXXXX`) alongside numeric API IDs
- PeopleCare AI conversational assistant with context/history
- Optional OpenAI-compatible cloud chat provider; local Ollama fallback
- Emergency/assistance pages are guidance and navigation only; they do **not** dispatch responders

## Requirements
- Python 3.10+
- Node.js 20+ (compatible with the installed Vite version)
- For local chatbot: Ollama installed and model `qwen3:4b` downloaded

## Run on Windows
1. Open a terminal in this project folder.
2. Install backend dependencies (adjust package names if your existing environment uses another requirements file):
   `pip install flask pandas numpy scikit-learn joblib`
3. Start local AI (optional fallback): install Ollama, then run `ollama pull qwen3:4b`.
4. Start Flask: `cd app` then `python app.py`. Keep this terminal open.
5. In a second terminal: `cd frontend`, run `npm install`, then `npm run dev`.
6. Open the Vite URL shown in the terminal (usually `http://localhost:5173`).

## Use a cloud AI model (optional)
1. Copy `.env.example` to `.env` in the project root.
2. Set `PEOPLECARE_API_KEY` to your provider key and optionally set model/base URL.
3. Restart Flask. The key is used server-side only. **Never put API keys in React/Vite files or publish `.env`.**
4. If no key is configured, PeopleCare AI uses local Ollama (`qwen3:4b`).

## Report workflow
- Reports are stored in `outputs/community_reports.csv`.
- Numeric `id` remains for existing API routes; `ticket_id` is the display/reference ID.
- Statuses: Pending → Under Review → Assigned → In Progress → Resolved (or Rejected).
- Keep a backup of `outputs/community_reports.csv` before editing/deleting records.

## Admin console and access
- Open `http://localhost:5173/admin` while the Vite frontend and Flask backend are running.
- Set a strong password on `PEOPLECARE_ADMIN_PASSWORD=` in the server-side project `.env` (next to this README). Keep the password private; do not put it in `VITE_*` settings or commit `.env`. The older `PEOPLECARE_ADMIN_TOKEN` setting remains supported for compatibility.
- Restart Flask after changing `.env`, then enter the password on `/admin`. It is held in browser memory for the current page session and sent only to the backend for protected API requests.
- If verification returns HTTP 404, stop the existing Flask process and restart it from this project with `start_backend.bat`; an older process may still be serving port 5000 without the current admin routes. The API returns 401 for a missing/invalid password and confirms a valid password with `GET /api/admin/verify`.
- To view the live Admin Console on a phone, deploy the frontend and Flask API behind one public HTTPS origin. On the deployed `/admin` page, scan the QR code or share the secure link, then sign in with the same server password. The admin interface is responsive and shows the same protected reports, status controls, analytics, and activity history. A local `localhost` address is only reachable by the computer running it, so the local screen intentionally does not offer a scannable phone QR.
- For phone push alerts, keep the three `PEOPLECARE_VAPID_*` values configured on Flask and in the hosting service. After opening `/admin` on the phone, press **Enable phone alerts** and allow notifications. The browser creates a private device subscription; no phone number is needed. Alerts cover report submissions and help-section interactions. Opening emergency guidance is only an interaction, not a confirmed emergency or dispatch. Push alerts contain event type/category and ticket reference only, not report text, location, name, or phone number.
- Web Push requires HTTPS, a supported browser, notification permission, and a reachable push-capable backend. On iOS/iPadOS, add the site to the Home Screen and use the installed web app (Web Push is supported there from iOS/iPadOS 16.4); Android browsers must support Web Push. See [Apple Web Push requirements](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers) and [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API). The **Send test alert** button can verify a subscribed device. Phone/OS settings control sound and vibration; the website cannot force a loud alarm or bypass Do Not Disturb.
- Use `python scripts/generate_vapid_keys.py` once to create the VAPID key pair. The script updates only the VAPID entries in the ignored local `.env` and does not print the private key. Keep the generated keys stable after devices subscribe; copy them into the hosting environment without committing the private key. The report CSV and push subscriptions/history are stored under `outputs/`, so the free host must provide persistent storage or those records can be lost on restart/redeploy.
- For a trusted, direct loopback-only local demo with no admin token, `PEOPLECARE_ADMIN_DEV_BYPASS=true` may be enabled while `PEOPLECARE_HOST=127.0.0.1`. Leave it `false` for normal use. Forwarded requests and non-loopback Host headers are rejected; do not enable the bypass behind a reverse proxy or on a public host.
- Flask's interactive debugger is disabled by default and is refused for public bind addresses or `PEOPLECARE_ENV=production`; keep `PEOPLECARE_DEBUG=false` outside local development.
- Admin report changes append minimal audit records to `outputs/admin_audit.jsonl`; the log stores action, report ID, and changed field names, not report text or credentials.
- This project has no user-account/role database or management API. Emergency, blood, and civic-resource registries also have no admin management APIs, so those controls are not represented as available in the console.
- Report data is still CSV-backed. Keep a backup before destructive report changes; the console confirms a delete before sending it.

## API quick reference
- `GET /api/health`
- `GET /api/admin/verify` (server-configured admin password required)
- `GET /api/admin/notifications` (admin-only, allowlisted activity feed)
- `GET /api/admin/push/config`, `POST /api/admin/push/subscribe`, `POST /api/admin/push/unsubscribe` (admin-only)
- `POST /api/activity` (allowlisted, rate-limited interaction event; stores no user content)
- `POST /predict` (JSON `{ "report": "..." }`)
- `GET /api/reports`
- `POST /api/reports` (JSON report/category/location/priority)
- `PUT /api/reports/<numeric_id>` (JSON editable fields/status)
- `DELETE /api/reports/<numeric_id>`
- `POST /api/peoplecare/chat` (JSON message/history/context)

## Academic/demo transparency
- The classification model is trained on the included NYC 311 dataset. It is a demonstration model, not a validated West Bengal/local emergency classifier.
- Dashboard indicators and historical analytics may include dataset-derived/demo metrics; label them accordingly in presentations.
- Emergency buttons provide links/information; the app does not contact police, ambulance, fire services, or blood donors automatically.
- A local LLM's speed/quality depends on available RAM/CPU/GPU. Cloud AI quality/speed depends on provider, model, network, and account limits.

## Submission checklist
- Replace demo/placeholder metrics with clearly labelled values or your own local data.
- Add screenshots, test cases/results, project architecture, limitations, and future scope to the report/PPT.
- Do not submit private API keys, `.env`, or personal data.
