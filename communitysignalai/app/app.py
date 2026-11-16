
from pathlib import Path
from datetime import datetime
from collections import deque
from concurrent.futures import ThreadPoolExecutor
import base64
import hmac
import json
import os
import re
import tempfile
import time
import uuid
import threading
from urllib.parse import urlparse
import pandas as pd
import numpy as np
import joblib
import traceback
from dotenv import load_dotenv
from flask import Flask, g, render_template, request, jsonify, redirect

try:
    from pywebpush import webpush
except ImportError:
    webpush = None

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env", override=False)

from peoplecare_backend import (
    classify_civic_report,
    register_peoplecare,
    report_classification_categories,
    start_ollama_preload,
)

# ============================================================
# COMMUNITYSIGNAL AI
# Flask Backend
# ============================================================

MODEL_PATH = BASE_DIR / "models" / "community_signal_pipeline_v3.joblib"
TFIDF_PATH = BASE_DIR / "models" / "tfidf_vectorizer_v3.pkl"
V3_CLASSIFIER_PATH = BASE_DIR / "models" / "community_signal_model_v3.pkl"
MODEL_VERSION = "v3-descriptor-only"

SIGNALS_PATH = BASE_DIR / "outputs" / "community_signal_results.csv"
RAW_DATA_PATH = BASE_DIR / "data" / "raw_nyc311.csv"
CLEAN_DATA_PATH = BASE_DIR / "data" / "cleaned_nyc311.csv"

# Keep mutable user/admin records on the project outputs directory by default.
# Production can point this at a persistent mount (for example /var/data) without
# moving the read-only model, dataset, or precomputed signal artifacts.
DATA_DIR = Path(os.getenv("PEOPLECARE_DATA_DIR", "").strip() or (BASE_DIR / "outputs")).expanduser().resolve()
REPORTS_PATH = DATA_DIR / "community_reports.csv"
REPORTS_LOCK = threading.RLock()
VALID_REPORT_STATUSES = {"Pending", "Under Review", "Assigned", "In Progress", "Resolved", "Rejected"}
VALID_REPORT_PRIORITIES = {"Low", "Normal", "Medium", "High", "Urgent", "Critical"}
ADMIN_PASSWORD = (
    os.getenv("PEOPLECARE_ADMIN_PASSWORD", "").strip()
    or os.getenv("PEOPLECARE_ADMIN_TOKEN", "").strip()  # legacy environment-variable compatibility
)
ADMIN_DEV_BYPASS = os.getenv("PEOPLECARE_ADMIN_DEV_BYPASS", "false").strip().lower() in {"1", "true", "yes", "on"}
ADMIN_CONFIGURED_HOST = os.getenv("PEOPLECARE_HOST", "127.0.0.1").strip().lower()
ADMIN_AUDIT_PATH = DATA_DIR / "admin_audit.jsonl"
ADMIN_AUDIT_LOCK = threading.Lock()
ADMIN_NOTIFICATIONS_PATH = DATA_DIR / "admin_notifications.json"
ADMIN_PUSH_SUBSCRIPTIONS_PATH = DATA_DIR / "admin_push_subscriptions.json"
ADMIN_NOTIFICATION_LOCK = threading.RLock()
ADMIN_PUSH_LOCK = threading.RLock()
ACTIVITY_RATE_LOCK = threading.Lock()
ACTIVITY_REQUESTS = {}
PUSH_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="peoplecare-push")
REPORT_CLASSIFICATION_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="peoplecare-classify")
REPORT_CLASSIFICATION_SLOTS = threading.BoundedSemaphore(6)
REPORT_CLASSIFICATION_RATE_LOCK = threading.Lock()
REPORT_CLASSIFICATION_REQUESTS = {}
VAPID_PUBLIC_KEY = os.getenv("PEOPLECARE_VAPID_PUBLIC_KEY", "").strip()
VAPID_PRIVATE_KEY_B64 = os.getenv("PEOPLECARE_VAPID_PRIVATE_KEY_B64", "").strip()
VAPID_SUBJECT = os.getenv("PEOPLECARE_VAPID_SUBJECT", "mailto:admin@example.com").strip()
WEB_PUSH_CONFIGURED = bool(webpush and VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY_B64)
ACTIVITY_LABELS = {
    "emergency_help_opened": ("Emergency help opened", "A visitor opened emergency guidance. This is not a confirmed emergency."),
    "blood_assistance_opened": ("Blood assistance opened", "A visitor opened the blood assistance section."),
    "night_help_opened": ("Night help opened", "A visitor opened the night assistance section."),
    "women_safety_opened": ("Women safety opened", "A visitor opened the women safety section."),
    "road_help_opened": ("Road help opened", "A visitor opened road hazard assistance."),
    "emergency_call_tapped": ("Emergency call link tapped", "A visitor tapped an official emergency call link. Call completion is unknown."),
    "blood_resource_opened": ("Official blood availability opened", "A visitor opened the Government of India e-RaktKosh blood availability page."),
    "report_started": ("Report form opened", "A visitor opened the community report form."),
    "report_submitted": ("New community report", "A community report was submitted."),
    "assistance_request_submitted": ("New assistance request", "A community assistance request was submitted."),
}
PUBLIC_ACTIVITY_TYPES = {
    "emergency_help_opened", "blood_assistance_opened", "night_help_opened",
    "women_safety_opened", "road_help_opened", "report_started", "emergency_call_tapped", "blood_resource_opened",
}


def _debug_mode_permitted(host, environment, requested):
    """Allow Flask's interactive debugger only for explicit local development."""
    local_hosts = {"127.0.0.1", "::1", "localhost"}
    normalized_host = str(host or "").strip().lower().strip("[]")
    normalized_environment = str(environment or "development").strip().lower()
    return bool(requested) and normalized_host in local_hosts and normalized_environment not in {"production", "prod"}

app = Flask(
    __name__,
    template_folder="templates",
    static_folder="static"
)
app.config["MAX_CONTENT_LENGTH"] = int(os.getenv("PEOPLECARE_MAX_REQUEST_BYTES", str(1024 * 1024)))
DEFAULT_CORS_ORIGINS = {
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:4173", "http://127.0.0.1:4173",
    "capacitor://localhost", "http://localhost", "https://localhost", "ionic://localhost",
}
TRUSTED_CORS_ORIGINS = DEFAULT_CORS_ORIGINS | {
    value.strip().rstrip("/")
    for value in os.getenv("PEOPLECARE_CORS_ORIGINS", "").split(",")
    if value.strip()
}

register_peoplecare(app)

@app.after_request
def add_mobile_api_headers(response):
    origin = request.headers.get("Origin", "").rstrip("/")
    if origin in TRUSTED_CORS_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Submission-ID"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return response


def _admin_authorized():
    """Require the configured admin password, or an explicit loopback-only demo bypass."""
    authorization = request.headers.get("Authorization", "")
    supplied = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
    if ADMIN_PASSWORD:
        return bool(supplied) and hmac.compare_digest(supplied.encode("utf-8"), ADMIN_PASSWORD.encode("utf-8"))
    loopback_hosts = {"127.0.0.1", "::1", "localhost"}
    request_host = request.host.strip().lower()
    if request_host.startswith("["):
        request_host = request_host[1:].split("]", 1)[0]
    else:
        request_host = request_host.split(":", 1)[0]
    forwarded_headers = ("Forwarded", "X-Forwarded-For", "X-Forwarded-Host", "X-Forwarded-Proto")
    direct_loopback_request = (
        request_host in loopback_hosts
        and not any(request.headers.get(header) for header in forwarded_headers)
    )
    return (
        ADMIN_DEV_BYPASS
        and ADMIN_CONFIGURED_HOST in loopback_hosts
        and request.remote_addr in {"127.0.0.1", "::1"}
        and direct_loopback_request
    )


def _admin_required_response():
    if _admin_authorized():
        return None
    return jsonify({"error": "Administrator authorization is required."}), 401


def _record_admin_event(action, report_id=None, fields=None):
    """Append a minimal audit record without storing report text or credentials."""
    event = {
        "timestamp": datetime.now().astimezone().isoformat(timespec="seconds"),
        "actor": "configured-admin" if ADMIN_PASSWORD else "local-demo-admin",
        "action": str(action)[:80],
        "entity": "community-report",
        "entity_id": report_id,
        "fields": sorted(str(field)[:40] for field in (fields or [])),
    }
    try:
        ADMIN_AUDIT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with ADMIN_AUDIT_LOCK, ADMIN_AUDIT_PATH.open("a", encoding="utf-8") as audit_file:
            audit_file.write(json.dumps(event, ensure_ascii=False) + "\n")
    except OSError:
        app.logger.exception("Could not append administrator audit event")


def _read_json_list(path):
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []
    except (OSError, json.JSONDecodeError):
        return None
    return value if isinstance(value, list) else None


def _write_json_atomically(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_path = tempfile.mkstemp(prefix=f"{path.stem}_", suffix=".json", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as file_obj:
            json.dump(value, file_obj, ensure_ascii=False, separators=(",", ":"))
            file_obj.flush()
            os.fsync(file_obj.fileno())
        os.replace(temporary_path, path)
    finally:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)


def _send_push_event(event):
    if not WEB_PUSH_CONFIGURED:
        return
    subscriptions = _read_json_list(ADMIN_PUSH_SUBSCRIPTIONS_PATH)
    if subscriptions is None:
        app.logger.warning("Stored phone notification subscriptions could not be read.")
        return
    payload = json.dumps({
        "title": event["title"],
        "body": event["body"],
        "url": "/admin",
        "tag": event["id"],
        "vibrate": [250, 120, 250],
    })
    expired = set()
    try:
        # pywebpush expects the Base64-encoded DER key string, not raw PEM bytes.
        base64.b64decode(VAPID_PRIVATE_KEY_B64, validate=True)
    except (ValueError, base64.binascii.Error):
        app.logger.error("Phone notifications are disabled because the VAPID private key is invalid.")
        return
    for subscription in subscriptions:
        try:
            webpush(
                subscription_info=subscription,
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY_B64,
                vapid_claims={"sub": VAPID_SUBJECT},
                ttl=60,
            )
        except Exception as exc:
            response = getattr(exc, "response", None)
            if response is not None and getattr(response, "status_code", None) in {404, 410}:
                expired.add(subscription.get("endpoint", ""))
            else:
                # Do not log push endpoints, credentials, payloads, or provider response bodies.
                app.logger.warning("Phone push delivery failed (%s).", type(exc).__name__)
    if expired:
        with ADMIN_PUSH_LOCK:
            latest = _read_json_list(ADMIN_PUSH_SUBSCRIPTIONS_PATH)
            if latest is not None:
                remaining = [item for item in latest if item.get("endpoint") not in expired]
                try:
                    _write_json_atomically(ADMIN_PUSH_SUBSCRIPTIONS_PATH, remaining)
                except OSError:
                    app.logger.warning("Expired phone notification subscriptions could not be removed.")


def _record_community_activity(event_type, category=None, ticket_id=None):
    label = ACTIVITY_LABELS.get(event_type)
    if label is None:
        return None
    title, body = label
    safe_category = re.sub(r"[\x00-\x1f\x7f]", "", str(category or "")).strip()[:80]
    safe_ticket_id = str(ticket_id or "").strip()[:40]
    event = {
        "id": uuid.uuid4().hex,
        "timestamp": datetime.now().astimezone().isoformat(timespec="seconds"),
        "event_type": event_type,
        "title": title,
        "body": body,
        "category": safe_category,
        "ticket_id": safe_ticket_id,
    }
    with ADMIN_NOTIFICATION_LOCK:
        events = _read_json_list(ADMIN_NOTIFICATIONS_PATH)
        if events is None:
            app.logger.warning("Community activity history could not be read; this event was not stored.")
            return None
        try:
            _write_json_atomically(ADMIN_NOTIFICATIONS_PATH, [event, *events][-100:])
        except OSError:
            app.logger.warning("Community activity could not be stored.")
            return None
    if WEB_PUSH_CONFIGURED:
        try:
            PUSH_EXECUTOR.submit(_send_push_event, event)
        except RuntimeError:
            app.logger.warning("Phone push service is shutting down; event remains in admin history.")
    return event


def _activity_rate_limited():
    now = time.monotonic()
    client_key = request.remote_addr or "unknown"
    with ACTIVITY_RATE_LOCK:
        entries = ACTIVITY_REQUESTS.setdefault(client_key, deque())
        while entries and now - entries[0] > 60:
            entries.popleft()
        if len(entries) >= 12:
            return True
        entries.append(now)
    return False


@app.route("/api/activity", methods=["POST"])
def record_public_activity():
    """Record an allowlisted, non-sensitive help/report interaction for the admin feed."""
    if _activity_rate_limited():
        return jsonify({"error": "Too many activity events. Please wait and retry."}), 429
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "A JSON object is required."}), 400
    event_type = str(data.get("event_type", "")).strip()
    if event_type not in PUBLIC_ACTIVITY_TYPES:
        return jsonify({"error": "Unsupported activity event."}), 400
    event = _record_community_activity(event_type)
    if event is None:
        return jsonify({"error": "Activity history is unavailable."}), 503
    return jsonify({"success": True}), 202


@app.route("/api/admin/notifications", methods=["GET"])
def admin_notifications():
    denied = _admin_required_response()
    if denied:
        return denied
    with ADMIN_NOTIFICATION_LOCK:
        events = _read_json_list(ADMIN_NOTIFICATIONS_PATH)
    if events is None:
        return jsonify({"error": "Notification history is unavailable."}), 503
    return jsonify({"events": events[:40]})


@app.route("/api/admin/push/config", methods=["GET"])
def admin_push_config():
    denied = _admin_required_response()
    if denied:
        return denied
    with ADMIN_PUSH_LOCK:
        subscriptions = _read_json_list(ADMIN_PUSH_SUBSCRIPTIONS_PATH)
    if subscriptions is None:
        return jsonify({"error": "Phone notification configuration is unavailable."}), 503
    return jsonify({
        "configured": WEB_PUSH_CONFIGURED,
        "public_key": VAPID_PUBLIC_KEY if WEB_PUSH_CONFIGURED else "",
        "device_count": len(subscriptions),
    })


@app.route("/api/admin/push/subscribe", methods=["POST"])
def admin_push_subscribe():
    denied = _admin_required_response()
    if denied:
        return denied
    if not WEB_PUSH_CONFIGURED:
        return jsonify({"error": "Phone push is not configured on the Flask server."}), 503
    data = request.get_json(silent=True)
    subscription = data.get("subscription") if isinstance(data, dict) else None
    if not isinstance(subscription, dict) or not isinstance(subscription.get("keys"), dict):
        return jsonify({"error": "A valid browser push subscription is required."}), 400
    endpoint = subscription.get("endpoint")
    keys = subscription["keys"]
    parsed_endpoint = urlparse(endpoint) if isinstance(endpoint, str) else None
    if (
        not parsed_endpoint
        or parsed_endpoint.scheme != "https"
        or not parsed_endpoint.hostname
        or parsed_endpoint.username
        or parsed_endpoint.password
        or len(endpoint) > 4096
        or not isinstance(keys.get("p256dh"), str)
        or not isinstance(keys.get("auth"), str)
        or len(keys["p256dh"]) > 256
        or len(keys["auth"]) > 256
    ):
        return jsonify({"error": "The browser push subscription is invalid."}), 400
    normalized = {"endpoint": endpoint, "keys": {"p256dh": keys["p256dh"], "auth": keys["auth"]}}
    with ADMIN_PUSH_LOCK:
        subscriptions = _read_json_list(ADMIN_PUSH_SUBSCRIPTIONS_PATH)
        if subscriptions is None:
            return jsonify({"error": "Phone notification storage is unavailable."}), 503
        subscriptions = [item for item in subscriptions if item.get("endpoint") != endpoint]
        subscriptions.append(normalized)
        subscriptions = subscriptions[-10:]
        try:
            _write_json_atomically(ADMIN_PUSH_SUBSCRIPTIONS_PATH, subscriptions)
        except OSError:
            return jsonify({"error": "The phone subscription could not be saved."}), 503
    return jsonify({"success": True, "device_count": len(subscriptions)})


@app.route("/api/admin/push/unsubscribe", methods=["POST"])
def admin_push_unsubscribe():
    denied = _admin_required_response()
    if denied:
        return denied
    data = request.get_json(silent=True)
    endpoint = data.get("endpoint") if isinstance(data, dict) else None
    if not isinstance(endpoint, str) or len(endpoint) > 4096:
        return jsonify({"error": "A valid subscription endpoint is required."}), 400
    with ADMIN_PUSH_LOCK:
        subscriptions = _read_json_list(ADMIN_PUSH_SUBSCRIPTIONS_PATH)
        if subscriptions is None:
            return jsonify({"error": "Phone notification storage is unavailable."}), 503
        remaining = [item for item in subscriptions if item.get("endpoint") != endpoint]
        try:
            _write_json_atomically(ADMIN_PUSH_SUBSCRIPTIONS_PATH, remaining)
        except OSError:
            return jsonify({"error": "The phone subscription could not be removed."}), 503
    return jsonify({"success": True, "device_count": len(remaining)})


@app.route("/api/admin/push/test", methods=["POST"])
def admin_push_test():
    denied = _admin_required_response()
    if denied:
        return denied
    if not WEB_PUSH_CONFIGURED:
        return jsonify({"error": "Phone push is not configured on the Flask server."}), 503
    with ADMIN_PUSH_LOCK:
        subscriptions = _read_json_list(ADMIN_PUSH_SUBSCRIPTIONS_PATH)
    if subscriptions is None:
        return jsonify({"error": "Phone notification storage is unavailable."}), 503
    if not subscriptions:
        return jsonify({"error": "Enable phone alerts on at least one device first."}), 409
    event = {
        "id": f"test-{uuid.uuid4().hex}",
        "title": "PeopleCare AI test alert",
        "body": "This device is connected to admin activity alerts.",
    }
    try:
        PUSH_EXECUTOR.submit(_send_push_event, event)
    except RuntimeError:
        return jsonify({"error": "The phone alert service is unavailable. Try again shortly."}), 503
    return jsonify({"success": True, "queued": True, "device_count": len(subscriptions)}), 202


@app.route("/api/admin/overview", methods=["GET"])
def admin_overview():
    denied = _admin_required_response()
    if denied:
        return denied
    return jsonify({
        "access_mode": "password" if ADMIN_PASSWORD else "local-demo-bypass",
        "model_version": MODEL_VERSION,
        "model_loaded": model is not None,
        "vectorizer_loaded": vectorizer is not None,
        "report_storage": "csv",
    })


@app.route("/api/admin/verify", methods=["GET"])
def admin_verify():
    """Verify administrator credentials without returning console data."""
    denied = _admin_required_response()
    if denied:
        return denied
    return jsonify({
        "authenticated": True,
        "access_mode": "password" if ADMIN_PASSWORD else "local-demo-bypass",
    })


@app.route("/api/admin/audit-logs", methods=["GET"])
def admin_audit_logs():
    denied = _admin_required_response()
    if denied:
        return denied
    try:
        with ADMIN_AUDIT_LOCK:
            if not ADMIN_AUDIT_PATH.exists():
                return jsonify({"events": []})
            lines = ADMIN_AUDIT_PATH.read_text(encoding="utf-8").splitlines()[-100:]
        events = []
        for line in lines:
            try:
                value = json.loads(line)
                if isinstance(value, dict):
                    events.append(value)
            except json.JSONDecodeError:
                continue
        return jsonify({"events": list(reversed(events))})
    except OSError:
        app.logger.exception("Could not read administrator audit log")
        return jsonify({"error": "Audit history is unavailable."}), 500
# ============================================================
# LOAD ML MODEL
# ============================================================

model = None
vectorizer = None

try:
    if MODEL_PATH.exists():
        model = joblib.load(MODEL_PATH)
        vectorizer = model.named_steps.get("tfidf") if hasattr(model, "named_steps") else None
    if model is None and V3_CLASSIFIER_PATH.exists() and TFIDF_PATH.exists():
        model = joblib.load(V3_CLASSIFIER_PATH)
        vectorizer = joblib.load(TFIDF_PATH)
    if model is not None and vectorizer is None and TFIDF_PATH.exists():
        vectorizer = joblib.load(TFIDF_PATH)
except Exception as e:
    print("ML model could not be loaded:", type(e).__name__, str(e))


# ============================================================
# REPORT STORAGE
# ============================================================

def ensure_reports_file():
    REPORTS_PATH.parent.mkdir(parents=True, exist_ok=True)

    if not REPORTS_PATH.exists():
        columns = [
            "id",
            "ticket_id",
            "submission_id",
            "created_at",
            "report",
            "category",
            "location",
            "priority",
            "predicted_problem",
            "status",
            "ai_category",
            "ai_classification_status",
            "ml_reference_category",
            "ml_classification_status",
            "classification_domain",
            "auto_classify",
        ]

        pd.DataFrame(columns=columns).to_csv(
            REPORTS_PATH,
            index=False
        )


ensure_reports_file()


def _persist_report_classification(application, report_id, report_text, domain, auto_classify, existing_ai_category=None):
    """Run configured LLM and installed ML inference without blocking report creation."""
    with application.app_context():
        ai_category = existing_ai_category
        ml_category = None
        try:
            try:
                ml_category = predict_category(report_text)
            except Exception as error:
                application.logger.info("Report ML reference unavailable (%s).", type(error).__name__)
            if not ai_category:
                try:
                    ai_category = classify_civic_report(report_text, domain=domain)
                except Exception as error:
                    application.logger.info("Report AI classification unavailable (%s).", type(error).__name__)

            with REPORTS_LOCK:
                reports = read_reports()
                if "id" not in reports.columns:
                    return
                matches = pd.to_numeric(reports["id"], errors="coerce") == int(report_id)
                if not matches.any():
                    return
                row_index = reports.index[matches][0]
                for column in (
                    "category", "predicted_problem", "ai_category",
                    "ai_classification_status", "ml_reference_category",
                    "ml_classification_status",
                ):
                    if column not in reports.columns:
                        reports[column] = ""
                    else:
                        reports[column] = reports[column].fillna("").astype(object)
                reports.at[row_index, "ai_category"] = ai_category or ""
                reports.at[row_index, "ai_classification_status"] = "complete" if ai_category else "unavailable"
                reports.at[row_index, "ml_reference_category"] = ml_category or ""
                reports.at[row_index, "ml_classification_status"] = "complete" if ml_category else "unavailable"
                if ai_category:
                    if auto_classify:
                        reports.at[row_index, "category"] = ai_category
                    reports.at[row_index, "predicted_problem"] = f"AI issue type: {ai_category}"
                else:
                    reports.at[row_index, "predicted_problem"] = "AI classification unavailable; administrator review required"
                write_reports(reports)
        except Exception:
            application.logger.exception("Could not save report classification metadata.")
        finally:
            REPORT_CLASSIFICATION_SLOTS.release()


def _schedule_report_classification(report_id, report_text, domain, auto_classify, existing_ai_category=None):
    if not REPORT_CLASSIFICATION_SLOTS.acquire(blocking=False):
        return False
    try:
        REPORT_CLASSIFICATION_EXECUTOR.submit(
            _persist_report_classification,
            app,
            report_id,
            report_text,
            domain,
            auto_classify,
            existing_ai_category,
        )
        return True
    except RuntimeError:
        REPORT_CLASSIFICATION_SLOTS.release()
        app.logger.warning("Report classification worker is unavailable.")
        return False

def write_reports(df):
    """Write reports atomically so interrupted writes do not corrupt the CSV."""
    with REPORTS_LOCK:
        REPORTS_PATH.parent.mkdir(parents=True, exist_ok=True)
        fd, temp_path = tempfile.mkstemp(prefix="reports_", suffix=".csv", dir=REPORTS_PATH.parent)
        os.close(fd)
        try:
            df.to_csv(temp_path, index=False)
            os.replace(temp_path, REPORTS_PATH)
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)


def read_reports():
    with REPORTS_LOCK:
        ensure_reports_file()
        try:
            df = pd.read_csv(REPORTS_PATH)
        except Exception as error:
            raise RuntimeError(f"Report storage could not be read safely: {type(error).__name__}") from error
        required = {"id", "report", "status"}
        if not required.issubset(df.columns):
            raise RuntimeError("Report storage is missing required columns; the source file was left unchanged.")
        if "ticket_id" not in df.columns:
            df["ticket_id"] = ""
        if "submission_id" not in df.columns:
            df["submission_id"] = ""
        if df.empty:
            return df
        blank = df["ticket_id"].isna() | (df["ticket_id"].astype(str).str.strip() == "")
        for idx in df.index[blank]:
            df.at[idx, "ticket_id"] = f"PC-{datetime.now():%Y%m%d}-{uuid.uuid4().hex[:6].upper()}"
        if blank.any():
            write_reports(df)
        return df


# ============================================================
# DATA HELPERS
# ============================================================

def load_signals():
    if not SIGNALS_PATH.exists():
        return pd.DataFrame()

    try:
        return pd.read_csv(SIGNALS_PATH)
    except Exception:
        return pd.DataFrame()


def load_main_dataset():
    path = None

    if CLEAN_DATA_PATH.exists():
        path = CLEAN_DATA_PATH
    elif RAW_DATA_PATH.exists():
        path = RAW_DATA_PATH

    if path is None:
        return pd.DataFrame()

    try:
        return pd.read_csv(path)
    except Exception:
        return pd.DataFrame()


def safe_number(value, default=0):
    try:
        number = float(value)

        if np.isnan(number):
            return default

        return number

    except Exception:
        return default


def risk_from_score(score):
    score = safe_number(score)

    if score >= 70:
        return "Critical"

    if score >= 50:
        return "High"

    if score >= 30:
        return "Moderate"

    return "Low"


# ============================================================
# BASIC ROUTES
# ============================================================

@app.route("/")
def home():
    return redirect("/dashboard")


@app.route("/dashboard")
def dashboard():
    return render_template("index.html")


# ============================================================
# AI PREDICTION
# ============================================================

@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict):
            return jsonify({"error": "A JSON object is required."}), 400

        report = (
            data.get("report")
            or data.get("text")
            or data.get("description")
            or ""
        )

        if not isinstance(report, str):
            return jsonify({"error": "Report description must be text."}), 400
        report = report.strip()

        if not report:
            return jsonify({
                "error": "Please provide a community problem description."
            }), 400

        if len(report) > 4000:
            return jsonify({"error": "Report description must be 4000 characters or fewer."}), 400

        if model is None or vectorizer is None:
            return jsonify({
                "error": "AI model is not available."
            }), 500

        features = [report] if hasattr(model, "named_steps") else vectorizer.transform([report])
        prediction = model.predict(features)[0]

        confidence = None

        if hasattr(model, "predict_proba"):
            probabilities = model.predict_proba(features)[0]
            confidence = float(np.max(probabilities) * 100)

        return jsonify({
            "success": True,
            "predicted_problem": str(prediction),
            "prediction": str(prediction),
            "model_version": MODEL_VERSION,
            "confidence": round(confidence, 2)
            if confidence is not None else None,
            "score_kind": "uncalibrated_model_probability_score",
            "model_scope": "NYC 311 descriptor phrases",
            "validated_for_local_reports": False,
            "domain_warning": "This experimental classifier was trained on NYC 311 descriptors and is not validated for West Bengal free-text reports.",
        })

    except Exception:
        app.logger.exception("ML prediction failed")
        return jsonify({
            "error": "The installed V3 model could not classify this report."
        }), 500


def _report_classifier_rate_limited():
    now = time.monotonic()
    client = request.remote_addr or "unknown"
    with REPORT_CLASSIFICATION_RATE_LOCK:
        requests = REPORT_CLASSIFICATION_REQUESTS.setdefault(client, deque())
        while requests and now - requests[0] > 60:
            requests.popleft()
        if len(requests) >= 10:
            return True
        requests.append(now)
        return False


@app.route("/api/reports/classify", methods=["POST"])
def classify_report_preview():
    """Return a real configured-provider category for the report form preview."""
    if _report_classifier_rate_limited():
        return jsonify({"error": "Too many classification requests. Please wait a moment and retry."}), 429
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "A JSON object is required."}), 400
    text = data.get("description")
    if not isinstance(text, str) or not text.strip() or len(text.strip()) > 4000:
        return jsonify({"error": "Describe the issue in 1 to 4000 characters before classification."}), 400
    domain = str(data.get("domain") or "general").strip().lower()
    if domain not in {"general", "road"}:
        return jsonify({"error": "Unsupported classification domain."}), 400
    try:
        ai_category = classify_civic_report(text.strip(), domain=domain)
    except Exception as error:
        app.logger.info("Report classification preview unavailable (%s).", type(error).__name__)
        return jsonify({
            "error": "The configured AI classifier is unavailable. The report can still be submitted for administrator review."
        }), 503
    return jsonify({
        "success": True,
        "ai_category": ai_category,
        "domain": domain,
        "categories": report_classification_categories(domain),
        "note": "AI category is advisory; an administrator must review the submitted report.",
    })


# ============================================================
# COMMUNITY REPORTS
# ============================================================

@app.route("/api/reports", methods=["GET"])
def get_reports():

    try:
        denied = _admin_required_response()
        if denied:
            return denied
        df = read_reports()

        if df.empty:
            return jsonify([])

        df = df.fillna("")

        query = str(request.args.get("q", "")).strip().lower()
        status = str(request.args.get("status", "")).strip().lower()
        category = str(request.args.get("category", "")).strip().lower()
        priority = str(request.args.get("priority", "")).strip().lower()

        if query:
            mask = (
                df["report"].astype(str).str.lower().str.contains(query, regex=False)
                | df["category"].astype(str).str.lower().str.contains(query, regex=False)
                | df["location"].astype(str).str.lower().str.contains(query, regex=False)
                | df["predicted_problem"].astype(str).str.lower().str.contains(query, regex=False)
            )
            df = df[mask]

        if status:
            df = df[
                df["status"].astype(str).str.lower() == status
            ]

        if category:
            df = df[
                df["category"].astype(str).str.lower() == category
            ]

        if priority:
            df = df[
                df["priority"].astype(str).str.lower() == priority
            ]

        records = df.tail(100).iloc[::-1].to_dict(
            orient="records"
        )

        return jsonify(records)

    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500


@app.route("/api/reports", methods=["POST"])
def save_report():

    try:
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict):
            return jsonify({"error": "A JSON object is required."}), 400

        report = (
            data.get("report")
            or data.get("description")
            or ""
        )
        if not isinstance(report, str):
            return jsonify({"error": "Report description must be text."}), 400
        report = report.strip()

        if not report:
            return jsonify({
                "error": "Report description is required."
            }), 400
        if len(report) > 4000:
            return jsonify({"error": "Report description must be 4000 characters or fewer."}), 400

        category = str(
            data.get("category")
            or "Community Problem"
        ).strip()
        auto_classify = data.get("auto_classify") is True or category.casefold() == "ai will classify"
        if auto_classify:
            category = "Classification pending"

        location = str(
            data.get("location")
            or "Not specified"
        ).strip()

        priority = str(
            data.get("priority")
            or "Normal"
        ).strip()
        normalized_priority = next((value for value in VALID_REPORT_PRIORITIES if value.lower() == priority.lower()), None)
        if not normalized_priority:
            return jsonify({"error": "Invalid priority.", "allowed_priorities": sorted(VALID_REPORT_PRIORITIES)}), 400
        priority = normalized_priority
        if len(category) > 100 or len(location) > 250:
            return jsonify({"error": "Category or location is too long."}), 400

        predicted_problem = str(
            data.get("predicted_problem")
            or data.get("prediction")
            or "Pending AI analysis"
        ).strip()[:150]
        request_kind = str(data.get("request_kind") or "").strip().lower()
        classification_domain = str(data.get("classification_domain") or "general").strip().lower()
        if classification_domain not in {"general", "road"}:
            classification_domain = "general"
        proposed_ai_category = data.get("ai_category")
        if not isinstance(proposed_ai_category, str) or proposed_ai_category not in report_classification_categories(classification_domain):
            proposed_ai_category = None
        if auto_classify and proposed_ai_category:
            category = proposed_ai_category
        submission_id = str(data.get("submission_id") or request.headers.get("X-Submission-ID", "")).strip()[:120]
        should_classify = request_kind != "assistance" or classification_domain == "road"

        with REPORTS_LOCK:
            df = read_reports()
            if submission_id and "submission_id" in df.columns:
                duplicate = df[df["submission_id"].fillna("").astype(str) == submission_id]
                if not duplicate.empty:
                    record = duplicate.iloc[0].fillna("").to_dict()
                    return jsonify({"success": True, "message": "This report was already saved.", "report": record, "idempotent_replay": True})
            new_id = 1
            if not df.empty and "id" in df.columns:
                ids = pd.to_numeric(df["id"], errors="coerce")
                new_id = int(ids.max()) + 1 if ids.notna().any() else len(df) + 1

            new_record = {
                "id": new_id,
                "ticket_id": f"PC-{datetime.now():%Y%m%d}-{uuid.uuid4().hex[:6].upper()}",
                "submission_id": submission_id,
                "created_at": datetime.now().isoformat(timespec="seconds"),
                "report": report,
                "category": category,
                "location": location,
                "priority": priority,
                "predicted_problem": (f"AI issue type: {proposed_ai_category}" if proposed_ai_category else "AI classification queued") if should_classify else predicted_problem,
                "status": "Pending",
                "ai_category": proposed_ai_category or "",
                "ai_classification_status": ("complete" if proposed_ai_category else "queued") if should_classify else "not_applicable",
                "ml_reference_category": "",
                "ml_classification_status": "queued" if should_classify else "not_applicable",
                "classification_domain": classification_domain if should_classify else "",
                "auto_classify": bool(auto_classify),
            }
            df = pd.concat([df, pd.DataFrame([new_record])], ignore_index=True)
            write_reports(df)

        if should_classify:
            queued = _schedule_report_classification(
                new_record["id"], report, classification_domain, auto_classify, proposed_ai_category
            )
            if not queued:
                with REPORTS_LOCK:
                    current = read_reports()
                    matches = pd.to_numeric(current.get("id", pd.Series(dtype=float)), errors="coerce") == int(new_record["id"])
                    if matches.any():
                        index = current.index[matches][0]
                        current.at[index, "ai_classification_status"] = "complete" if proposed_ai_category else "unavailable"
                        current.at[index, "ml_classification_status"] = "unavailable"
                        current.at[index, "predicted_problem"] = f"AI issue type: {proposed_ai_category}" if proposed_ai_category else "Classification service busy; administrator review required"
                        write_reports(current)
                new_record["ai_classification_status"] = "complete" if proposed_ai_category else "unavailable"
                new_record["ml_classification_status"] = "unavailable"
                new_record["predicted_problem"] = "Classification service busy; administrator review required"

        event_type = "assistance_request_submitted" if request_kind == "assistance" else "report_submitted"
        _record_community_activity(event_type, category=category, ticket_id=new_record["ticket_id"])

        return jsonify({
            "success": True,
            "message": "Community report saved.",
            "report": new_record,
            "classification": {
                "status": new_record.get("ai_classification_status", "not_applicable"),
                "message": "AI and ML classification is running in the background; the administrator can review results when ready." if should_classify and new_record.get("ai_classification_status") == "queued" else "Classification was not queued; administrator review is required." if should_classify else "Classification is not applicable to this assistance request.",
            },
        })

    except Exception:
        app.logger.exception("Report creation failed")
        return jsonify({
            "error": "The report could not be saved. Existing report data was preserved."
        }), 500


# ============================================================
# REPORT MANAGEMENT
# ============================================================

@app.route("/api/reports/<int:report_id>", methods=["PUT", "PATCH"])
def update_report(report_id):
    """Update editable fields of a community report."""
    try:
        denied = _admin_required_response()
        if denied:
            return denied
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict):
            return jsonify({"error": "A JSON object is required."}), 400
        with REPORTS_LOCK:
            df = read_reports()
            if df.empty or "id" not in df.columns:
                return jsonify({"error": "Report not found."}), 404
            ids = pd.to_numeric(df["id"], errors="coerce")
            matches = df.index[ids == report_id].tolist()
            if not matches:
                return jsonify({"error": "Report not found."}), 404
            index = matches[0]
            allowed = {"category", "location", "priority", "predicted_problem", "status"}
            if "status" in data:
                status = str(data["status"]).strip()
                if status not in VALID_REPORT_STATUSES:
                    return jsonify({"error": "Invalid status.", "allowed_statuses": sorted(VALID_REPORT_STATUSES)}), 400
                old_status = str(df.at[index, "status"])
                transitions = {
                    "Pending": {"Under Review", "Rejected"},
                    "Under Review": {"Assigned", "In Progress", "Rejected"},
                    "Assigned": {"In Progress", "Rejected"},
                    "In Progress": {"Resolved", "Under Review"},
                    "Resolved": {"Under Review"},
                    "Rejected": {"Under Review"},
                }
                if status != old_status and status not in transitions.get(old_status, set()):
                    return jsonify({"error": "Invalid report status transition.", "from": old_status, "to": status}), 409
            for field in allowed:
                if field in data and data[field] is not None:
                    value = str(data[field]).strip()
                    if field == "priority":
                        normalized = next((item for item in VALID_REPORT_PRIORITIES if item.lower() == value.lower()), None)
                        if not normalized:
                            return jsonify({"error": "Invalid priority.", "allowed_priorities": sorted(VALID_REPORT_PRIORITIES)}), 400
                        value = normalized
                    if len(value) > 250:
                        return jsonify({"error": f"{field} is too long."}), 400
                    df.at[index, field] = value
            write_reports(df)
            record = df.loc[index].fillna("").to_dict()
            _record_admin_event("report.updated", report_id, [field for field in allowed if field in data])
        return jsonify({
            "success": True,
            "message": "Report updated successfully.",
            "report": record,
        })

    except Exception:
        app.logger.exception("Report update failed")
        return jsonify({"error": "The report could not be updated."}), 500


@app.route("/api/reports/<int:report_id>", methods=["DELETE"])
def delete_report(report_id):
    """Delete a community report by its numeric ID."""
    try:
        denied = _admin_required_response()
        if denied:
            return denied
        with REPORTS_LOCK:
            df = read_reports()

            if df.empty or "id" not in df.columns:
                return jsonify({"error": "Report not found."}), 404

            ids = pd.to_numeric(df["id"], errors="coerce")
            matches = df.index[ids == report_id].tolist()

            if not matches:
                return jsonify({"error": "Report not found."}), 404

            df = df.drop(index=matches[0]).reset_index(drop=True)
            write_reports(df)
            _record_admin_event("report.deleted", report_id)

        return jsonify({
            "success": True,
            "message": f"Report {report_id} deleted successfully.",
            "report_id": report_id,
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/reports/search", methods=["GET"])
def search_reports():
    """Search/filter stored community reports for the dashboard."""
    try:
        denied = _admin_required_response()
        if denied:
            return denied
        df = read_reports()

        if df.empty:
            return jsonify([])

        df = df.fillna("")

        query = str(request.args.get("q", "")).strip().lower()
        status = str(request.args.get("status", "")).strip().lower()
        category = str(request.args.get("category", "")).strip().lower()
        priority = str(request.args.get("priority", "")).strip().lower()

        if query:
            mask = (
                df["report"].astype(str).str.lower().str.contains(query, regex=False)
                | df["category"].astype(str).str.lower().str.contains(query, regex=False)
                | df["location"].astype(str).str.lower().str.contains(query, regex=False)
                | df["predicted_problem"].astype(str).str.lower().str.contains(query, regex=False)
            )
            df = df[mask]

        if status:
            df = df[
                df["status"].astype(str).str.lower() == status
            ]

        if category:
            df = df[
                df["category"].astype(str).str.lower() == category
            ]

        if priority:
            df = df[
                df["priority"].astype(str).str.lower() == priority
            ]

        records = df.tail(200).iloc[::-1].to_dict(orient="records")

        return jsonify(records)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500



# ============================================================
# SIGNALS
# ============================================================

@app.route("/api/signals")
def api_signals():

    try:
        df = load_signals()

        if df.empty:
            return jsonify([])

        df = df.copy()

        if "community_signal_score" in df.columns:
            df["community_signal_score"] = pd.to_numeric(
                df["community_signal_score"],
                errors="coerce"
            ).fillna(0)

            df = df.sort_values(
                "community_signal_score",
                ascending=False
            )

        df = df.head(10).fillna("")

        records = []

        for _, row in df.iterrows():

            score = safe_number(
                row.get(
                    "community_signal_score",
                    0
                )
            )

            risk = row.get("risk_level", "")

            if not risk:
                risk = risk_from_score(score)

            records.append({
                "complaint_type": str(
                    row.get(
                        "complaint_type",
                        "Unknown"
                    )
                ),

                "community_signal_score": round(
                    score,
                    2
                ),

                "growth_rate": round(
                    safe_number(
                        row.get(
                            "growth_rate",
                            0
                        )
                    ),
                    2
                ),

                "volume_score": round(
                    safe_number(
                        row.get(
                            "volume_score",
                            0
                        )
                    ),
                    2
                ),

                "geo_score": round(
                    safe_number(
                        row.get(
                            "geo_score",
                            0
                        )
                    ),
                    2
                ),

                "anomaly_score": round(
                    safe_number(
                        row.get(
                            "anomaly_score",
                            0
                        )
                    ),
                    2
                ),

                "risk_level": str(risk)
            })

        return jsonify(records)

    except Exception as e:
        traceback.print_exc()

        return jsonify({
            "error": str(e)
        }), 500


# ============================================================
# DASHBOARD STATISTICS
# ============================================================

@app.route("/api/stats")
def api_stats():
    try:
        signals = load_signals()
        reports = read_reports()
        live_total = int(len(reports))
        live_status = reports.get("status", pd.Series(dtype=str)).fillna("").astype(str).str.lower()
        live_priorities = reports.get("priority", pd.Series(dtype=str)).fillna("").astype(str).str.lower()
        resolved = int(live_status.isin({"resolved", "closed"}).sum())
        high_priority = int(live_priorities.isin({"high", "urgent", "critical"}).sum())
        emerging_issues = 0
        historical_high_risk = 0
        if not signals.empty and "community_signal_score" in signals.columns:
            scores = pd.to_numeric(signals["community_signal_score"], errors="coerce")
            emerging_issues = int((scores >= 30).sum())
            historical_high_risk = int((scores >= 50).sum())
        elif not signals.empty and "risk_level" in signals.columns:
            risk_series = signals["risk_level"].fillna("").astype(str).str.lower()
            emerging_issues = int(risk_series.isin({"moderate", "high", "critical"}).sum())
            historical_high_risk = int(risk_series.isin({"high", "critical"}).sum())
        return jsonify({
            "total_reports": live_total,
            "high_priority": high_priority,
            "emerging_issues": emerging_issues,
            "resolved_reports": resolved,
            "ai_accuracy": None,
            "hotspot_clusters": None,
            "anomalies": None,
            "historical_high_risk_signals": historical_high_risk,
            "historical_dataset": str(CLEAN_DATA_PATH.name if CLEAN_DATA_PATH.exists() else RAW_DATA_PATH.name if RAW_DATA_PATH.exists() else "unavailable"),
            "signals_scope": "precomputed NYC 311 reference data; not live local reports",
            "metrics_note": "Accuracy, hotspot clusters, and anomaly totals are not available from a validated evaluation run.",
        })
    except Exception:
        app.logger.exception("Dashboard metrics could not be read")
        return jsonify({"error": "Dashboard metrics could not be read."}), 500


# ============================================================
# CATEGORY ANALYTICS
# ============================================================

@app.route("/api/categories")
def api_categories():

    try:
        dataset = load_main_dataset()

        if dataset.empty or \
                "complaint_type" not in dataset.columns:

            return jsonify([])

        counts = (
            dataset[
                "complaint_type"
            ]
            .astype(str)
            .value_counts()
            .head(6)
        )

        total = max(
            int(counts.sum()),
            1
        )

        records = []

        for category, count in counts.items():

            percentage = (
                float(count) /
                float(total)
            ) * 100

            records.append({
                "category": category,
                "count": int(count),
                "percentage": round(
                    percentage,
                    1
                )
            })

        return jsonify(records)

    except Exception as e:

        return jsonify({
            "error": str(e)
        }), 500


# ============================================================
# HEALTH
# ============================================================

@app.route("/api/health")
def health():

    return jsonify({
        "status": "online",
        "project": "CommunitySignal AI",
        "model_loaded": model is not None,
        "vectorizer_loaded": vectorizer is not None,
        "model_version": MODEL_VERSION if model is not None else None,
        "reports_storage_available": REPORTS_PATH.parent.exists(),
    })


def predict_category(report_text):
    if model is None or vectorizer is None:
        raise RuntimeError("V3 classifier is unavailable")
    features = [report_text] if hasattr(model, "named_steps") else vectorizer.transform([report_text])
    return str(model.predict(features)[0])


def peoplecare_project_health():
    dataset = load_main_dataset()
    reports = read_reports()
    return {
        "success": True,
        "project": "PeopleCare AI",
        "ml_model": {"available": model is not None and vectorizer is not None,
                     "model_file": MODEL_PATH.name if MODEL_PATH.exists() else V3_CLASSIFIER_PATH.name,
                     "vectorizer_file": "embedded in pipeline" if hasattr(model, "named_steps") else TFIDF_PATH.name,
                     "version": MODEL_VERSION},
        "dataset": {"available": not dataset.empty, "rows": int(len(dataset)), "columns": int(len(dataset.columns)) if not dataset.empty else 0},
        "reports": {"available": REPORTS_PATH.exists(), "rows": int(len(reports))},
        "signals": {"available": SIGNALS_PATH.exists(), "rows": int(len(load_signals())), "scope": "NYC 311 reference data"},
        "local_llm": {"provider": "ollama", "model": OLLAMA_MODEL if "OLLAMA_MODEL" in globals() else os.getenv("PEOPLECARE_LOCAL_MODEL", "qwen3:4b-instruct")},
        "cloud_llm_configured": bool(os.getenv("PEOPLECARE_API_KEY", "").strip()),
        "timestamp": datetime.now().isoformat(),
    }


def peoplecare_dataset_summary():
    dataset = load_main_dataset()
    summary = {"rows": int(len(dataset)), "columns": list(map(str, dataset.columns[:50]))}
    for column in ("complaint_type", "borough", "status"):
        if column in dataset.columns:
            counts = dataset[column].fillna("Unknown").astype(str).value_counts().head(10)
            summary[column + "_top"] = {str(key): int(value) for key, value in counts.items()}
    return summary


def peoplecare_report_summary():
    reports = read_reports()
    summary = {"total": int(len(reports))}
    for column in ("status", "priority", "category"):
        if column in reports.columns:
            summary[column] = reports[column].fillna("Unknown").astype(str).value_counts().to_dict()
    return summary


PEOPLECARE_PUBLIC_RESOURCES = [
    {"title": "112 National Unified Emergency Service", "category": "Emergency & Safety", "description": "India's official integrated emergency response number. PeopleCare does not place calls or dispatch responders.", "contact": "112", "url": "tel:112"},
    {"title": "National Police Helpline", "category": "Emergency & Safety", "description": "Police helpline listed by the Government of India; confirm local availability.", "contact": "100", "url": "tel:100"},
    {"title": "Emergency Medical & Ambulance Transport", "category": "Medical & Health", "description": "Ambulance contact listed by the Government of India; coverage may vary.", "contact": "102", "url": "tel:102"},
    {"title": "National Blood Transfusion & e-RaktKosh", "category": "Medical & Health", "description": "Government blood-bank information portal; PeopleCare does not verify stock or coordinate donors.", "contact": "See portal", "url": "https://eraktkosh.in"},
    {"title": "Women in Distress National Helpline", "category": "Women & Child Safety", "description": "Contacts listed by the Government of India; confirm local service coverage.", "contact": "1091 / 181", "url": "tel:1091"},
    {"title": "Childline Emergency Support", "category": "Women & Child Safety", "description": "Child helpline contact listed by the Government of India.", "contact": "1098", "url": "tel:1098"},
    {"title": "Civic Central 311 Citizen Portal", "category": "Civic & Infrastructure", "description": "311 is used by some US municipalities and is not a general India civic helpline. Check local authority channels.", "contact": "Check locally", "url": "tel:311"},
    {"title": "National Disaster Response Force (NDRF)", "category": "Emergency & Safety", "description": "National disaster response information. For immediate emergencies in India, call 112.", "contact": "1078 / 011-24363260", "url": "tel:1078"},
    {"title": "National Cyber Crime Reporting Portal", "category": "Digital Safety", "description": "Report cybercrime through the Government of India's portal.", "contact": "Portal", "url": "https://cybercrime.gov.in"},
    {"title": "Tele-MANAS Mental Health Support", "category": "Mental Health", "description": "National tele-mental-health support service information.", "contact": "14416", "url": "tel:14416"},
    {"title": "National Highway Helpline (NHAI)", "category": "Civic & Infrastructure", "description": "National highway assistance information; coverage applies to national highways.", "contact": "1033", "url": "tel:1033"},
    {"title": "Fire Emergency & Hazard Response", "category": "Emergency & Safety", "description": "Fire service contact listed by the platform's resource directory; confirm local availability.", "contact": "101", "url": "tel:101"},
]


def _tool_report_frame():
    reports = getattr(g, "peoplecare_tool_reports", None)
    if reports is None:
        reports = read_reports().fillna("")
        g.peoplecare_tool_reports = reports
    if "id" not in reports.columns:
        raise RuntimeError("Report storage is unavailable")
    return reports


def _safe_report_metadata(row):
    """Never expose free-text report content, phone numbers, or exact location in chat tools."""
    return {
        "ticket_id": str(row.get("ticket_id", "")),
        "category": str(row.get("category", "")),
        "status": str(row.get("status", "")),
        "priority": str(row.get("priority", "")),
    }


def _counts(series):
    return {str(key): int(value) for key, value in series.fillna("Unknown").astype(str).value_counts().head(12).items()}


def _peoplecare_tool_executor(tool, args):
    """Execute bounded read-only tools against the active application data."""
    args = args if isinstance(args, dict) else {}
    allowed_args = {
        "search_community_reports": {"query", "limit"},
        "lookup_report_status": {"ticket_id"},
        "classify_complaint": {"text"},
        "prepare_report": {"text"},
        "resource_lookup": {"query", "limit"},
        "project_search": {"query", "limit"},
    }
    if tool not in PEOPLECARE_TOOLS:
        raise ValueError("Tool is not allowlisted.")
    if any(key not in allowed_args.get(tool, set()) for key in args):
        raise ValueError("Unsupported tool argument.")

    if tool == "get_community_stats":
        stats = (app.config.get("PEOPLECARE_STATS_READER") or (lambda: {}))()
        return {**stats, "scope": "Local report totals plus separately labeled NYC reference metrics.", "summary": f"There are {stats.get('total_reports', 0)} locally stored community reports; {stats.get('resolved_reports', 0)} are resolved. NYC reference metrics are historical and not local live activity.", "data": stats}

    if tool == "report_summary":
        summary = peoplecare_report_summary()
        return {"scope": "Current local report registry.", "summary": f"The local report registry contains {summary.get('total', 0)} reports. Status counts: {summary.get('status', {})}. Priority counts: {summary.get('priority', {})}. Category counts: {summary.get('category', {})}.", "data": summary}

    if tool in {"search_community_reports", "lookup_report_status", "community_report_insights", "road_problem_analysis", "search_blood_requests"}:
        reports = _tool_report_frame()
        if tool == "lookup_report_status":
            ticket_id = str(args.get("ticket_id", "")).strip().upper()
            if not re.fullmatch(r"PC-\d{8}-[A-Z0-9]{4,12}", ticket_id):
                raise ValueError("A valid PeopleCare ticket ID is required.")
            matches = reports[reports.get("ticket_id", pd.Series(dtype=str)).astype(str).str.upper() == ticket_id]
            found = [_safe_report_metadata(row) for _, row in matches.head(1).iterrows()]
            summary = f"Ticket {ticket_id} was found with status {found[0]['status']} and category {found[0]['category']}." if found else f"No report with ticket {ticket_id} was found in the local registry."
            return {"summary": summary, "matches": found}

        if tool == "search_community_reports":
            query = str(args.get("query", "")).strip()[:100]
            if not query:
                raise ValueError("A search query is required.")
            fields = [column for column in ("report", "category", "predicted_problem", "location", "ticket_id") if column in reports]
            searchable = reports[fields].astype(str).agg(" ".join, axis=1).str.lower()
            terms = [part for part in re.findall(r"[\w-]{2,}", query.lower()) if part not in {"reports", "report", "community", "local", "find", "show", "recent", "latest"}]
            if query == "*":
                mask = pd.Series(True, index=reports.index)
            else:
                if not terms:
                    terms = [query.lower()]
                mask = searchable.map(lambda value: any(term in value for term in terms))
            matches = reports[mask].tail(min(max(int(args.get("limit", 8)), 1), 12))
            rows = [_safe_report_metadata(row) for _, row in matches.iloc[::-1].iterrows()]
            query_label = "the latest local reports" if query == "*" else f"'{query}'"
            return {"summary": f"Found {int(mask.sum())} matching local report(s) for {query_label}. Returned ticket metadata only; free-text descriptions and locations are redacted.", "count": int(mask.sum()), "matches": rows}

        if tool == "search_blood_requests":
            categories = reports.get("category", pd.Series(index=reports.index, dtype=str)).astype(str).str.lower()
            matches = reports[categories.str.contains("blood assistance|blood request", regex=True, na=False)]
            rows = [_safe_report_metadata(row) for _, row in matches.tail(8).iloc[::-1].iterrows()]
            return {"summary": f"The local registry contains {len(matches)} blood-assistance request record(s). These are user-submitted records only; donors, blood stock, eligibility, and availability are not verified or matched here.", "count": int(len(matches)), "matches": rows, "donor_matching": False}

        if tool == "road_problem_analysis":
            text = reports.get("category", pd.Series(index=reports.index, dtype=str)).astype(str).str.lower() + " " + reports.get("report", pd.Series(index=reports.index, dtype=str)).astype(str).str.lower()
            mask = text.str.contains(r"road|pothole|street|drain|pavement|traffic|infrastructure", regex=True, na=False)
            matches = reports[mask]
            statuses = _counts(matches.get("status", pd.Series(index=matches.index, dtype=str)))
            categories = _counts(matches.get("category", pd.Series(index=matches.index, dtype=str)))
            summary = f"Observed {len(matches)} local report(s) mentioning road or infrastructure problems. Status counts: {statuses}. Category counts: {categories}. This is a count of submitted reports, not a verified hazard map."
            return {"summary": summary, "count": int(len(matches)), "status_counts": statuses, "category_counts": categories, "scope": "Observed local submissions; not a verified hazard map."}

        created = pd.to_datetime(reports.get("created_at", pd.Series(index=reports.index, dtype=str)), errors="coerce", utc=True)
        now = pd.Timestamp.now(tz="UTC")
        current_window = int((created >= now - pd.Timedelta(days=30)).sum())
        previous_window = int(((created >= now - pd.Timedelta(days=60)) & (created < now - pd.Timedelta(days=30))).sum())
        priorities = _counts(reports.get("priority", pd.Series(index=reports.index, dtype=str)))
        categories = _counts(reports.get("category", pd.Series(index=reports.index, dtype=str)))
        high_priority = reports.get("priority", pd.Series(index=reports.index, dtype=str)).astype(str).str.lower().isin({"high", "urgent", "critical"})
        priority_by_category = {}
        if "category" in reports:
            priority_by_category = {
                str(category): int(count)
                for category, count in reports.loc[high_priority].groupby("category", dropna=False).size().sort_values(ascending=False).head(8).items()
            }
        priority_focus = max(priority_by_category.items(), key=lambda item: item[1]) if priority_by_category else None
        focus_text = f"The category with the most High/Urgent/Critical submissions is {priority_focus[0]} ({priority_focus[1]} record(s)); this is a count-based review cue, not a verified severity assessment." if priority_focus else "There are no High/Urgent/Critical records to rank in the current data."
        trend = "Not enough timestamped local data to compare the last two 30-day windows." if current_window + previous_window < 4 else f"Observed {current_window} reports in the last 30 days versus {previous_window} in the preceding 30 days. This describes those windows and is not a forecast."
        return {"summary": f"Observed {len(reports)} local report(s). Category counts: {categories}. Priority counts: {priorities}. High-priority counts by category: {priority_by_category}. {focus_text} {trend}", "count": int(len(reports)), "category_counts": categories, "priority_counts": priorities, "high_priority_by_category": priority_by_category, "last_30_days": current_window, "previous_30_days": previous_window, "forecast": False}

    if tool == "analyze_community_signals":
        signals = load_signals()
        if signals.empty:
            return {"summary": "No precomputed community signal rows are available.", "count": 0, "scope": "Historical NYC 311 reference data, not live local reports."}
        score_col = next((col for col in ("community_signal_score", "signal_score", "score") if col in signals.columns), None)
        score = pd.to_numeric(signals[score_col], errors="coerce") if score_col else pd.Series(0, index=signals.index)
        type_col = next((col for col in ("complaint_type", "category", "issue") if col in signals.columns), None)
        top = []
        if type_col:
            for index, row in signals.assign(_score=score).sort_values("_score", ascending=False).head(6).iterrows():
                top.append({"issue": str(row.get(type_col, "Unknown")), "score": round(float(row["_score"]), 2) if pd.notna(row["_score"]) else None})
        high = int((score >= 50).sum())
        emerging = int((score >= 30).sum())
        return {"summary": f"The precomputed historical NYC 311 reference dataset has {len(signals)} signal row(s), including {emerging} at or above the emerging threshold and {high} at or above the high-risk threshold. This is historical reference data, not current West Bengal activity or a forecast.", "count": int(len(signals)), "emerging_threshold_count": emerging, "high_risk_threshold_count": high, "top_reference_signals": top, "scope": "Historical NYC 311 reference data; not live local reports."}

    if tool == "classify_complaint":
        text = args.get("text")
        if not isinstance(text, str) or not text.strip() or len(text) > 4000:
            raise ValueError("Text must be between 1 and 4000 characters.")
        prediction = predict_category(text.strip())
        return {"summary": f"The installed {MODEL_VERSION} classifier labeled this text as '{prediction}'. The model does not currently provide a validated explanation for individual predictions, and its NYC 311 training domain is not validated for West Bengal reports.", "predicted_category": prediction, "model_version": MODEL_VERSION, "confidence": None, "individual_explanation_available": False}

    if tool == "prepare_report":
        text = args.get("text")
        if not isinstance(text, str) or not text.strip() or len(text) > 4000:
            raise ValueError("Text must be between 1 and 4000 characters.")
        draft = text.strip()
        try:
            prediction = predict_category(draft)
        except Exception:
            prediction = None
        prediction_note = f" The installed classifier suggests '{prediction}' (experimental NYC 311 model, not validated locally)." if prediction else " ML category suggestion is unavailable."
        return {"summary": "Prepared a draft only; nothing has been saved." + prediction_note, "draft": draft, "predicted_category": prediction, "saved": False}

    if tool == "emergency_guidance":
        return {"summary": "For an immediate emergency in India, call 112 now and share your location directly with responders. PeopleCare does not dispatch, place calls, or track responders.", "emergency_number": "112", "scope": "India", "dispatch": False}

    if tool == "resource_lookup":
        query = str(args.get("query", "")).strip()[:100]
        if not query:
            raise ValueError("A resource search query is required.")
        terms = [term for term in re.findall(r"[\w-]{2,}", query.lower())]
        matches = [resource for resource in PEOPLECARE_PUBLIC_RESOURCES if any(term in json.dumps(resource, ensure_ascii=False).lower() for term in terms)]
        matches = matches[:min(max(int(args.get("limit", 6)), 1), 10)]
        summary = f"Found {len(matches)} matching entries in the platform's configured public-resource directory." if matches else "No matching entry was found in the platform's configured public-resource directory."
        return {"summary": summary, "resources": matches, "scope": "Configured public directory; verify service availability locally."}

    if tool == "project_health":
        return peoplecare_project_health()
    if tool == "dataset_summary":
        return {"scope": "Reference dataset; NYC 311 data is not locally validated.", "summary": peoplecare_dataset_summary()}
    if tool == "project_search":
        query = str(args.get("query", "")).strip()[:200]
        if not query:
            raise ValueError("A project search query is required.")
        limit = min(max(int(args.get("limit", 3)), 1), 5)
        sources = retrieve_project_context(query, limit=limit)
        return {"summary": f"Retrieved {len(sources)} relevant project source/documentation snippet(s).", "sources": sources}

    raise ValueError("Tool is not implemented.")


app.config["PEOPLECARE_PROJECT_HEALTH"] = peoplecare_project_health
app.config["PEOPLECARE_STATS_READER"] = lambda: api_stats().get_json() or {}
app.config["PEOPLECARE_PREDICTOR"] = predict_category
app.config["PEOPLECARE_DATASET_SUMMARY"] = peoplecare_dataset_summary
app.config["PEOPLECARE_REPORT_SUMMARY"] = peoplecare_report_summary
PEOPLECARE_TOOLS = {
    "get_community_stats", "report_summary", "search_community_reports", "lookup_report_status",
    "community_report_insights", "analyze_community_signals", "classify_complaint",
    "road_problem_analysis", "search_blood_requests", "emergency_guidance", "resource_lookup",
    "prepare_report", "project_health", "dataset_summary", "project_search",
}
app.config["PEOPLECARE_TOOL_EXECUTOR"] = _peoplecare_tool_executor


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":

    server_host = os.getenv("PEOPLECARE_HOST", "127.0.0.1").strip()
    debug_requested = os.getenv("PEOPLECARE_DEBUG", "false").strip().lower() in {"1", "true", "yes", "on"}
    debug_enabled = _debug_mode_permitted(server_host, os.getenv("PEOPLECARE_ENV", "development"), debug_requested)
    if debug_requested and not debug_enabled:
        app.logger.warning("Flask debug mode was disabled because the host is not loopback or the environment is production.")

    print("=" * 60)
    print("CommunitySignal AI")
    print("Dashboard: http://127.0.0.1:5000/dashboard")
    print("Android/mobile API: use this computer LAN IP on port 5000")
    print("=" * 60)

    start_ollama_preload()

    app.run(
        host=server_host,
        port=int(os.getenv("PEOPLECARE_PORT", "5000")),
        debug=debug_enabled,
        use_reloader=False,
    )
