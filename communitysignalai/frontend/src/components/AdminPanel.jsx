import { useCallback, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { apiUrl } from "../api.js";
import "./AdminPanel.css";

const STATUS_TRANSITIONS = {
  Pending: ["Under Review", "Rejected"],
  "Under Review": ["Assigned", "In Progress", "Rejected"],
  Assigned: ["In Progress", "Rejected"],
  "In Progress": ["Resolved", "Under Review"],
  Resolved: ["Under Review"],
  Rejected: ["Under Review"],
};

function displayMetric(value) {
  return value === null || value === undefined || value === "" ? "Unavailable" : value;
}

function displayTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function decodeApplicationServerKey(key) {
  const padded = `${key}${"=".repeat((4 - (key.length % 4)) % 4)}`;
  const binary = window.atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export default function AdminPanel({ access, onAccessChange, jsonFetch }) {
  const phoneAdminUrl = typeof window === "undefined" ? "" : `${window.location.origin}/admin`;
  const phoneHost = typeof window === "undefined" ? "" : window.location.hostname.toLowerCase();
  const phoneLinkIsSecure = typeof window !== "undefined"
    && window.location.protocol === "https:"
    && !["localhost", "127.0.0.1", "::1"].includes(phoneHost);
  const [passwordDraft, setPasswordDraft] = useState(access.password || "");
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState(null);
  const [signals, setSignals] = useState([]);
  const [health, setHealth] = useState(null);
  const [provider, setProvider] = useState(null);
  const [overview, setOverview] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);
  const [activityEvents, setActivityEvents] = useState([]);
  const [pushConfig, setPushConfig] = useState(null);
  const [phoneAlertsEnabled, setPhoneAlertsEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [statusDrafts, setStatusDrafts] = useState({});
  const [checking, setChecking] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async () => {
    const keys = ["overview", "reports", "audit", "stats", "signals", "health", "provider", "notifications", "push"];
    const urls = [
      "/api/admin/overview", "/api/reports", "/api/admin/audit-logs", "/api/stats",
      "/api/signals", "/api/health", "/api/peoplecare/status", "/api/admin/notifications", "/api/admin/push/config",
    ];
    const results = await Promise.allSettled(urls.map((url) => jsonFetch(url)));
    const settled = Object.fromEntries(keys.map((key, index) => [key, results[index]]));
    const protectedFailures = [settled.overview, settled.reports, settled.audit, settled.notifications, settled.push]
      .filter((result) => result.status === "rejected");
    if (protectedFailures.some((result) => result.reason?.status === 401)) {
      const authError = new Error("Admin authorization expired. Verify access again.");
      authError.status = 401;
      throw authError;
    }

    if (settled.overview.status === "fulfilled") setOverview(settled.overview.value);
    if (settled.reports.status === "fulfilled") {
      const reportData = Array.isArray(settled.reports.value) ? settled.reports.value : [];
      setReports(reportData);
      setStatusDrafts(Object.fromEntries(reportData.map((item) => [item.id, item.status || "Pending"])));
    }
    if (settled.audit.status === "fulfilled") {
      setAuditEvents(Array.isArray(settled.audit.value.events) ? settled.audit.value.events : []);
    }
    if (settled.stats.status === "fulfilled") setStats(settled.stats.value);
    if (settled.signals.status === "fulfilled") {
      const value = settled.signals.value;
      setSignals(Array.isArray(value) ? value : Array.isArray(value.signals) ? value.signals : []);
    }
    if (settled.health.status === "fulfilled") setHealth(settled.health.value);
    if (settled.provider.status === "fulfilled") setProvider(settled.provider.value);
    if (settled.notifications.status === "fulfilled") {
      setActivityEvents(Array.isArray(settled.notifications.value.events) ? settled.notifications.value.events : []);
    }
    if (settled.push.status === "fulfilled") setPushConfig(settled.push.value);

    const unavailable = keys.filter((key) => settled[key].status === "rejected");
    setError(unavailable.length ? `Some admin data could not be refreshed: ${unavailable.join(", ")}. Retry when the backend is available.` : "");
    setLastRefreshedAt(new Date());
  }, [jsonFetch]);

  useEffect(() => {
    if (!access.authenticated) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (cancelled) return undefined;
        setChecking(true);
        setError("");
        return loadData();
      })
      .catch((loadError) => {
        if (cancelled) return;
        if (loadError.status === 401) {
          onAccessChange({ password: "", authenticated: false });
          setError("Admin password was rejected. Check the password configured on the Flask server.");
        } else {
          setError(`Could not load admin data: ${loadError.message}`);
        }
      })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [access.authenticated, loadData, onAccessChange]);

  useEffect(() => {
    if (!access.authenticated) return undefined;
    const refreshTimer = window.setInterval(() => {
      if (!document.hidden) loadData().catch(() => {});
    }, 30000);
    return () => window.clearInterval(refreshTimer);
  }, [access.authenticated, loadData]);

  useEffect(() => {
    if (!access.authenticated || !("serviceWorker" in navigator) || !("PushManager" in window)) return undefined;
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => { if (!cancelled) setPhoneAlertsEnabled(Boolean(subscription)); })
      .catch(() => { if (!cancelled) setPhoneAlertsEnabled(false); });
    return () => { cancelled = true; };
  }, [access.authenticated]);

  async function enablePhoneAlerts() {
    if (!phoneLinkIsSecure) {
      setError("Deploy PeopleCare AI to HTTPS, then open /admin on your phone before enabling phone alerts.");
      return;
    }
    if (!pushConfig?.configured) {
      setError("Phone push is not configured on the Flask server yet. Add VAPID keys, restart Flask, and refresh this page.");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setError("This browser does not support web push. Open the HTTPS site in a supported browser on your phone.");
      return;
    }
    setPushBusy(true);
    setError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Allow notifications in your browser to receive phone alerts.");
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeApplicationServerKey(pushConfig.public_key),
        });
      }
      await jsonFetch("/api/admin/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      setPhoneAlertsEnabled(true);
      setNotice("Phone alerts are enabled for this browser. Open the installed app or browser to review the admin feed.");
      await loadData();
    } catch (pushError) {
      setError(pushError.message || "Could not enable phone alerts.");
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePhoneAlerts() {
    setPushBusy(true);
    setError("");
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await jsonFetch("/api/admin/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setPhoneAlertsEnabled(false);
      setNotice("Phone alerts are disabled for this browser.");
      await loadData();
    } catch (pushError) {
      setError(pushError.message || "Could not disable phone alerts.");
    } finally {
      setPushBusy(false);
    }
  }

  async function sendTestPhoneAlert() {
    setPushBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await jsonFetch("/api/admin/push/test", { method: "POST" });
      setNotice(`Test alert queued for ${result.device_count} subscribed device(s).`);
    } catch (pushError) {
      setError(pushError.message || "Could not queue a test phone alert.");
    } finally {
      setPushBusy(false);
    }
  }

  async function sharePhoneAdminLink() {
    if (!phoneLinkIsSecure || !phoneAdminUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: "PeopleCare AI Admin Console", url: phoneAdminUrl });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(phoneAdminUrl);
        setNotice("Secure admin link copied. Open it on your phone and sign in there.");
      } else {
        throw new Error("This browser cannot share or copy the link. Scan the QR code instead.");
      }
    } catch (shareError) {
      if (shareError.name !== "AbortError") setError(shareError.message || "Could not share the phone access link.");
    }
  }

  async function verifyAccess(event) {
    event.preventDefault();
    setChecking(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(apiUrl("/api/admin/verify"), {
        headers: passwordDraft.trim() ? { Authorization: `Bearer ${passwordDraft.trim()}` } : {},
        cache: "no-store",
      });
      if (!response.ok) {
        if (response.status === 401) throw new Error("Incorrect admin password. Enter the password configured on the Flask server.");
        if (response.status === 404) throw new Error("The running Flask server does not have the admin verification route. Stop the old backend, then restart this project with start_backend.bat; Vite proxies /api to port 5000.");
        throw new Error(`Admin check failed (HTTP ${response.status}).`);
      }
      const verification = await response.json();
      if (verification.authenticated !== true) throw new Error("The backend did not confirm administrator access.");
      onAccessChange({ password: passwordDraft.trim(), authenticated: true });
      setNotice("Admin access verified.");
    } catch (verifyError) {
      setError(verifyError.message || "Could not verify admin access.");
    } finally {
      setChecking(false);
    }
  }

  async function updateStatus(report) {
    const status = statusDrafts[report.id] || report.status;
    if (status === report.status) return;
    setBusyId(report.id);
    setError("");
    setNotice("");
    try {
      const result = await jsonFetch(`/api/reports/${report.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setReports((current) => current.map((item) => item.id === report.id ? { ...item, ...(result.report || {}), status } : item));
      setStatusDrafts((current) => ({ ...current, [report.id]: status }));
      setNotice(`Report ${report.ticket_id || `#${report.id}`} moved to ${status}.`);
      try {
        const audit = await jsonFetch("/api/admin/audit-logs");
        setAuditEvents(Array.isArray(audit.events) ? audit.events : []);
      } catch {
        setError("The status was updated, but audit history could not be refreshed.");
      }
    } catch (updateError) {
      setError(`Could not update report: ${updateError.message}`);
      setStatusDrafts((current) => ({ ...current, [report.id]: report.status }));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteReport(report) {
    const ticket = report.ticket_id || `#${report.id}`;
    if (!window.confirm(`Permanently delete report ${ticket}? This cannot be undone.`)) return;
    setBusyId(report.id);
    setError("");
    setNotice("");
    try {
      await jsonFetch(`/api/reports/${report.id}`, { method: "DELETE" });
      setReports((current) => current.filter((item) => item.id !== report.id));
      setNotice(`Report ${ticket} was deleted.`);
      try {
        const audit = await jsonFetch("/api/admin/audit-logs");
        setAuditEvents(Array.isArray(audit.events) ? audit.events : []);
      } catch {
        setError("The report was deleted, but audit history could not be refreshed.");
      }
    } catch (deleteError) {
      setError(`Could not delete report: ${deleteError.message}`);
    } finally {
      setBusyId(null);
    }
  }

  const visibleReports = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return reports.filter((item) => {
      const matchesQuery = !normalized || [item.ticket_id, item.report, item.category, item.location, item.status]
        .some((field) => String(field || "").toLowerCase().includes(normalized));
      const matchesStatus = statusFilter === "All" || item.status === statusFilter;
      const matchesPriority = priorityFilter === "All" || (item.priority || "Normal") === priorityFilter;
      return matchesQuery && matchesStatus && matchesPriority;
    });
  }, [priorityFilter, query, reports, statusFilter]);

  if (!access.authenticated) {
    return (
      <section className="admin-page">
        <div className="admin-login-card glass-panel">
          <div className="admin-kicker">PEOPLECARE AI · SECURE ACCESS</div>
          <h1>Admin console</h1>
          <p>Set an admin password with <code>PEOPLECARE_ADMIN_PASSWORD</code> in the project-root <code>.env</code>, restart Flask, and enter it here. It stays in this tab’s memory and is not written to local storage.</p>
          <form className="admin-login-form" onSubmit={verifyAccess}>
            <label htmlFor="admin-password">Admin password</label>
            <input id="admin-password" type="password" autoComplete="current-password" value={passwordDraft} onChange={(event) => setPasswordDraft(event.target.value)} placeholder="Enter admin password" />
            <button className="admin-primary-button" type="submit" disabled={checking}>{checking ? "Verifying…" : "Verify access"}</button>
          </form>
          <p className="admin-access-note">Use a strong password and HTTPS on hosted deployments. Blank-password access is only available when the explicit loopback demo option is enabled.</p>
          {error && <div className="admin-message error" role="alert">{error}</div>}
        </div>
      </section>
    );
  }

  return (
    <section className="admin-page">
      <header className="admin-page-header">
        <div>
          <div className="admin-kicker">AUTHORIZED CONTROL PLANE</div>
          <h1>Admin console</h1>
          <p>Live report, model, provider, signal, and audit data from the PeopleCare backend.</p>
        </div>
        <div className="admin-header-actions">
          <span className="admin-access-badge"><i /> {overview?.access_mode === "local-demo-bypass" ? "Local demo access" : "Admin password verified"}</span>
          <button type="button" className="admin-secondary-button" disabled={checking} onClick={() => { setChecking(true); setError(""); loadData().catch((loadError) => setError(`Refresh failed: ${loadError.message}`)).finally(() => setChecking(false)); }}>{checking ? "Refreshing…" : "Refresh data"}</button>
          <button type="button" className="admin-secondary-button" onClick={() => { onAccessChange({ password: "", authenticated: false }); setPasswordDraft(""); setOverview(null); }}>Sign out</button>
        </div>
      </header>

      {error && <div className="admin-message error" role="alert">{error}</div>}
      {notice && <div className="admin-message success" role="status">{notice}</div>}

      <div className="admin-metric-grid">
        <article className="admin-metric glass-panel"><span>Stored reports</span><strong>{displayMetric(stats?.total_reports)}</strong><small>CSV report registry</small></article>
        <article className="admin-metric glass-panel"><span>Historical high-risk signals</span><strong>{displayMetric(stats?.historical_high_risk_signals)}</strong><small>NYC 311 reference data only</small></article>
        <article className="admin-metric glass-panel"><span>Emerging reference signals</span><strong>{displayMetric(stats?.emerging_issues)}</strong><small>{stats?.signals_scope || "Scope unavailable"}</small></article>
        <article className="admin-metric glass-panel"><span>Model accuracy</span><strong>{stats?.ai_accuracy == null ? "Unavailable" : `${stats.ai_accuracy}%`}</strong><small>Only shown when evaluated</small></article>
      </div>

      <div className="admin-status-grid">
        <article className="admin-status-card glass-panel">
          <div className="admin-section-heading"><div><span className="admin-kicker">ML SYSTEM</span><h2>{overview?.model_version || "Model status"}</h2></div><span className={`admin-state ${overview?.model_loaded ? "good" : "warn"}`}>{overview?.model_loaded ? "Loaded" : "Unavailable"}</span></div>
          <p>Classifier: {health?.model_loaded ? "ready" : "not loaded"} · Vectorizer: {health?.vectorizer_loaded ? "ready" : "not loaded"}</p>
          <small>NYC 311 trained model; not validated for local West Bengal reports.</small>
        </article>
        <article className="admin-status-card glass-panel">
          <div className="admin-section-heading"><div><span className="admin-kicker">CONVERSATION PROVIDER</span><h2>{provider?.selected_provider || "Provider status"}</h2></div><span className={`admin-state ${provider?.selected_provider_configured ? "good" : "warn"}`}>{provider?.selected_provider_configured ? "Configured" : "Not configured"}</span></div>
          <p>Model: {provider?.selected_model || "Unavailable"}</p>
          <small>{provider?.local_ollama_available ? "Local Ollama is reachable." : "Provider status comes from the real PeopleCare status API."}</small>
        </article>
        <article className="admin-status-card glass-panel">
          <div className="admin-section-heading"><div><span className="admin-kicker">BACKEND</span><h2>{health?.status || "Health status"}</h2></div><span className={`admin-state ${health?.status === "healthy" || health?.status === "ok" ? "good" : "warn"}`}>{health?.status || "Unknown"}</span></div>
          <p>Report storage: {overview?.report_storage || "Unavailable"}</p>
          <small>Last refreshed {lastRefreshedAt ? lastRefreshedAt.toLocaleTimeString() : "Not yet refreshed"}.</small>
        </article>
      </div>

      <section className="admin-section admin-phone-alerts glass-panel" aria-labelledby="admin-phone-alerts-title">
        <div className="admin-phone-connect-layout">
          <div className="admin-phone-connect-copy">
            <span className="admin-kicker">PHONE CONNECTION</span>
            <h2 id="admin-phone-alerts-title">Open your Admin Console on a phone</h2>
            <p>Scan the QR code with your phone camera, open the secure PeopleCare AI site, then sign in with your admin password. Reports, status controls, analytics, and activity history use the same live backend.</p>
            {!phoneLinkIsSecure && <div className="admin-phone-local-note" role="note">This page is running on a local development address. A phone cannot reach this computer through its own “localhost,” and push permissions require HTTPS. The QR and share link will become available after the site is deployed to HTTPS.</div>}
            {!pushConfig?.configured && <small>Phone alerts also require the Flask server to have Web Push VAPID credentials configured.</small>}
          </div>
          <div className="admin-phone-qr" aria-label={phoneLinkIsSecure ? "QR code for the secure admin page" : "Phone QR code unavailable before secure hosting"}>
            {phoneLinkIsSecure
              ? <QRCodeSVG value={phoneAdminUrl} size={132} level="M" marginSize={2} title="Open PeopleCare AI Admin Console on your phone" />
              : <div className="admin-phone-qr-placeholder" aria-hidden="true">QR<br />after HTTPS</div>}
            <small>{phoneLinkIsSecure ? "Scan to open /admin" : "Secure deployment required"}</small>
            {phoneLinkIsSecure && <button type="button" className="admin-secondary-button" onClick={sharePhoneAdminLink}>Share secure link</button>}
          </div>
        </div>
        <div className="admin-phone-actions">
          {phoneAlertsEnabled
            ? <button type="button" className="admin-secondary-button" disabled={pushBusy} onClick={disablePhoneAlerts}>{pushBusy ? "Updating…" : "Disable alerts on this device"}</button>
            : <button type="button" className="admin-primary-button" disabled={pushBusy || !pushConfig?.configured || !phoneLinkIsSecure} onClick={enablePhoneAlerts}>{pushBusy ? "Enabling…" : phoneLinkIsSecure ? "Enable phone alerts" : "Enable alerts after HTTPS hosting"}</button>}
          {phoneAlertsEnabled && <button type="button" className="admin-secondary-button" disabled={pushBusy} onClick={sendTestPhoneAlert}>{pushBusy ? "Sending…" : "Send test alert"}</button>}
          <span className={`admin-state ${phoneAlertsEnabled ? "good" : pushConfig?.configured ? "warn" : ""}`}>
            {phoneAlertsEnabled ? "This device enabled" : !phoneLinkIsSecure ? "Waiting for phone HTTPS setup" : pushConfig?.configured ? `${pushConfig.device_count || 0} device(s) subscribed` : "Push setup required"}
          </span>
        </div>
      </section>

      <section className="admin-section glass-panel" aria-labelledby="admin-activity-title">
        <div className="admin-section-heading"><div><span className="admin-kicker">RECENT COMMUNITY ACTIVITY</span><h2 id="admin-activity-title">Help interactions and incoming requests</h2></div><span className="admin-count">{activityEvents.length} events</span></div>
        {activityEvents.length
          ? <ul className="admin-audit-list admin-activity-list">{activityEvents.slice(0, 12).map((event) => <li key={event.id}><span><strong>{event.title}</strong><small>{event.category ? `${event.category}${event.ticket_id ? ` · ${event.ticket_id}` : ""}` : event.body}</small></span><time>{displayTime(event.timestamp)}</time></li>)}</ul>
          : <p className="admin-empty">No help or report activity has been recorded yet.</p>}
        <small className="admin-privacy-note">The activity feed intentionally omits report descriptions, names, phone numbers, and exact locations. Opening emergency guidance is not a confirmed emergency.</small>
      </section>

      <section className="admin-section glass-panel">
        <div className="admin-section-heading admin-report-heading">
          <div><span className="admin-kicker">REPORT OPERATIONS</span><h2>Community reports</h2><p>{visibleReports.length} of {reports.length} reports · update allowed statuses or delete a record after confirmation.</p></div>
          <div className="admin-filter-controls">
            <input aria-label="Search reports" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ticket, text, category, location…" />
            <select aria-label="Filter reports by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="All">All statuses</option>
              {Object.keys(STATUS_TRANSITIONS).map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <select aria-label="Filter reports by priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
              <option value="All">All priorities</option>
              {["Low", "Normal", "Medium", "High", "Urgent", "Critical"].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </div>
        </div>
        <div className="admin-table-scroll" aria-busy={checking}>
          <table className="admin-report-table">
            <thead><tr><th>Ticket / issue</th><th>Location</th><th>Priority</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {visibleReports.map((report) => (
                <tr className="admin-report-row" key={report.id}>
                  <td data-label="Ticket / issue"><strong>{report.ticket_id || `#${report.id}`}</strong><span>{report.category || "Uncategorized"}</span><p>{report.report || "No report text"}</p></td>
                  <td data-label="Location">{report.location || "Not specified"}</td>
                  <td data-label="Priority">{report.priority || "Normal"}</td>
                  <td data-label="Status"><select aria-label={`Status for ${report.ticket_id || report.id}`} value={statusDrafts[report.id] || report.status} onChange={(event) => setStatusDrafts((current) => ({ ...current, [report.id]: event.target.value }))}>{[report.status, ...(STATUS_TRANSITIONS[report.status] || [])].filter(Boolean).map((status) => <option key={status}>{status}</option>)}</select></td>
                  <td data-label="Actions"><div className="admin-row-actions"><button type="button" disabled={busyId === report.id || (statusDrafts[report.id] || report.status) === report.status} onClick={() => updateStatus(report)}>{busyId === report.id ? "Saving…" : "Save"}</button><button type="button" className="danger" disabled={busyId === report.id} onClick={() => deleteReport(report)}>Delete</button></div></td>
                </tr>
              ))}
              {!visibleReports.length && <tr><td colSpan="5" className="admin-empty">{checking && !reports.length ? "Loading protected report records…" : reports.length ? "No reports match these filters." : "No stored reports are available."}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="admin-lower-grid">
        <section className="admin-section glass-panel">
          <div className="admin-section-heading"><div><span className="admin-kicker">OBSERVED DATA</span><h2>Community signals</h2></div><span className="admin-count">{signals.length} available</span></div>
          {signals.length ? <ul className="admin-signal-list">{signals.slice(0, 6).map((signal, index) => <li key={signal.id || signal.issue || index}><span><strong>{signal.issue || signal.complaint_type || "Community signal"}</strong><small>{signal.category || signal.location || "Reference data"}</small></span><b>{signal.risk || signal.severity || "Observed"}</b></li>)}</ul> : <p className="admin-empty">The backend returned no signals.</p>}
        </section>

        <section className="admin-section glass-panel">
          <div className="admin-section-heading"><div><span className="admin-kicker">AUDIT HISTORY</span><h2>Recent admin actions</h2></div><span className="admin-count">{auditEvents.length} events</span></div>
          {auditEvents.length ? <ul className="admin-audit-list">{auditEvents.slice(0, 8).map((event, index) => <li key={`${event.timestamp}-${index}`}><span><strong>{event.action}</strong><small>{event.entity} {event.entity_id ? `#${event.entity_id}` : ""}{event.fields?.length ? ` · ${event.fields.join(", ")}` : ""}</small></span><time>{displayTime(event.timestamp)}</time></li>)}</ul> : <p className="admin-empty">No administrator report changes have been recorded yet.</p>}
        </section>
      </div>

      <section className="admin-section admin-capability-note glass-panel">
        <div><span className="admin-kicker">ACCESS & MODULE COVERAGE</span><h2>Honest control boundaries</h2></div>
        <p>Admin access uses the server-configured password or the explicit loopback-only demo mode. User accounts and role management are not implemented. Emergency, blood, and resource registries do not expose management APIs, so this console does not offer fake controls for them. Configure provider secrets on the Flask server, never in this page.</p>
      </section>
    </section>
  );
}
