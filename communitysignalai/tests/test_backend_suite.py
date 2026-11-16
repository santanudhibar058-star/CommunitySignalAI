import sys
from pathlib import Path
import json
import tempfile
from concurrent.futures import ThreadPoolExecutor

# Add app directory to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "app"))

import app as backend
import peoplecare_backend as assistant_backend
from app import app, model, vectorizer

TEST_STORAGE = tempfile.TemporaryDirectory(prefix="peoplecare-test-")
backend.REPORTS_PATH = Path(TEST_STORAGE.name) / "community_reports.csv"
backend.ADMIN_PASSWORD = "test-admin-password-only"
backend.ADMIN_AUDIT_PATH = Path(TEST_STORAGE.name) / "admin_audit.jsonl"
backend.ADMIN_NOTIFICATIONS_PATH = Path(TEST_STORAGE.name) / "admin_notifications.json"
backend.ADMIN_PUSH_SUBSCRIPTIONS_PATH = Path(TEST_STORAGE.name) / "admin_push_subscriptions.json"
backend.ensure_reports_file()
# Tests use deterministic offline fallback and never make provider/network calls.
assistant_backend.GEMINI_API_KEY = ""
assistant_backend.CLOUD_API_KEY = ""
assistant_backend.is_ollama_available = lambda: False

def run_tests():
    print("=" * 60)
    print("PEOPLECARE AI — AUTOMATED BACKEND & ML TEST SUITE")
    print("=" * 60)

    client = app.test_client()
    passed = 0
    total = 0

    def test(name, condition, details=""):
        nonlocal passed, total
        total += 1
        if condition:
            passed += 1
            print(f"  [PASS] {name} {details}")
        else:
            print(f"  [FAIL] {name} {details}")

    # 1. Test ML Model Loading
    print("\n--- 1. ML Model & Vectorizer Verification ---")
    test("Model object exists", model is not None)
    test("Vectorizer object exists", vectorizer is not None)

    # 2. Test Health Endpoint
    print("\n--- 2. Health & System API ---")
    res = client.get("/api/health")
    test("Health status code 200", res.status_code == 200)
    data = res.get_json() or {}
    test("Health report model_loaded == True", data.get("model_loaded") is True)
    test("Health report vectorizer_loaded == True", data.get("vectorizer_loaded") is True)

    # 3. Test Real ML Prediction
    print("\n--- 3. Real ML Inference Pipeline ---")
    sample_text = "Street light broken and dark intersection at night"
    res = client.post("/predict", json={"report": sample_text})
    test("Predict status code 200", res.status_code == 200)
    pdata = res.get_json() or {}
    prediction = pdata.get("prediction") or pdata.get("predicted_problem")
    confidence = pdata.get("confidence")
    test("Prediction produced valid category", bool(prediction), f"-> '{prediction}'")
    test("Prediction returned valid confidence", confidence is not None, f"-> {confidence}%")
    test("Inference identifies corrected V3 model", pdata.get("model_version") == "v3-descriptor-only")
    test("Classifier clearly identifies its local-domain limitation", pdata.get("validated_for_local_reports") is False and "not validated" in pdata.get("domain_warning", "").lower())
    test("Blank prediction input is rejected", client.post("/predict", json={"report": " "}).status_code == 400)
    test("Oversized prediction input is rejected", client.post("/predict", json={"report": "x" * 4001}).status_code == 400)
    test("AI report classifier rejects blank descriptions", client.post("/api/reports/classify", json={"description": " "}).status_code == 400)
    original_report_classifier = backend.classify_civic_report
    backend.classify_civic_report = lambda text, domain="general": "Waterlogging / drainage" if domain == "road" else "Water System"
    ai_preview = client.post("/api/reports/classify", json={"description": "Water is leaking from the street pipe", "domain": "general"})
    road_preview = client.post("/api/reports/classify", json={"description": "Deep pothole near the bus stop", "domain": "road"})
    backend.classify_civic_report = original_report_classifier
    test("General report classifier returns a real allowlisted provider result", ai_preview.status_code == 200 and (ai_preview.get_json() or {}).get("ai_category") == "Water System")
    test("Road classifier uses the road-specific category taxonomy", road_preview.status_code == 200 and (road_preview.get_json() or {}).get("ai_category") == "Waterlogging / drainage")

    # 4. Test Signals API
    print("\n--- 4. Signals Intelligence API ---")
    res = client.get("/api/signals")
    test("Signals status code 200", res.status_code == 200)
    signals = res.get_json() or []
    test("Signals returned list", isinstance(signals, list))
    if signals:
        top = signals[0]
        test("Top signal contains complaint_type", "complaint_type" in top, f"-> {top.get('complaint_type')}")
        test("Top signal has community_signal_score", "community_signal_score" in top, f"-> score {top.get('community_signal_score')}")

    # 5. Test Stats API
    print("\n--- 5. Dashboard Statistics API ---")
    res = client.get("/api/stats")
    test("Stats status code 200", res.status_code == 200)
    sdata = res.get_json() or {}
    test("Live report total reflects isolated empty store", sdata.get("total_reports") == 0)
    test("Unsupported model accuracy is not fabricated", sdata.get("ai_accuracy") is None)

    # 6. Test Categories API
    print("\n--- 6. Category Analytics API ---")
    res = client.get("/api/categories")
    test("Categories status code 200", res.status_code == 200)
    cats = res.get_json() or []
    test("Categories returned items", len(cats) > 0, f"-> {len(cats)} categories")

    # 7. Test Reports CRUD
    print("\n--- 7. Reports CRUD Pipeline ---")
    test("Report list requires admin authorization", client.get("/api/reports").status_code == 401)
    test("Admin overview requires admin authorization", client.get("/api/admin/overview").status_code == 401)
    test("Admin audit history requires admin authorization", client.get("/api/admin/audit-logs").status_code == 401)
    test("Admin activity feed requires admin authorization", client.get("/api/admin/notifications").status_code == 401)
    test("Phone push configuration requires admin authorization", client.get("/api/admin/push/config").status_code == 401)
    test("Phone test alert requires admin authorization", client.post("/api/admin/push/test").status_code == 401)
    activity_response = client.post("/api/activity", json={"event_type": "emergency_help_opened", "phone": "private-test-number", "location": "private test address"})
    test("Allowlisted emergency interaction is recorded", activity_response.status_code == 202)
    unsupported_activity = client.post("/api/activity", json={"event_type": "arbitrary_event", "description": "do not store"})
    test("Arbitrary public activity is rejected", unsupported_activity.status_code == 400)
    admin_headers = {"Authorization": "Bearer test-admin-password-only"}
    activity_data = client.get("/api/admin/notifications", headers=admin_headers).get_json() or {}
    activity_events = activity_data.get("events", [])
    test("Activity feed stores the safe allowlisted event only", bool(activity_events) and activity_events[0].get("event_type") == "emergency_help_opened" and "private-test-number" not in json.dumps(activity_events) and "private test address" not in json.dumps(activity_events))
    push_config = client.get("/api/admin/push/config", headers=admin_headers)
    push_config_data = push_config.get_json() or {}
    test("Push status never includes private key material", push_config.status_code == 200 and "private_key" not in json.dumps(push_config_data).lower())
    saved_push_state = (backend.WEB_PUSH_CONFIGURED, backend.PUSH_EXECUTOR)
    backend.WEB_PUSH_CONFIGURED = True
    backend.ADMIN_PUSH_SUBSCRIPTIONS_PATH.write_text("[]", encoding="utf-8")
    test("Phone test alert asks for a subscribed device before queuing", client.post("/api/admin/push/test", headers=admin_headers).status_code == 409)
    backend.WEB_PUSH_CONFIGURED, backend.PUSH_EXECUTOR = saved_push_state
    admin_overview = client.get("/api/admin/overview", headers=admin_headers)
    admin_data = admin_overview.get_json() or {}
    test("Authorized admin overview reports real model state", admin_overview.status_code == 200 and admin_data.get("model_version") == "v3-descriptor-only")
    verify_authorized = client.get("/api/admin/verify", headers=admin_headers)
    test("Admin verification accepts the configured password", verify_authorized.status_code == 200 and (verify_authorized.get_json() or {}).get("authenticated") is True)
    verify_unauthorized = client.get("/api/admin/verify", headers={"Authorization": "Bearer invalid-test-password"})
    test("Admin verification rejects an invalid password", verify_unauthorized.status_code == 401)
    saved_admin_settings = (backend.ADMIN_PASSWORD, backend.ADMIN_DEV_BYPASS, backend.ADMIN_CONFIGURED_HOST)
    backend.ADMIN_PASSWORD = ""
    backend.ADMIN_DEV_BYPASS = True
    backend.ADMIN_CONFIGURED_HOST = "127.0.0.1"
    local_demo_access = client.get("/api/admin/overview", environ_base={"REMOTE_ADDR": "127.0.0.1"})
    remote_demo_access = client.get("/api/admin/overview", environ_base={"REMOTE_ADDR": "192.0.2.10"})
    test("Explicit local admin demo bypass accepts loopback only", local_demo_access.status_code == 200 and remote_demo_access.status_code == 401)
    forwarded_demo_access = client.get("/api/admin/overview", headers={"X-Forwarded-For": "192.0.2.10"}, environ_base={"REMOTE_ADDR": "127.0.0.1"})
    test("Local demo bypass rejects forwarded requests", forwarded_demo_access.status_code == 401)
    nonlocal_host_access = client.get("/api/admin/overview", headers={"Host": "admin.example"}, environ_base={"REMOTE_ADDR": "127.0.0.1"})
    test("Local demo bypass requires a loopback Host header", nonlocal_host_access.status_code == 401)
    backend.ADMIN_PASSWORD, backend.ADMIN_DEV_BYPASS, backend.ADMIN_CONFIGURED_HOST = saved_admin_settings
    # CREATE
    new_report = {
        "report": "Major pothole test issue created during automated verification",
        "category": "Road Damage",
        "location": "Automated Test Ave",
        "priority": "High"
    }
    res = client.post("/api/reports", json=new_report)
    test("Create report status code 200", res.status_code == 200)
    rdata = res.get_json() or {}
    report_obj = rdata.get("report") or {}
    ticket_id = report_obj.get("ticket_id")
    rep_id = report_obj.get("id")
    test("Report generated ticket_id", bool(ticket_id), f"-> {ticket_id}")
    road_ai_report_response = client.post("/api/reports", json={
        "description": "Large pothole and broken surface near the market",
        "category": "Road Damage",
        "classification_domain": "road",
        "request_kind": "assistance",
        "ai_category": "Road surface / pothole",
        "priority": "Medium",
    })
    road_ai_report = (road_ai_report_response.get_json() or {}).get("report", {})
    test("Road report reaches the admin queue with AI subtype and pending ML reference", road_ai_report_response.status_code == 200 and road_ai_report.get("category") == "Road Damage" and road_ai_report.get("ai_category") == "Road surface / pothole" and road_ai_report.get("ai_classification_status") == "complete" and road_ai_report.get("ml_classification_status") in {"queued", "complete"})
    auto_ai_report_response = client.post("/api/reports", json={
        "description": "Public tap has no water for several days",
        "category": "Classification pending",
        "auto_classify": True,
        "ai_category": "Water System",
    })
    auto_ai_report = (auto_ai_report_response.get_json() or {}).get("report", {})
    test("AI auto classification fills the report category while preserving its separate ML status", auto_ai_report_response.status_code == 200 and auto_ai_report.get("category") == "Water System" and auto_ai_report.get("ai_category") == "Water System")
    report_activity = client.get("/api/admin/notifications", headers=admin_headers).get_json() or {}
    report_activity_json = json.dumps(report_activity.get("events", []))
    test("Report submission creates a minimal admin activity record", ticket_id in report_activity_json and "Major pothole test issue created" not in report_activity_json and "Automated Test Ave" not in report_activity_json)

    # READ
    res = client.get("/api/reports", headers=admin_headers)
    test("Read reports status code 200", res.status_code == 200)

    # UPDATE
    if rep_id:
        res = client.put(f"/api/reports/{rep_id}", json={"status": "Under Review"}, headers=admin_headers)
        test("Update report status code 200", res.status_code == 200)

    if rep_id:
        denied = client.delete(f"/api/reports/{rep_id}")
        test("Delete without admin authorization is blocked", denied.status_code == 401)
        deleted = client.delete(f"/api/reports/{rep_id}", headers=admin_headers)
        test("Authorized delete succeeds", deleted.status_code == 200)
    audit_response = client.get("/api/admin/audit-logs", headers=admin_headers)
    audit_events = (audit_response.get_json() or {}).get("events", [])
    test("Admin report changes are recorded without report text", audit_response.status_code == 200 and {event.get("action") for event in audit_events} >= {"report.updated", "report.deleted"} and all("Major pothole test issue" not in json.dumps(event) for event in audit_events))

    bad_status = client.post("/api/reports", json={"report": "Bad priority", "priority": "world"})
    test("Invalid report priority is rejected", bad_status.status_code == 400)
    repeated = {"report": "Idempotent submission test", "submission_id": "suite-idempotency-key"}
    first = client.post("/api/reports", json=repeated).get_json() or {}
    second = client.post("/api/reports", json=repeated).get_json() or {}
    test("Report retry returns same ticket", first.get("report", {}).get("ticket_id") == second.get("report", {}).get("ticket_id"))
    transition = client.put(f"/api/reports/{first.get('report', {}).get('id')}", json={"status": "Resolved"}, headers={"Authorization": "Bearer test-admin-password-only"})
    test("Invalid report status transition is rejected", transition.status_code == 409)

    def create_concurrent(index):
        with app.test_client() as concurrent_client:
            response = concurrent_client.post("/api/reports", json={
                "report": f"Concurrent report {index}", "submission_id": f"parallel-{index}"
            })
            return response.status_code
    with ThreadPoolExecutor(max_workers=8) as pool:
        concurrent_statuses = list(pool.map(create_concurrent, range(12)))
    concurrent_reports = client.get("/api/reports", headers=admin_headers).get_json() or []
    test("Concurrent report writes all succeed", concurrent_statuses.count(200) == 12)
    test("Concurrent reports are all preserved", sum("Concurrent report" in r.get("report", "") for r in concurrent_reports) == 12)

    stats = client.get("/api/stats").get_json() or {}
    test("Unsupported dashboard metrics are unavailable", stats.get("ai_accuracy") is None and stats.get("hotspot_clusters") is None)
    cors_denied = client.get("/api/health", headers={"Origin": "http://attacker.example"})
    test("Untrusted CORS origin is not reflected", cors_denied.headers.get("Access-Control-Allow-Origin") is None)
    test("Local development may explicitly enable the debugger", backend._debug_mode_permitted("127.0.0.1", "development", True))
    test("Public binds cannot enable the debugger", not backend._debug_mode_permitted("0.0.0.0", "development", True))
    test("Production cannot enable the debugger", not backend._debug_mode_permitted("127.0.0.1", "production", True))

    # 8. Test Maya AI & PeopleCare Chat Endpoints
    print("\n--- 8. PeopleCare AI Chat & Streaming API ---")
    res = client.post("/api/peoplecare/chat", json={"message": "What are the latest signals?"})
    test("PeopleCare chat responded with status 200", res.status_code == 200)
    cdata = res.get_json() or {}
    test("PeopleCare chat returned reply", bool(cdata.get("reply") or cdata.get("response")))
    general_offline = client.post("/api/peoplecare/chat", json={"message": "What is the difference between a star and a planet?"}).get_json() or {}
    test("Unavailable provider is reported for general questions", "offline support mode" in general_offline.get("reply", "").lower())
    test("Ordinary offline answer does not append emergency or dashboard details", "112" not in general_offline.get("reply", "") and "emerging signals" not in general_offline.get("reply", "").lower())
    greeting = client.post("/api/peoplecare/chat", json={"message": "Hello"}).get_json() or {}
    test("Offline greeting is natural and brief", greeting.get("reply") == "Hi! What would you like to talk about?")
    provider_status = client.get("/api/peoplecare/status").get_json() or {}
    test("Provider status omits secrets and reports unavailable setup", provider_status.get("selected_provider_configured") is False and "api_key" not in provider_status)
    history_probe = [{"role": "user" if index % 2 == 0 else "assistant", "content": str(index) * 4000} for index in range(12)]
    bounded_history = assistant_backend.clean_history(history_probe)
    test("Prompt history keeps recent context within its character budget", sum(len(item["content"]) for item in bounded_history) <= 12000 and bounded_history[-1]["content"] == "1" * 4000)
    compact_prompt = assistant_backend.build_chat_prompt_messages("What is 2 + 2?", [], {}, "general")
    test("General prompts omit empty dashboard context and unused mode text", len(compact_prompt) == 2)
    test("Local model uses a compact direct-answer system prompt", len(assistant_backend.LOCAL_OLLAMA_SYSTEM_PROMPT) < 500 and "Answer directly" in assistant_backend.LOCAL_OLLAMA_SYSTEM_PROMPT)

    # Exercise the configured-provider and history path without external credentials.
    old_provider = assistant_backend.PEOPLECARE_PROVIDER
    old_key = assistant_backend.CLOUD_API_KEY
    old_stream = assistant_backend.stream_cloud_api
    old_retrieve = assistant_backend.retrieve_project_context
    captured_prompt = {}
    retrieval_calls = []
    assistant_backend.retrieve_project_context = lambda *_args, **_kwargs: retrieval_calls.append(True) or []
    def mocked_cloud_stream(messages):
        captured_prompt["messages"] = messages
        last_user = messages[-1]["content"]
        if "square" in last_user.lower():
            yield "```python\ndef square(number):\n    return number * number\n```"
            return
        yield "यह जवाब हिंदी में है।" if "हिंदी" in last_user else "A recursive function calls itself."
    assistant_backend.PEOPLECARE_PROVIDER = "openai_compatible"
    assistant_backend.CLOUD_API_KEY = "test-only-key"
    assistant_backend.stream_cloud_api = mocked_cloud_stream
    followup = client.post("/api/peoplecare/chat", json={
        "message": "Can you show that in Python?",
        "history": [
            {"role": "user", "content": "Explain recursion simply."},
            {"role": "assistant", "content": "A recursive function calls itself."},
        ],
    })
    followup_data = followup.get_json() or {}
    prompt_text = json.dumps(captured_prompt.get("messages", []), ensure_ascii=False)
    test("Configured provider returns a general answer", followup.status_code == 200 and followup_data.get("source") == "cloud_api")
    test("Follow-up history reaches the selected provider", "Explain recursion simply." in prompt_text and "Can you show that in Python?" in prompt_text)
    test("Project file search is skipped when a provider can answer", not retrieval_calls)
    tool_chat = client.post("/api/peoplecare/chat", json={"message": "How many community reports do we have?"})
    tool_chat_data = tool_chat.get_json() or {}
    tool_prompt_text = json.dumps(captured_prompt.get("messages", []), ensure_ascii=False)
    test("Civic chat automatically executes real registered data tools", tool_chat.status_code == 200 and {item.get("name") for item in tool_chat_data.get("tools_used", [])} >= {"get_community_stats", "report_summary"})
    test("Retrieved report counts are supplied to the configured AI provider", "Verified results from PeopleCare's allowlisted read-only tools" in tool_prompt_text and "locally stored community reports" in tool_prompt_text)
    code_answer = client.post("/api/peoplecare/chat", json={"message": "Write a Python function to square a number."}).get_json() or {}
    test("Programming prompts pass through the general provider", "def square(number)" in code_answer.get("reply", ""))
    hindi = client.post("/api/peoplecare/chat", json={"message": "कृपया हिंदी में समझाएं"})
    test("Hindi prompt and Unicode response pass through provider integration", hindi.status_code == 200 and "हिंदी" in (hindi.get_json() or {}).get("reply", ""))
    def failing_cloud_stream(_messages):
        raise TimeoutError("test provider timeout")
        yield "unreachable"
    assistant_backend.stream_cloud_api = failing_cloud_stream
    provider_timeout = client.post("/api/peoplecare/chat", json={"message": "What is 2 plus 2?"})
    timeout_reply = (provider_timeout.get_json() or {}).get("reply", "")
    test("Provider timeout is explicit and avoids civic-stat fabrication", "did not respond" in timeout_reply.lower() and "112" not in timeout_reply)
    assistant_backend.PEOPLECARE_PROVIDER = old_provider
    assistant_backend.CLOUD_API_KEY = old_key
    assistant_backend.stream_cloud_api = old_stream
    assistant_backend.retrieve_project_context = old_retrieve

    res = client.post("/api/maya/chat", json={"message": "Status check"})
    test("Maya chat backward compat responded with status 200", res.status_code == 200)

    # 9. Test Streaming SSE Chat Endpoint
    print("\n--- 9. Server-Sent Events (SSE) Streaming Chat API ---")
    captured_ollama_request = {}
    fake_ollama_lines = [
        json.dumps({"message": {"content": "Hello "}}).encode("utf-8") + b"\n",
        json.dumps({"message": {"content": "world."}}).encode("utf-8") + b"\n",
        json.dumps({"message": {}, "done": True, "eval_count": 2, "eval_duration": 100000000, "load_duration": 2000000, "prompt_eval_count": 10}).encode("utf-8") + b"\n",
    ]
    old_urlopen = assistant_backend.urllib.request.urlopen
    old_line_reader = assistant_backend.iter_response_lines
    class FakeOllamaResponse:
        def __enter__(self):
            return self
        def __exit__(self, *_args):
            return False
    def fake_ollama_open(request, timeout):
        captured_ollama_request["payload"] = json.loads(request.data.decode("utf-8"))
        return FakeOllamaResponse()
    try:
        assistant_backend.urllib.request.urlopen = fake_ollama_open
        assistant_backend.iter_response_lines = lambda *_args: iter(fake_ollama_lines)
        live_metrics = {}
        direct_deltas = list(assistant_backend.stream_ollama([{"role": "user", "content": "Hello"}], metrics=live_metrics))
    finally:
        assistant_backend.urllib.request.urlopen = old_urlopen
        assistant_backend.iter_response_lines = old_line_reader
    ollama_payload = captured_ollama_request.get("payload", {})
    test("Ollama provider passes real answer deltas straight through", "".join(direct_deltas) == "Hello world.")
    test("Ollama request streams, disables thinking, and keeps the model warm", ollama_payload.get("stream") is True and ollama_payload.get("think") is False and ollama_payload.get("keep_alive") == assistant_backend.OLLAMA_KEEP_ALIVE and "format" not in ollama_payload)
    test("Ollama completion metrics are read from provider timing data", live_metrics.get("eval_count") == 2 and live_metrics.get("prompt_eval_count") == 10)

    res_stream = client.post("/api/peoplecare/chat/stream", json={"message": "Explain road hazard reporting."})
    test("Chat stream responded with status 200", res_stream.status_code == 200)
    test("Chat stream mimetype is text/event-stream", "text/event-stream" in res_stream.content_type)
    stream_text = res_stream.get_data(as_text=True)
    test("Chat stream returned SSE data events", "data: " in stream_text)
    test("Chat stream contains completion marker (done: true)", '"done": true' in stream_text)
    offline_chunks = [line for line in stream_text.splitlines() if line.startswith("data: ") and '"done": false' in line]
    test("Offline guidance is returned immediately instead of fake token streaming", len(offline_chunks) == 1)

    old_provider = assistant_backend.PEOPLECARE_PROVIDER
    old_availability = assistant_backend.is_ollama_available
    old_ollama_stream = assistant_backend.stream_ollama
    assistant_backend.PEOPLECARE_PROVIDER = "ollama"
    assistant_backend.is_ollama_available = lambda: True
    def interrupted_ollama_stream(_messages, metrics=None):
        yield "Partial answer"
        raise TimeoutError("simulated stream interruption")
    assistant_backend.stream_ollama = interrupted_ollama_stream
    partial_response = client.post("/api/peoplecare/chat/stream", json={"message": "Write a short Python function."})
    partial_events = [json.loads(line[6:]) for line in partial_response.get_data(as_text=True).splitlines() if line.startswith("data: ")]
    completion = next((event for event in partial_events if event.get("done")), {})
    test("Interrupted local stream identifies provider and marks answer incomplete", completion.get("metadata", {}).get("provider") == "local_ollama" and completion.get("metadata", {}).get("complete") is False)
    assistant_backend.PEOPLECARE_PROVIDER = old_provider
    assistant_backend.is_ollama_available = old_availability
    assistant_backend.stream_ollama = old_ollama_stream

    # 10. Test Agent Tools & Safe Device Execution
    print("\n--- 10. Agent Tools & Safe Device Actions Registry ---")
    tools_res = client.get("/api/agent/tools")
    test("Get tools registry responded 200", tools_res.status_code == 200)
    tools_data = tools_res.get_json() or {}
    test("Tools registry contains get_community_stats", "get_community_stats" in tools_data.get("tools", {}))
    test("Tools registry exposes real community search and analysis tools", {"search_community_reports", "community_report_insights", "analyze_community_signals", "search_blood_requests", "resource_lookup"}.issubset(tools_data.get("tools", {})))
    test("Ordinary general questions do not trigger civic tools", assistant_backend.select_agent_tools("What is entropy in physics?") == [])
    test("Hindi community questions route to the same data tools", any(name == "get_community_stats" for name, _ in assistant_backend.select_agent_tools("समुदाय में कितनी रिपोर्ट हैं?")))
    stats_tool_names = {name for name, _ in assistant_backend.select_agent_tools("How many local community reports are currently stored? Answer from the PeopleCare data.")}
    test("Civic questions avoid redundant project-wide retrieval", stats_tool_names == {"get_community_stats", "report_summary"})
    selected_complex = assistant_backend.select_agent_tools("Analyze major community problems and the latest NYC signals, then prioritize them.")
    test("Complex community intent selects multiple tools within the bounded budget", 1 < len(selected_complex) <= assistant_backend.MAX_TOOLS_PER_TURN)
    forecast_tools = assistant_backend.select_agent_tools("Predict which community issues may become urgent.")
    test("Forecast requests use observed reports and do not misuse the complaint classifier", any(name == "community_report_insights" for name, _ in forecast_tools) and all(name != "classify_complaint" for name, _ in forecast_tools))
    find_all_tools = assistant_backend.select_agent_tools("Find recent community reports")
    test("Unfiltered report searches select the latest local report records", bool(find_all_tools) and find_all_tools[0][0] == "search_community_reports" and find_all_tools[0][1].get("query") == "*")

    # Execute get_community_stats
    tool_exec_res = client.post("/api/agent/execute", json={"tool": "get_community_stats", "args": {}})
    test("Tool execute get_community_stats responded 200", tool_exec_res.status_code == 200)
    stats_res = (tool_exec_res.get_json() or {}).get("result", {})
    test("Community stats returned total_reports", "total_reports" in stats_res, f"-> {stats_res.get('total_reports')}")

    # Execute classify_complaint
    tool_clf_res = client.post("/api/agent/execute", json={"tool": "classify_complaint", "args": {"text": "Broken water hydrant flooding sidewalk"}})
    test("Tool execute classify_complaint responded 200", tool_clf_res.status_code == 200)
    clf_res = (tool_clf_res.get_json() or {}).get("result", {})
    test("Classify tool returned predicted_category", bool(clf_res.get("predicted_category")), f"-> {clf_res.get('predicted_category')}")
    test("Classifier tool does not invent confidence or per-report explanations", clf_res.get("confidence") is None and clf_res.get("individual_explanation_available") is False)

    search_tool = client.post("/api/agent/execute", json={"tool": "search_community_reports", "args": {"query": "concurrent"}})
    search_result = (search_tool.get_json() or {}).get("result", {})
    test("Community report search reads actual report CSV matches", search_tool.status_code == 200 and search_result.get("count", 0) >= 1)
    returned_report = (search_result.get("matches") or [{}])[0]
    test("Chat report search redacts free-text and exact location fields", "report" not in returned_report and "location" not in returned_report)
    latest_reports_tool = client.post("/api/agent/execute", json={"tool": "search_community_reports", "args": {"query": "*"}})
    test("Unfiltered report search returns current redacted report metadata", latest_reports_tool.status_code == 200 and (latest_reports_tool.get_json() or {}).get("result", {}).get("count", 0) >= 1)

    tool_ticket_id = concurrent_reports[0].get("ticket_id", "")
    ticket_tool = client.post("/api/agent/execute", json={"tool": "lookup_report_status", "args": {"ticket_id": tool_ticket_id}})
    ticket_result = (ticket_tool.get_json() or {}).get("result", {})
    test("Report status lookup uses a real ticket ID", ticket_tool.status_code == 200 and ticket_result.get("matches", [{}])[0].get("ticket_id") == tool_ticket_id)

    private_blood = client.post("/api/reports", json={"report": "Blood O positive request. Private phone 5551234", "category": "Blood Assistance", "location": "Private Exact Area", "priority": "Urgent"})
    blood_tool = client.post("/api/agent/execute", json={"tool": "search_blood_requests", "args": {}})
    blood_result_text = json.dumps((blood_tool.get_json() or {}).get("result", {}), ensure_ascii=False)
    test("Blood search retrieves real assistance records without exposing private fields", private_blood.status_code == 200 and blood_tool.status_code == 200 and "5551234" not in blood_result_text and "Private Exact Area" not in blood_result_text)
    test("Blood search explicitly reports that donor matching is not implemented", (blood_tool.get_json() or {}).get("result", {}).get("donor_matching") is False)

    emergency_tool = client.post("/api/agent/execute", json={"tool": "emergency_guidance", "args": {}})
    emergency_result = (emergency_tool.get_json() or {}).get("result", {})
    test("Emergency tool returns India 112 guidance without claiming dispatch", emergency_result.get("emergency_number") == "112" and emergency_result.get("dispatch") is False)

    resources_tool = client.post("/api/agent/execute", json={"tool": "resource_lookup", "args": {"query": "women helpline"}})
    resource_rows = (resources_tool.get_json() or {}).get("result", {}).get("resources", [])
    test("Resource lookup returns configured relevant directory entries", resources_tool.status_code == 200 and any("Women" in item.get("title", "") for item in resource_rows))

    insights_tool = client.post("/api/agent/execute", json={"tool": "community_report_insights", "args": {}})
    insights = (insights_tool.get_json() or {}).get("result", {})
    test("Community insights are computed from actual local report rows", insights_tool.status_code == 200 and insights.get("count", 0) >= 2 and insights.get("forecast") is False)

    signals_tool = client.post("/api/agent/execute", json={"tool": "analyze_community_signals", "args": {}})
    signals_result = (signals_tool.get_json() or {}).get("result", {})
    test("Signal tool reads actual rows and labels historical NYC scope", signals_tool.status_code == 200 and "NYC 311" in signals_result.get("scope", "") and signals_result.get("count", 0) > 0)
    dataset_tool = client.post("/api/agent/execute", json={"tool": "dataset_summary", "args": {}})
    test("Dataset summary returns JSON-safe existing dataset counts", dataset_tool.status_code == 200 and isinstance((dataset_tool.get_json() or {}).get("result", {}).get("summary"), dict))
    draft_tool = client.post("/api/agent/execute", json={"tool": "prepare_report", "args": {"text": "A damaged road surface needs repair."}})
    draft_result = (draft_tool.get_json() or {}).get("result", {})
    test("Report preparation returns an unsaved draft and optional real model category", draft_tool.status_code == 200 and draft_result.get("saved") is False and bool(draft_result.get("draft")))
    bad_tool_args = client.post("/api/agent/execute", json={"tool": "resource_lookup", "args": {"query": "emergency", "path": ".."}})
    test("Tool executor rejects unregistered arguments", bad_tool_args.status_code == 400)

    # Test Safe Device Actions Registry
    actions_res = client.get("/api/agent/actions")
    test("Get allowed device actions responded 200", actions_res.status_code == 200)

    # Test Unconfirmed Device Action (Must be blocked)
    act_block_res = client.post("/api/agent/action", json={"action": "launch_portal", "target": "eraktkosh", "confirmed": False})
    test("Unconfirmed device action blocked with 400", act_block_res.status_code == 400)

    # Test Confirmed Allowlisted Device Action (Must succeed)
    act_confirm_res = client.post("/api/agent/action", json={"action": "launch_portal", "target": "eraktkosh", "confirmed": True})
    test("Confirmed safe device action succeeded with 200", act_confirm_res.status_code == 200)
    portal_data = act_confirm_res.get_json() or {}
    test("Safe portal action returned verified URL", portal_data.get("url") == "https://eraktkosh.mohfw.gov.in")

    old_limit = assistant_backend.CHAT_REQUESTS_PER_MINUTE
    assistant_backend._CHAT_REQUESTS.clear()
    assistant_backend.CHAT_REQUESTS_PER_MINUTE = 1
    limited_first = client.post("/api/peoplecare/chat", json={"message": "Hello"})
    limited_second = client.post("/api/peoplecare/chat", json={"message": "Hello again"})
    test("Chat rate limit allows the configured request", limited_first.status_code == 200)
    test("Chat rate limit rejects excess requests with 429", limited_second.status_code == 429)
    assistant_backend.CHAT_REQUESTS_PER_MINUTE = old_limit
    assistant_backend._CHAT_REQUESTS.clear()

    print("\n" + "=" * 60)
    print(f"RESULTS: {passed} / {total} TESTS PASSED ({round(passed / total * 100, 1)}%)")
    print("=" * 60)

    if passed == total:
        print("ALL BACKEND & ML SUITE TESTS COMPLETED SUCCESSFULLY!")
        return 0
    else:
        print("SOME TESTS FAILED.")
        return 1

if __name__ == "__main__":
    sys.exit(run_tests())
