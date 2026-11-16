# PeopleCare AI agent and motion system

## Architecture

PeopleCare uses its existing React client, Flask API, server-side provider adapter, and installed V3 ML pipeline. The agent is intentionally small and deterministic: `app/agent_tools.py` selects up to three allowlisted tools from the message, and `app/app.py` executes those tools against the current application data. Tool results are inserted as clearly labeled data before the selected provider generates the answer. General questions do not trigger civic tools. No arbitrary shell, file-write, report mutation, or emergency-dispatch tool is available.

The streaming endpoint sends real provider deltas. A data-check status event is sent when a civic tool is selected; final stream metadata includes provider, model, timing, completion status, and the tools that actually ran. Provider failures remain explicit. Read-only application facts may still be returned in offline mode, identified as retrieved data rather than generated AI.

## Registered capabilities

| Tool | Data source | Limits |
| --- | --- | --- |
| `get_community_stats` | `/api/stats` and local report CSV | NYC 311 metrics remain labeled historical reference data. |
| `report_summary` | Local report CSV | Aggregate category, status, and priority counts. |
| `search_community_reports` | Local report CSV | Matches report text, category, prediction, location, or ticket internally; returns ticket metadata only, with description and location redacted. |
| `lookup_report_status` | Local report CSV | Requires a valid PeopleCare ticket ID; returns status and category metadata. |
| `community_report_insights` | Local report CSV | Observed category, priority, urgent-priority-by-category, and two 30-day window counts; no forecast is claimed. |
| `road_problem_analysis` | Local report CSV | Counts matched submissions; not a verified hazard map. |
| `search_blood_requests` | Local records in the Blood Assistance category | Shows redacted submission metadata only. It does not verify stock, match donors, or dispatch help. |
| `analyze_community_signals` | Precomputed NYC 311 signal CSV | Historical reference signals only, not current West Bengal activity. |
| `classify_complaint` | Installed V3 descriptor-only pipeline | Returns the model's category label; per-example explanations are unavailable and the NYC training domain is not validated for West Bengal. |
| `prepare_report` | User supplied text and optional installed V3 prediction | Returns an unsaved draft. The user must submit through the existing report workflow. |
| `emergency_guidance` | Configured India guidance | For an immediate emergency, directs the user to 112; PeopleCare does not place calls or dispatch responders. |
| `resource_lookup` | Configured public resource directory | Directory information should be checked for local availability. |
| `project_health`, `dataset_summary`, `project_search` | Existing application callbacks and repository files | Project search is read-only and restricted to the existing text/source extension allowlist. |

Tool telemetry records only the tool name, success state, and elapsed time; it does not log user text or tool arguments. The `/api/agent/execute` endpoint is read-only, allowlisted, input checked, and rate limited using `PEOPLECARE_AGENT_RPM` (60 requests/minute by default). Sensitive or irreversible actions are not offered by this agent interface.

## Conversation and provider behavior

- Conversation sessions are stored in browser `localStorage`; they can be created, renamed, selected, and deleted there. The server does not provide cross-device or long-term memory.
- The current session's recent turns are bounded before sending to the provider. The configured cloud-compatible provider or Ollama receives the message, relevant history, and only applicable tool data.
- English and Hindi messages pass through to the configured model. Answer quality and Hindi capability depend on the selected model.
- Speech recognition and speech synthesis use browser APIs after the user enables them. Browser support and installed voices vary.
- Local environment checked during this update: Ollama `qwen3:4b-instruct`; no cloud API key is configured. Configure `PEOPLECARE_PROVIDER`, `PEOPLECARE_LOCAL_MODEL`, or the server-side cloud fields in `.env` as appropriate. Never put provider secrets in frontend variables.

## Performance and data limits

Ollama model warm-up and keep-alive are already used. Project documents are cached per backend process after first retrieval. Tool execution is bounded to three tools per user turn. The CSV store is appropriate for this local student project but is not a multi-process transactional database.

Live streamed test on this machine after a backend restart:

- General arithmetic question: first chunk observed at 12,520 ms; total 13,455 ms.
- Local report-count question through the Vite proxy after the final routing change: first chunk observed at 19,552 ms; server total 20,520 ms. It ran `get_community_stats` and `report_summary`.
- These measurements reflect one run on the current local Ollama/hardware configuration. They do not meet the 1–2 second first-token target and are not a guarantee. Cloud provider, hardware, model load, and network latency change the result.

## Motion and accessibility

`frontend/src/index.css` contains shared page-entry, surface reveal, focus, and button feedback rules. The existing keyed page content replays its entry transition on navigation; existing cards, dialogs, chat messages, and avatar states retain their component-specific animations. `prefers-reduced-motion: reduce` disables animation and transition effects globally. The implementation uses CSS and adds no animation dependency.

Both active PeopleCare AI views now use the procedural male 3D character with idle, blink, listening, thinking, greeting, and speaking poses. It is a stylized Three.js model, not a photoreal or rigged human. The GLB loader can use a supplied model and its clips via `VITE_PEOPLECARE_AVATAR_URL`, but this repository does not contain a suitable rigged male GLB. Speaking mouth motion is an approximation, not phoneme/audio lip synchronization. The procedural model stops its continuous animation for reduced-motion preferences and while the page is hidden.

## Verification

Run the backend suite from the project root with `python tests\\test_backend_suite.py`, and frontend checks from `frontend` with `npm run lint` and `npm run build`. Tool integration tests use the isolated temporary CSV configured by the test suite; live application report data is not changed by those tests.
