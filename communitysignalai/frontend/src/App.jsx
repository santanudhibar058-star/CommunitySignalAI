import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import JarvisCore from "./components/JarvisCore.jsx";
import GalaxyBackground from "./components/GalaxyBackground.jsx";
import { apiUrl } from "./api.js";
import "./App.css";
import "./design-system.css";

const PeopleCareAssistantView = lazy(() => import("./components/PeopleCareAssistantView.jsx"));
const AdminPanel = lazy(() => import("./components/AdminPanel.jsx"));

const NAV = [
  { id: "dashboard", icon: "⌂", label: "Dashboard" },
  { id: "peoplecare", icon: "✦", label: "PeopleCare AI" },
  { id: "report", icon: "＋", label: "Report Problem" },
  { id: "signals", icon: "◉", label: "Community Signals" },
  { id: "analytics", icon: "▥", label: "Analytics" },
  { id: "reports", icon: "▤", label: "Manage Reports" },
  { id: "road", icon: "⌁", label: "Road & Infrastructure" },
  { id: "admin", icon: "⚙", label: "Admin Console" },
];

const HELP = [
  { id: "emergency", icon: "✚", title: "Emergency Help", text: "Police, fire, ambulance & urgent help", tone: "red" },
  { id: "blood", icon: "♥", title: "Blood Assistance", text: "Create a blood requirement request", tone: "rose" },
  { id: "night", icon: "☾", title: "Night Help", text: "Safer night travel & destination help", tone: "blue" },
  { id: "women", icon: "◌", title: "Women Safety", text: "Safety support and trusted contacts", tone: "purple" },
];

const ASSISTANCE_ACTIVITY_TYPES = {
  emergency: "emergency_help_opened",
  blood: "blood_assistance_opened",
  night: "night_help_opened",
  women: "women_safety_opened",
  road: "road_help_opened",
};

const CATEGORY_OPTIONS = [
  "AI will classify",
  "Road Damage",
  "Water System",
  "Noise",
  "Sanitation",
  "Illegal Parking",
  "Street Lighting",
  "Other Civic Issue",
];
const categoryOptionLabel = (value) => value === "AI will classify" ? "AI classify issue type (NYC ML is separate reference)" : value;

const REPORT_STATUS_TRANSITIONS = {
  Pending: ["Under Review", "Rejected"],
  "Under Review": ["Assigned", "In Progress", "Rejected"],
  Assigned: ["In Progress", "Rejected"],
  "In Progress": ["Resolved", "Under Review"],
  Resolved: ["Under Review"],
  Rejected: ["Under Review"],
};

const FALLBACK_STATS = {
  total_reports: 0,
  resolved_reports: 0,
  high_priority: 0,
  emerging_issues: 0,
  ai_accuracy: null,
  anomalies: null,
  hotspot_clusters: null,
};

function safeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function normalizeSignal(row, index) {
  const score = safeNumber(
    row.community_signal_score ?? row.signal_score ?? row.score
  );

  const growth = safeNumber(
    row.growth_percentage ?? row.growth_pct ?? row.growth
  );

  const risk =
    row.risk_level ||
    row.risk ||
    (score >= 50 ? "High" : score >= 30 ? "Moderate" : "Low");

  return {
    id: row.id ?? row.complaint_type ?? index,
    issue:
      row.complaint_type ||
      row.category ||
      row.issue ||
      "Unknown issue",
    growth,
    score,
    risk,
    volume: safeNumber(row.current_count ?? row.volume ?? row.count),
  };
}

function useTilt() {
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const move = (event) => {
      const rect = element.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;

      element.style.setProperty("--rx", `${y * -5}deg`);
      element.style.setProperty("--ry", `${x * 5}deg`);
      element.style.setProperty("--mx", `${x * 100}%`);
      element.style.setProperty("--my", `${y * 100}%`);
    };

    const leave = () => {
      element.style.setProperty("--rx", "0deg");
      element.style.setProperty("--ry", "0deg");
      element.style.setProperty("--mx", "50%");
      element.style.setProperty("--my", "50%");
    };

    element.addEventListener("mousemove", move);
    element.addEventListener("mouseleave", leave);

    return () => {
      element.removeEventListener("mousemove", move);
      element.removeEventListener("mouseleave", leave);
    };
  }, []);

  return ref;
}

function App() {
  const [active, setActive] = useState(() => {
    if (window.location.pathname.replace(/\/+$/, "") === "/admin") return "admin";
    const requested = new URLSearchParams(window.location.search).get("view");
    return NAV.some((item) => item.id === requested) ? requested : "dashboard";
  });
  const [adminAuth, setAdminAuth] = useState({ password: "", authenticated: false });
  const [stats, setStats] = useState(FALLBACK_STATS);
  const [signals, setSignals] = useState([]);
  const [reports, setReports] = useState([]);

  const [report, setReport] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("AI will classify");

  const [prediction, setPrediction] = useState(null);
  const [classifierPreview, setClassifierPreview] = useState(null);
  const [classifierBusy, setClassifierBusy] = useState(false);
  const [classifierError, setClassifierError] = useState("");
  const [reportNotice, setReportNotice] = useState("");
  const [reportError, setReportError] = useState("");
  const submissionAttemptRef = useRef(null);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [search, setSearch] = useState("");
  const [reportSearch, setReportSearch] = useState("");
  const [reportStatus, setReportStatus] = useState("All");
  const [reportCategory, setReportCategory] = useState("All");
  const [reportPriority, setReportPriority] = useState("All");
  const [editingReport, setEditingReport] = useState(null);
  const [reportActionLoading, setReportActionLoading] = useState(false);
  const [mouse, setMouse] = useState({ x: 50, y: 50 });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavButtonRef = useRef(null);

  function recordPublicActivity(eventType) {
    if (!eventType) return;
    fetch(apiUrl("/api/activity"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_type: eventType }),
      keepalive: true,
    }).catch(() => {});
  }

  function openAssistance(type) {
    if (type) recordPublicActivity(ASSISTANCE_ACTIVITY_TYPES[type]);
    setModal(type);
  }

  useEffect(() => {
    const move = (event) => {
      setMouse({
        x: (event.clientX / window.innerWidth) * 100,
        y: (event.clientY / window.innerHeight) * 100,
      });
    };

    window.addEventListener("mousemove", move);

    return () => window.removeEventListener("mousemove", move);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const navButton = mobileNavButtonRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    document.querySelector("#primary-sidebar .nav-item")?.focus();
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      navButton?.focus();
    };
  }, [mobileNavOpen]);

  const jsonFetch = useCallback(async (url, options = {}) => {
    const headers = {
      ...(adminAuth.authenticated && adminAuth.password ? { Authorization: `Bearer ${adminAuth.password}` } : {}),
      ...(options.headers || {}),
    };
    const response = await fetch(apiUrl(url), { ...options, headers });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(payload.error || payload.message || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return payload;
  }, [adminAuth]);

  async function runReportClassification(description, domain = "general") {
    const text = String(description || "").trim();
    if (!text) {
      setClassifierError("Describe the problem before asking AI to classify it.");
      return null;
    }
    setClassifierBusy(true);
    setClassifierError("");
    try {
      const result = await jsonFetch("/api/reports/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: text, domain }),
      });
      const preview = { category: result.ai_category, description: text, domain };
      setClassifierPreview(preview);
      return preview;
    } catch (error) {
      setClassifierError(error.message || "The configured AI classifier is unavailable.");
      setClassifierPreview(null);
      return null;
    } finally {
      setClassifierBusy(false);
    }
  }

  const loadDashboard = useCallback(async () => {
  let hasConnection = false;

  try {
    const statsData = await jsonFetch("/api/stats");

    setStats({
      ...FALLBACK_STATS,
      ...statsData,
    });

    hasConnection = true;
  } catch (error) {
    console.log("Stats loading error:", error.message);
  }

  try {
    const signalsData = await jsonFetch("/api/signals");

    setSignals(
      (Array.isArray(signalsData)
        ? signalsData
        : signalsData.signals || []
      ).map(normalizeSignal)
    );

    hasConnection = true;
  } catch (error) {
    console.log("Signals loading error:", error.message);
  }

  try {
    const reportsData = await jsonFetch("/api/reports");

    setReports(
      Array.isArray(reportsData)
        ? reportsData
        : reportsData.reports || []
    );

    hasConnection = true;
  } catch (error) {
    console.log("Reports loading error:", error.message);
  }

  setConnected(hasConnection);

  if (hasConnection) {
    setLastUpdated(new Date());
  }
  }, [jsonFetch]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadDashboard(), 0);
    const timer = window.setInterval(loadDashboard, 10000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [loadDashboard]);

  function navigate(section) {
    if (section === "report") recordPublicActivity("report_started");
    setActive(section);
    setMobileNavOpen(false);
    const url = new URL(window.location.href);
    if (section === "admin") {
      url.pathname = "/admin";
      url.searchParams.delete("view");
    } else {
      if (url.pathname.replace(/\/+$/, "") === "/admin") url.pathname = "/";
      if (section === "dashboard") url.searchParams.delete("view");
      else url.searchParams.set("view", section);
    }
    window.history.replaceState({}, "", url);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function submitReport(event) {
    event.preventDefault();
    const submittedText = report.trim();
    const submittedLocation = location.trim();
    if (!submittedText || loading) {
      if (!submittedText) setReportError("Describe the community problem before submitting.");
      return;
    }

    setLoading(true);
    setPrediction(null);
    setReportError("");
    setReportNotice("");

    const signature = JSON.stringify([submittedText, submittedLocation, category]);
    if (submissionAttemptRef.current?.signature !== signature) {
      const submissionId = globalThis.crypto?.randomUUID?.()
        || `pc-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      submissionAttemptRef.current = { signature, submissionId };
    }

    const autoClassify = category === "AI will classify";
    const currentPreview = classifierPreview?.description === submittedText && classifierPreview?.domain === "general"
      ? classifierPreview
      : null;
    // Save first; the backend runs configured AI and ML classifiers asynchronously.
    // A citizen-selected category is kept even when the AI suggests another type.
    const selectedCategory = autoClassify ? (currentPreview?.category || "Classification pending") : category;

    try {
      const saved = await jsonFetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: selectedCategory,
          description: submittedText,
          location: submittedLocation,
          auto_classify: autoClassify,
          classification_domain: "general",
          ai_category: currentPreview?.category,
          submission_id: submissionAttemptRef.current.submissionId,
        }),
      });
      const savedReport = saved.report;
      if (!saved.success || !savedReport?.ticket_id) {
        throw new Error("The server did not confirm that the report was saved.");
      }

      setPrediction({
        category: savedReport.ai_category || currentPreview?.category || "Classification queued",
        mlReferenceCategory: savedReport.ml_reference_category || "Pending",
        status: savedReport.ai_classification_status || "queued",
      });
      setReportNotice(`Report saved. Ticket ID: ${savedReport.ticket_id}. AI issue type: ${savedReport.ai_category || currentPreview?.category || "classification queued for admin review"}.`);
      setReport("");
      submissionAttemptRef.current = null;
      await loadDashboard();
    } catch (error) {
      console.error("Report save failed:", error);
      setReportError(`The report was not confirmed as saved: ${error.message}. Your description is still here; retrying will not create a duplicate.`);
    } finally {
      setLoading(false);
    }
}
  async function updateReport(reportId, changes) {
    setReportActionLoading(true);
    try {
      await jsonFetch(`/api/reports/${reportId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      setEditingReport(null);
      try {
        await loadDashboard();
      } catch {
        alert("Report updated successfully, but the list could not refresh. Use Refresh to reload it.");
      }
    } catch (error) {
      console.error("Update report error:", error);
      alert("Unable to update this report. Check that Flask is running.");
    } finally {
      setReportActionLoading(false);
    }
  }

  async function deleteReport(reportId) {
    if (!window.confirm("Delete this report? This cannot be undone.")) return;
    setReportActionLoading(true);
    try {
      await jsonFetch(`/api/reports/${reportId}`, { method: "DELETE" });
      try {
        await loadDashboard();
      } catch {
        alert("Report deleted successfully, but the list could not refresh. Use Refresh to reload it.");
      }
    } catch (error) {
      console.error("Delete report error:", error);
      alert("Unable to delete this report. Check that Flask is running.");
    } finally {
      setReportActionLoading(false);
    }
  }

  async function saveAssistanceRequest(type, values = {}, aiCategory = null) {
    const labels = {
      blood: "Blood Assistance",
      night: "Night Help",
      women: "Women Safety",
      road: "Road Damage",
      ambulance: "Ambulance Assistance",
      fire: "Fire Emergency",
      police: "Police Assistance",
      emergency: "Emergency Assistance",
    };

    try {
      const roadRequest = type === "road";
      const description = roadRequest
        ? String(values.description || "").trim()
        : `${labels[type] || type}: ${JSON.stringify(values)}`;
      if (roadRequest && !description) {
        alert("Describe the road or infrastructure problem before submitting.");
        return null;
      }
      const saved = await jsonFetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category: labels[type] || type,
          description,
          priority: roadRequest && values.severity === "Moderate" ? "Medium" : roadRequest ? values.severity : "Normal",
          request_kind: "assistance",
          classification_domain: roadRequest ? "road" : "general",
          ai_category: roadRequest ? aiCategory : undefined,
          location:
            values.location ||
            location ||
            "Not specified",
        }),
      });

      await loadDashboard();

      setModal(null);

      if (roadRequest) {
        alert(`Road report saved. Ticket ID: ${saved.report?.ticket_id || "created"}. AI issue type: ${saved.report?.ai_category || "classification queued for admin review"}.`);
      } else {
        alert("Request recorded successfully.");
      }
      return saved.report || null;
    } catch {
      alert(
        "Backend is not connected. Start Flask and try again."
      );
      return null;
    }
  }

  const filteredSignals = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return signals;

    return signals.filter(
      (s) =>
        s.issue.toLowerCase().includes(query) ||
        s.risk.toLowerCase().includes(query)
    );
  }, [signals, search]);

  const topSignals = filteredSignals.slice(0, 8);

  const total = safeNumber(stats.total_reports);
  const resolved = safeNumber(stats.resolved_reports);

  const resolution = total
    ? Math.round((resolved / total) * 100)
    : 0;

  return (
    <div
      className="app-shell"
      style={{
        "--mouse-x": `${mouse.x}%`,
        "--mouse-y": `${mouse.y}%`,
      }}
    >
      <GalaxyBackground activeView={active} />

      <aside id="primary-sidebar" className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
        <div
          className="brand"
          onClick={() => navigate("dashboard")}
        >
          <div className="brand-mark">
            <span>CS</span>
          </div>

          <div>
            <strong>CommunitySignal</strong>
            <small>AI • COMMUNITY INTELLIGENCE</small>
          </div>
        </div>

        <div className="profile-mini">
          <div className="avatar">S</div>

          <div>
            <strong>Santanu</strong>
            <span>Community user</span>
          </div>

          <span className="online-dot" />
        </div>

        <nav className="nav-list">
          <div className="nav-label">WORKSPACE</div>

          {NAV.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${
                active === item.id ? "active" : ""
              }`}
              aria-label={item.label}
              title={item.label}
              onClick={() => navigate(item.id)}
            >
              <span className="nav-icon">
                {item.icon}
              </span>

              <span>{item.label}</span>

              {item.id === "signals" &&
                stats.emerging_issues > 0 && (
                  <b className="nav-count">
                    {stats.emerging_issues}
                  </b>
                )}
            </button>
          ))}

          <div className="nav-label support-label">
            ASSISTANCE
          </div>

          {HELP.map((item) => (
            <button
              key={item.id}
              className="nav-item"
              aria-label={item.title}
              title={item.title}
              onClick={() => {
                openAssistance(item.id);
                setMobileNavOpen(false);
              }}
            >
              <span
                className={`nav-icon tone-${item.tone}`}
              >
                {item.icon}
              </span>

              <span>
                {item.title.replace(" Assistance", "")}
              </span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="system-card">
            <div className="system-row">
              <span
                className={`status-dot ${
                  connected ? "connected" : ""
                }`}
              />

              {connected
                ? "AI system online"
                : "Waiting for backend"}
            </div>

            <small>
              Live data refreshes automatically
            </small>
          </div>

          <button
            className="settings-btn"
            onClick={() =>
              alert(
                "Settings can be connected to authentication/database later."
              )
            }
          >
            ⚙ Settings
          </button>
        </div>
      </aside>

      {mobileNavOpen && (
        <button
          type="button"
          className="mobile-nav-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <main className="main-shell">
        <header className="topbar">
          <button
            ref={mobileNavButtonRef}
            type="button"
            className="mobile-nav-trigger"
            aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileNavOpen}
            aria-controls="primary-sidebar"
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            <span aria-hidden="true">{mobileNavOpen ? "×" : "☰"}</span>
          </button>
          <div className="mobile-brand">
            CommunitySignal <span>AI</span>
          </div>

          <div className="top-search">
            <span>⌕</span>

            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search community signals..."
            />
          </div>

          <div className="top-actions">
            <div
              className={`live-pill ${
                connected ? "live" : ""
              }`}
            >
              <span />
              {connected ? "LIVE AI" : "OFFLINE"}
            </div>

            <button
              className="icon-btn"
              title="Refresh"
              onClick={loadDashboard}
            >
              ↻
            </button>

            <div className="top-user">
              <div className="avatar small">S</div>
              <span>Santanu</span>
            </div>
          </div>
        </header>

        <div
          className={`page-content page-enter ${active === "dashboard" ? "dashboard-galaxy-page" : ""}`}
          key={active}
        >
          {active === "dashboard" && (
            <Dashboard
              stats={stats}
              resolution={resolution}
              report={report}
              setReport={setReport}
              location={location}
              setLocation={setLocation}
              category={category}
              setCategory={setCategory}
              prediction={prediction}
              reportNotice={reportNotice}
              reportError={reportError}
              setReportNotice={setReportNotice}
              setReportError={setReportError}
              loading={loading}
              submitReport={submitReport}
              classifyReport={runReportClassification}
              classifierPreview={classifierPreview}
              classifierBusy={classifierBusy}
              classifierError={classifierError}
              setClassifierError={setClassifierError}
              topSignals={topSignals}
              signals={signals}
              setModal={openAssistance}
              navigate={navigate}
              reports={reports}
              connected={connected}
              lastUpdated={lastUpdated}
            />
          )}

          {active === "peoplecare" && (
            <Suspense fallback={<div className="empty-state" role="status">Loading PeopleCare AI workspace…</div>}>
              <PeopleCareAssistantView stats={stats} signals={topSignals} navigate={navigate} openAssistance={openAssistance} recordActivity={recordPublicActivity} />
            </Suspense>
          )}

          {active === "report" && (
            <ReportPage
              report={report}
              setReport={setReport}
              location={location}
              setLocation={setLocation}
              category={category}
              setCategory={setCategory}
              prediction={prediction}
              reportNotice={reportNotice}
              reportError={reportError}
              loading={loading}
              submitReport={submitReport}
              classifyReport={runReportClassification}
              classifierPreview={classifierPreview}
              classifierBusy={classifierBusy}
              classifierError={classifierError}
              setClassifierError={setClassifierError}
            />
          )}

          {active === "signals" && (
            <SignalsPage
              signals={filteredSignals}
            />
          )}

          {active === "analytics" && (
            <AnalyticsPage
              stats={stats}
              signals={signals}
              reports={reports}
            />
          )}

          {active === "reports" && (
            <ReportsPage
              reports={reports}
              adminAuthenticated={adminAuth.authenticated}
              navigate={navigate}
              setReports={setReports}
              reportSearch={reportSearch}
              setReportSearch={setReportSearch}
              reportStatus={reportStatus}
              setReportStatus={setReportStatus}
              reportCategory={reportCategory}
              setReportCategory={setReportCategory}
              reportPriority={reportPriority}
              setReportPriority={setReportPriority}
              editingReport={editingReport}
              setEditingReport={setEditingReport}
              loading={reportActionLoading}
              setLoading={setReportActionLoading}
              loadDashboard={loadDashboard}
              updateReport={updateReport}
              deleteReport={deleteReport}
            />
          )}

          {active === "road" && (
            <RoadPage
              onSave={(values, aiCategory) =>
                saveAssistanceRequest("road", values, aiCategory)
              }
              classifyReport={runReportClassification}
              classifierPreview={classifierPreview}
              classifierBusy={classifierBusy}
              classifierError={classifierError}
              setClassifierError={setClassifierError}
            />
          )}

          {active === "admin" && (
            <Suspense fallback={<div className="empty-state" role="status">Loading secure admin console…</div>}>
              <AdminPanel access={adminAuth} onAccessChange={setAdminAuth} jsonFetch={jsonFetch} />
            </Suspense>
          )}
        </div>
      </main>

      {modal && (
        <AssistanceModal
          type={modal}
          close={() => setModal(null)}
          onSave={saveAssistanceRequest}
          openModal={openAssistance}
          recordActivity={recordPublicActivity}
        />
      )}
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  text,
  action,
}) {
  return (
    <div className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>

        <h1>{title}</h1>

        <p>{text}</p>
      </div>

      {action}
    </div>
  );
}

function Dashboard({
  stats,
  resolution,
  report,
  setReport,
  location,
  setLocation,
  category,
  setCategory,
  prediction,
  reportNotice,
  reportError,
  setReportNotice,
  setReportError,
  loading,
  submitReport,
  classifyReport,
  classifierPreview,
  classifierBusy,
  classifierError,
  setClassifierError,
  topSignals,
  signals,
  setModal,
  navigate,
  reports,
  connected,
  lastUpdated,
}) {
  const topSignal = topSignals[0];
  const secondSignal = topSignals[1];
  const thirdSignal = topSignals[2];

  return (
    <>
      <PageHeader
        eyebrow="COMMUNITYSIGNAL AI / COMMAND CENTER"
        title="Community intelligence, in one view."
        text="AI-powered monitoring for civic issues, emerging problems and community assistance."
        action={
          <div className="command-live">
            <span className={connected ? "live-dot" : "live-dot offline"} />
            <div>
              <b>{connected ? "SYSTEM LIVE" : "LOCAL PREVIEW"}</b>
              <small>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Waiting for API"}</small>
            </div>
          </div>
        }
      />

      <section className="command-hero-grid">
        <div className="command-hero card">
          <div className="command-hero-glow" />
          <div className="command-hero-content">
            <div className={`hero-kicker ${connected ? "connected" : "offline"}`}><span /> PEOPLECARE AI · COMMUNITY SIGNAL MONITOR</div>
            <h2>PeopleCare AI is watching for <em>early community signals.</em></h2>
            <p>It organizes available reports and reference-signal data to make recurring issues easier to review. Historical NYC signals are not live local forecasts or emergency dispatch.</p>

            <div className="hero-actions">
              <button className="primary-btn hero-primary" onClick={() => navigate("signals")}>Explore AI signals <b>↗</b></button>
              <button className="hero-secondary" onClick={() => setModal("emergency")}>Emergency assistance <b>→</b></button>
            </div>

            <div className="hero-footnote"><span className={`status-dot ${connected ? "connected" : ""}`} /> {connected ? "Community data available" : "Backend not connected"} · Decision support only, not emergency dispatch</div>
          </div>

          <div className={`signal-radar ${connected ? "scan-active" : "scan-idle"}`} aria-hidden="true">
            <div className="radar-ring r1" /><div className="radar-ring r2" /><div className="radar-ring r3" />
            <div className="radar-globe" />
            <div className="radar-sweep" />
            <JarvisCore state={connected ? "idle" : "error"} size={194} label="PeopleCare AI community signal monitor" />
            <i className="radar-node n1" /><i className="radar-node n2" /><i className="radar-node n3" /><i className="radar-node n4" />
          </div>
        </div>

        <div className="command-side-stack">
          <div className="card command-health">
            <div className="command-card-head"><span className="mini-kicker">MODEL HEALTH</span><span className="health-badge">ONLINE</span></div>
            <div className="health-main"><strong>{stats.ai_accuracy == null ? "—" : `${stats.ai_accuracy}%`}</strong><span>classification accuracy</span></div>
            <div className="health-line"><i style={{ width: `${Math.min(100, Number(stats.ai_accuracy) || 0)}%` }} /></div>
            <div className="health-grid"><div><b>757</b><span>TF-IDF features</span></div><div><b>113</b><span>active classes</span></div></div>
          </div>

          <div className="card command-risk">
            <div className="command-card-head"><span className="mini-kicker">SIGNAL WATCH</span><span className="signal-pulse" /></div>
            <div className="risk-number"><strong>{stats.emerging_issues}</strong><span>emerging signals</span></div>
            <div className="signal-mini-list">
              {[topSignal, secondSignal, thirdSignal].filter(Boolean).map((s, i) => (
                <div key={s.id || s.issue || i}><span className={`signal-severity ${String(s.risk || "low").toLowerCase()}`} /><b>{s.issue}</b><em>{s.growth > 0 ? `+${Number(s.growth).toFixed(0)}%` : "watch"}</em></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="command-kpis">
        <Kpi title="Total reports" value={stats.total_reports} meta={`${resolution}% resolved`} icon="◫" tone="purple" />
        <Kpi title="High priority" value={stats.high_priority} meta="Requires attention" icon="!" tone="red" />
        <Kpi title="Emerging issues" value={stats.emerging_issues} meta="NYC 311 reference scores" icon="◈" tone="orange" />
        <Kpi title="Hotspot clusters" value={stats.hotspot_clusters} meta={stats.anomalies == null ? "Not currently calculated" : `${stats.anomalies} anomalies scanned`} icon="⌁" tone="blue" />
      </section>

      <section className="section-block command-emergency-section">
        <div className="section-title">
          <div><span className="mini-kicker">COMMUNITY ASSISTANCE</span><h2>Help when it matters</h2></div>
          <button className="text-btn" onClick={() => setModal("emergency")}>Open emergency center →</button>
        </div>
        <div className="emergency-dashboard-layout">
          <div className="emergency-dashboard-services">
            <EmergencyServiceCard type="ambulance" title="Ambulance" text="Medical emergency & urgent transport" tone="ambulance" onClick={() => setModal("emergency")} />
            <EmergencyServiceCard type="fire" title="Fire Service" text="Fire, rescue & immediate hazards" tone="fire" onClick={() => setModal("emergency")} />
            <EmergencyServiceCard type="police" title="Police" text="Safety, crime & urgent protection" tone="police" onClick={() => setModal("emergency")} />
            <EmergencyServiceCard type="blood" title="Blood Assistance" text="Find or request urgent blood support" tone="blood" onClick={() => setModal("blood")} />
          </div>
          <PeopleCareAI
            stats={stats}
            signals={topSignals}
            setModal={setModal}
            navigate={navigate}
          />
        </div>
      </section>

      <section className="command-intelligence-grid">
        <div className="card command-signals-panel">
          <div className="card-heading">
            <div><span className="mini-kicker">EARLY WARNING ENGINE</span><h2>Emerging community signals</h2></div>
            <button className="text-btn" onClick={() => navigate("signals")}>View all →</button>
          </div>
          {topSignals.slice(0, 5).map((s, i) => (
            <div className="command-signal-row" key={s.id || s.issue || i}>
              <div className="signal-rank">0{i + 1}</div>
              <div className="signal-row-main"><strong>{s.issue}</strong><span>AI signal score {Number(s.score || 0).toFixed(1)}</span></div>
              <div className="signal-row-growth">{s.growth > 0 ? `+${Number(s.growth).toFixed(0)}%` : "—"}</div>
              <span className={`risk ${String(s.risk || "low").toLowerCase()}`}>{s.risk || "Low"}</span>
            </div>
          ))}
          {!topSignals.length && <div className="empty-state">No emerging signals available. Start Flask and refresh.</div>}
        </div>

        <div className="card command-report-panel">
          <div className="card-heading"><div><span className="mini-kicker">COMMUNITY REPORTER</span><h2>Report an issue</h2></div><span className="ai-chip">AI + ML CLASSIFICATION</span></div>
          <form onSubmit={submitReport}>
            <label>What is happening?</label>
            <textarea maxLength={4000} value={report} onChange={(e) => { setReport(e.target.value); setReportError(""); setReportNotice(""); setClassifierError(""); }} placeholder="Example: Large pothole near the market entrance..." />
            <div className="form-row">
              <div><label>Location</label><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Area / road / landmark" /></div>
              <div><label>Category</label><select value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORY_OPTIONS.map((x) => <option key={x} value={x}>{categoryOptionLabel(x)}</option>)}</select></div>
            </div>
            <div className="report-classifier-controls">
              <button type="button" className="secondary-btn" disabled={classifierBusy || loading || !report.trim()} onClick={() => classifyReport(report, "general")}>{classifierBusy ? "Classifying…" : "Classify issue with AI"}</button>
              {classifierPreview?.description === report.trim() && classifierPreview?.domain === "general" && <span className="classifier-result">AI suggests: <strong>{classifierPreview.category}</strong></span>}
            </div>
            {classifierError && <p className="form-feedback error" role="status">{classifierError}</p>}
            <div className="form-bottom"><span>AI issue type and a separate NYC-trained ML reference are added to admin review after submit. The ML model is not locally validated.</span><button className="primary-btn" disabled={loading}>{loading ? "Saving report…" : "Submit report →"}</button></div>
          </form>
          {reportError && <p className="form-feedback error" role="alert">{reportError}</p>}
          {reportNotice && <p className="form-feedback success" role="status">{reportNotice}</p>}
          {prediction && <div className="prediction-box"><div><span>CLASSIFICATION FOR ADMIN REVIEW</span><strong>AI: {prediction.category}</strong><small>NYC ML reference: {prediction.mlReferenceCategory}. This is historical-domain model output, not a locally validated prediction.</small></div></div>}
        </div>
      </section>

      <section className="command-lower-grid">
        <Heatmap stats={stats} signals={signals} />
        <div className="card category-card tilt-card">
          <div className="card-heading"><div><span className="mini-kicker">REFERENCE SIGNALS</span><h2>Highest observed signal scores</h2></div></div>
          <div className="bars">
            {[...signals].sort((a, b) => b.score - a.score).slice(0, 5).map((signal) => <div className="bar-row" key={signal.id}><div><span>{signal.issue}</span><b>{signal.score.toFixed(1)}</b></div><div className="bar-track" role="progressbar" aria-label={`${signal.issue} reference signal score`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(signal.score)}><i style={{ width: `${Math.min(100, Math.max(0, signal.score))}%` }} /></div></div>)}
            {!signals.length && <div className="empty-state compact-empty">No reference signal scores are available.</div>}
          </div>
          <div className="category-foot"><span>Precomputed NYC 311 reference · not local live data</span><button onClick={() => navigate("analytics")}>Open analytics →</button></div>
        </div>
      </section>

      <section className="card activity-card command-activity">
        <div className="card-heading"><div><span className="mini-kicker">RECENT ACTIVITY</span><h2>Latest community reports</h2></div><button className="text-btn" onClick={() => navigate("analytics")}>View analytics →</button></div>
        {reports.slice(0, 5).map((r, i) => <div className="activity-row" key={r.unique_key || r.id || i}><span className="activity-dot" /><div><strong>{r.complaint_type || r.category || "Community report"}</strong><span>{r.location || r.borough || "Location recorded"}</span></div><time>{r.created_date || r.timestamp || "Recent"}</time></div>)}
        {!reports.length && <div className="empty-state compact-empty">Recent report details are available in the authenticated reports workspace. <button className="text-btn" onClick={() => navigate("reports")}>Open Manage Reports →</button></div>}
      </section>

      <div className="footer-note">CommunitySignal AI • ML-powered community intelligence • Signals are decision-support indicators.</div>
    </>
  );
}

// Retained for the older dashboard variant; it is not part of the active screen.
// eslint-disable-next-line no-unused-vars
function AIEngine({ stats }) {
  const ref = useTilt();

  return (
    <div
      ref={ref}
      className="card intelligence-card tilt-card"
    >
      <div className="card-heading">
        <div>
          <span className="mini-kicker">
            AI ENGINE
          </span>

          <h2>Community intelligence</h2>
        </div>

        <span className="spark">✦</span>
      </div>

      <div className="signal-orbit">
        <div className="orbit o1" />
        <div className="orbit o2" />
        <div className="orbit o3" />

        <div className="orbit-core">
          AI
        </div>

        <i className="orb-dot d1" />
        <i className="orb-dot d2" />
        <i className="orb-dot d3" />
      </div>

      <div className="ai-metrics">
        <div>
          <strong>
            {stats.hotspot_clusters}
          </strong>
          <span>hotspot clusters</span>
        </div>

        <div>
          <strong>{stats.anomalies}</strong>
          <span>anomalies scanned</span>
        </div>

        <div>
          <strong>{stats.emerging_issues}</strong>
          <span>signals now</span>
        </div>
      </div>

      <div className="ai-status">
        <span className="status-dot connected" />

        Trend detection, anomaly scanning and
        classification are active.
      </div>
    </div>
  );
}

function Heatmap({ signals }) {
  const markers = signals.slice(0, 24);
  return (
    <div className="card heat-card tilt-card">
      <div className="card-heading">
        <div>
          <span className="mini-kicker">COMMUNITY SIGNAL FIELD</span>
          <h2>Observed signal patterns</h2>
        </div>

        <span className="map-chip">{markers.length} signal rows</span>
      </div>

      <div className="fake-map">
        <div className="map-grid" />
        {markers.map((signal, i) => (
            <span
              key={signal.id}
              className={`map-point ${String(signal.risk || "low").toLowerCase()}`}
              style={{
                left: `${8 + ((i * 37) % 84)}%`,
                top: `${9 + ((i * 53) % 78)}%`,
                animationDelay: `${i * 90}ms`,
              }}
              title={`${signal.issue} · ${signal.score.toFixed(1)} reference score`}
              aria-hidden="true"
            />
        ))}

        {!markers.length && <div className="field-empty">Signal data is unavailable. Refresh after the API connects.</div>}
        <div className="map-label m1">{markers.length ? `${markers.length} observed rows` : "NO SIGNAL DATA"}</div>

        <div className="map-label m2">DECORATIVE · NOT GEOLOCATED</div>

        <div className="map-legend">
          <span>
            <i /> High
          </span>

          <span>
            <i /> Moderate
          </span>

          <span>
            <i /> Low
          </span>
        </div>
      </div>
      <p className="signal-field-note">Markers represent precomputed NYC 311 reference rows; their positions do not show real places.</p>
    </div>
  );
}

function Kpi({
  title,
  value,
  meta,
  icon,
  tone,
}) {
  const ref = useTilt();

  return (
    <div
      ref={ref}
      className={`kpi-card ${tone} tilt-card`}
    >
      <div className="kpi-top">
        <span>{title}</span>
        <i>{icon}</i>
      </div>

      <strong>
        {typeof value === "number"
          ? value.toLocaleString()
          : value ?? "—"}
      </strong>

      <small>{meta}</small>

      <div className="kpi-line" />
    </div>
  );
}

function SignalTable({ signals }) {
  if (!signals.length) {
    return (
      <div className="card table-card empty-state">
        No AI signals are available yet. Start Flask
        and refresh the page.
      </div>
    );
  }

  return (
    <div className="card table-card">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Issue</th>
              <th>Growth</th>
              <th>Signal score</th>
              <th>Risk</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {signals.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="issue-cell">
                    <span className="issue-mark">
                      ◈
                    </span>

                    <strong>{s.issue}</strong>
                  </div>
                </td>

                <td>
                  <span
                    className={
                      s.growth >= 100
                        ? "growth hot"
                        : "growth"
                    }
                  >
                    {s.growth > 0
                      ? `+${s.growth.toFixed(0)}%`
                      : "—"}
                  </span>
                </td>

                <td>
                  <div className="score">
                    <i
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(3, s.score)
                        )}%`,
                      }}
                    />

                    <span>
                      {s.score.toFixed(1)}
                    </span>
                  </div>
                </td>

                <td>
                  <span
                    className={`risk ${s.risk.toLowerCase()}`}
                  >
                    {s.risk}
                  </span>
                </td>

                <td>
                  <span className="status-badge">
                    Monitoring
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportsPage({
  reports,
  adminAuthenticated,
  navigate,
  reportSearch,
  setReportSearch,
  reportStatus,
  setReportStatus,
  reportCategory,
  setReportCategory,
  reportPriority,
  setReportPriority,
  editingReport,
  setEditingReport,
  loading,
  updateReport,
  deleteReport,
  loadDashboard,
}) {
  if (!adminAuthenticated) {
    return (
      <section className="reports-access-card glass-panel" aria-labelledby="reports-access-title">
        <span className="mini-kicker">PROTECTED REPORT WORKSPACE</span>
        <h1 id="reports-access-title">Administrator access required</h1>
        <p>Community report details and status changes are restricted to the authenticated administrator.</p>
        <button className="primary-btn" type="button" onClick={() => navigate("admin")}>Open Admin Console</button>
      </section>
    );
  }

  const filtered = reports.filter((r) => {
    const q = reportSearch.trim().toLowerCase();
    const matchesSearch = !q || [r.report, r.description, r.location, r.category, r.predicted_problem, r.ai_category, r.ml_reference_category]
      .some((v) => String(v || "").toLowerCase().includes(q));
    const matchesStatus = reportStatus === "All" || String(r.status || "Pending") === reportStatus;
    const matchesCategory = reportCategory === "All" || String(r.category || "") === reportCategory;
    const matchesPriority = reportPriority === "All" || String(r.priority || "Normal") === reportPriority;
    return matchesSearch && matchesStatus && matchesCategory && matchesPriority;
  });

  const categories = [...new Set(reports.map((r) => r.category).filter(Boolean))];
  const statuses = ["Pending", "Under Review", "Assigned", "In Progress", "Resolved", "Rejected"];
  const priorities = ["Low", "Normal", "High", "Critical"];

  return (
    <div className="reports-page">
      <PageHeader
        eyebrow="ADMIN / REPORT MANAGEMENT"
        title="Manage community reports"
        text="Search, review, update and remove reports stored by CommunitySignal AI."
        action={<button className="primary-btn" onClick={loadDashboard}>↻ Refresh</button>}
      />

      <div className="reports-admin-card">
        <div className="reports-admin-top">
          <div>
            <span className="mini-kicker">REPORT CONTROL CENTER</span>
            <h2>Community reports</h2>
            <p>{filtered.length} of {reports.length} reports shown</p>
          </div>
          <div className="reports-admin-live"><span /> LIVE DATABASE</div>
        </div>

        <div className="reports-filters">
          <div className="report-search-box">
            <span>⌕</span>
            <input value={reportSearch} onChange={(e) => setReportSearch(e.target.value)} placeholder="Search description, location or category..." />
          </div>
          <select value={reportStatus} onChange={(e) => setReportStatus(e.target.value)}>
            <option>All</option>{statuses.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select value={reportCategory} onChange={(e) => setReportCategory(e.target.value)}>
            <option>All</option>{categories.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select value={reportPriority} onChange={(e) => setReportPriority(e.target.value)}>
            <option>All</option>{priorities.map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>

        <div className="reports-list">
          {!filtered.length ? (
            <div className="reports-empty"><div>⌁</div><h3>No reports found</h3><p>Try changing the search or filters.</p></div>
          ) : filtered.map((r) => {
            const status = r.status || "Pending";
            const priority = r.priority || "Normal";
            const description = r.report || r.description || "No description provided";
            return (
              <div className="admin-report-row" key={r.id || r.report_id}>
                <div className="admin-report-main">
                  <div className="admin-report-icon">◈</div>
                  <div className="admin-report-copy">
                    <div className="admin-report-title-row">
                      <h3>{r.category || "Community Report"}</h3>
                      <span className={`admin-status status-${status.toLowerCase().replace(/\s+/g, "-")}`}>{status}</span>
                      <span className={`admin-priority priority-${priority.toLowerCase()}`}>{priority}</span>
                    </div>
                    <p>{description}</p>
                    <div className="admin-report-meta"><span>📍 {r.location || "Location not specified"}</span><span>AI issue type: {r.ai_category || (r.ai_classification_status === "queued" ? "Classifying…" : r.ai_classification_status === "unavailable" ? "Unavailable · review needed" : "Not classified")}</span><span>NYC ML reference: {r.ml_reference_category || (r.ml_classification_status === "queued" ? "Classifying…" : r.ml_classification_status === "unavailable" ? "Unavailable" : "Not run")}</span><span>{r.ticket_id || `ID #${r.id || r.report_id}`}</span><span>{r.created_at || "Recent"}</span></div>
                  </div>
                </div>
                <div className="admin-report-actions">
                  <button onClick={() => setEditingReport(r)}>✎ Edit</button>
                  <button className="danger" disabled={loading} onClick={() => deleteReport(r.id || r.report_id)}>⌫ Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editingReport && (
        <ReportEditModal
          report={editingReport}
          loading={loading}
          close={() => setEditingReport(null)}
          onSave={updateReport}
          categories={categories}
          statuses={[status, ...(REPORT_STATUS_TRANSITIONS[status] || [])]}
          priorities={priorities}
        />
      )}

      <style>{`
        .reports-page{width:100%;color:#e8eef9}.reports-admin-card{background:linear-gradient(145deg,rgba(15,23,42,.98),rgba(8,14,27,.98));border:1px solid rgba(100,116,139,.22);border-radius:20px;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.28)}
        .reports-admin-top{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:22px}.reports-admin-top h2{margin:7px 0 5px;font-size:21px}.reports-admin-top p{margin:0;color:#7f8da5;font-size:11px}.reports-admin-live{border:1px solid rgba(52,211,153,.25);background:rgba(52,211,153,.07);color:#86efac;border-radius:999px;padding:8px 11px;font-size:8px;font-weight:800;letter-spacing:.7px}.reports-admin-live span{display:inline-block;width:6px;height:6px;border-radius:50%;background:#34d399;box-shadow:0 0 9px #34d399;margin-right:6px}
        .reports-filters{display:grid;grid-template-columns:minmax(260px,1fr) 160px 190px 150px;gap:10px;margin-bottom:18px}.report-search-box,.reports-filters select{height:42px;background:#0a1220;border:1px solid rgba(100,116,139,.24);border-radius:11px;color:#dbe5f4}.report-search-box{display:flex;align-items:center;padding:0 12px;gap:8px}.report-search-box span{color:#64748b}.report-search-box input{width:100%;border:0;outline:0;background:transparent;color:#e8eef9;font-size:11px}.reports-filters select{padding:0 11px;outline:none;font-size:10px}
        .reports-list{display:grid;gap:10px}.admin-report-row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px;border:1px solid rgba(100,116,139,.16);border-radius:15px;background:rgba(11,18,32,.78);transition:.2s}.admin-report-row:hover{border-color:rgba(139,92,246,.32);transform:translateY(-1px)}.admin-report-main{display:flex;gap:13px;min-width:0}.admin-report-icon{width:38px;height:38px;flex:0 0 38px;border-radius:11px;display:grid;place-items:center;background:rgba(124,58,237,.12);color:#b8a5ff;border:1px solid rgba(139,92,246,.2)}.admin-report-copy{min-width:0}.admin-report-title-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.admin-report-title-row h3{margin:0;font-size:12px;color:#edf3ff}.admin-report-copy p{margin:7px 0;color:#8d9bb0;font-size:10px;line-height:1.55;max-width:900px}.admin-report-meta{display:flex;gap:13px;flex-wrap:wrap;color:#617087;font-size:8px}.admin-status,.admin-priority{border-radius:999px;padding:4px 7px;font-size:7px;font-weight:800;letter-spacing:.3px}.status-pending{background:rgba(245,158,11,.11);color:#fbbf24}.status-in-progress{background:rgba(59,130,246,.11);color:#60a5fa}.status-resolved{background:rgba(34,197,94,.11);color:#4ade80}.status-rejected{background:rgba(239,68,68,.11);color:#f87171}.priority-low{background:rgba(100,116,139,.12);color:#94a3b8}.priority-normal{background:rgba(34,211,238,.10);color:#67e8f9}.priority-high{background:rgba(245,158,11,.11);color:#fbbf24}.priority-critical{background:rgba(239,68,68,.12);color:#fb7185}.admin-report-actions{display:flex;gap:7px;flex:0 0 auto}.admin-report-actions button{border:1px solid rgba(100,116,139,.22);background:#101a2b;color:#cbd5e1;border-radius:9px;padding:8px 10px;font-size:9px;cursor:pointer}.admin-report-actions button:hover{border-color:rgba(139,92,246,.45);color:#fff}.admin-report-actions button.danger:hover{border-color:rgba(239,68,68,.45);color:#fb7185}.admin-report-actions button:disabled{opacity:.5;cursor:not-allowed}.reports-empty{text-align:center;padding:55px 20px;border:1px dashed rgba(100,116,139,.24);border-radius:15px;color:#64748b}.reports-empty div{font-size:30px;color:#8b5cf6}.reports-empty h3{margin:8px 0 4px;color:#cbd5e1}.reports-empty p{font-size:10px;margin:0}
        .report-edit-backdrop{position:fixed;inset:0;background:rgba(2,6,23,.78);backdrop-filter:blur(8px);z-index:100}.report-edit-modal{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(680px,calc(100vw - 30px));max-height:90vh;overflow:auto;background:#0d1627;border:1px solid rgba(139,92,246,.25);border-radius:20px;box-shadow:0 30px 100px rgba(0,0,0,.55);padding:23px}.report-edit-head{display:flex;justify-content:space-between;align-items:flex-start}.report-edit-head h2{margin:5px 0;font-size:20px;color:#f1f5ff}.report-edit-head p{margin:0;color:#7f8da5;font-size:10px}.report-edit-close{border:0;background:transparent;color:#94a3b8;font-size:25px;cursor:pointer}.report-edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin-top:20px}.report-edit-grid label{display:grid;gap:6px;color:#8b9ab0;font-size:9px;font-weight:700}.report-edit-grid .full{grid-column:1/-1}.report-edit-grid input,.report-edit-grid select{height:42px;border:1px solid rgba(100,116,139,.24);border-radius:10px;background:#091221;color:#e8eef9;padding:0 11px;outline:none}.report-edit-grid textarea{min-height:105px;border:1px solid rgba(100,116,139,.24);border-radius:10px;background:#091221;color:#e8eef9;padding:11px;outline:none;resize:vertical}.report-edit-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}.report-edit-actions button{border:1px solid rgba(100,116,139,.24);background:#111c2e;color:#cbd5e1;border-radius:9px;padding:10px 14px;cursor:pointer}.report-edit-actions .save{background:linear-gradient(135deg,#7c3aed,#4f46e5);border:0;color:#fff;font-weight:800}.report-edit-actions button:disabled{opacity:.55}
        @media(max-width:900px){.reports-filters{grid-template-columns:1fr 1fr}.report-search-box{grid-column:1/-1}.admin-report-row{align-items:flex-start;flex-direction:column}.admin-report-actions{width:100%}.admin-report-actions button{flex:1}}@media(max-width:600px){.reports-admin-card{padding:15px}.reports-filters{grid-template-columns:1fr}.report-search-box{grid-column:auto}.report-edit-grid{grid-template-columns:1fr}.report-edit-grid .full{grid-column:auto}}
      `}</style>
    </div>
  );
}

function ReportEditModal({ report, loading, close, onSave, categories, statuses, priorities }) {
  const [form, setForm] = useState({
    category: report.category || "Other Civic Issue",
    location: report.location || "",
    priority: report.priority || "Normal",
    predicted_problem: report.predicted_problem || "",
    status: report.status || "Pending",
  });
  const id = report.id || report.report_id;
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <div className="report-edit-backdrop" onMouseDown={close}>
      <div className="report-edit-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="report-edit-head"><div><span className="mini-kicker">EDIT REPORT #{id}</span><h2>Update community report</h2><p>Change the administrative fields below.</p></div><button className="report-edit-close" onClick={close}>×</button></div>
        <div className="report-edit-grid">
          <label>Category<select value={form.category} onChange={(e) => set("category", e.target.value)}>{[...new Set(["Other Civic Issue", ...categories])].map((x) => <option key={x}>{x}</option>)}</select></label>
          <label>Location<input value={form.location} onChange={(e) => set("location", e.target.value)} /></label>
          <label>Priority<select value={form.priority} onChange={(e) => set("priority", e.target.value)}>{priorities.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label>Status<select value={form.status} onChange={(e) => set("status", e.target.value)}>{statuses.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label>AI predicted problem<input value={form.predicted_problem} onChange={(e) => set("predicted_problem", e.target.value)} /></label>
          <div />
        </div>
        <div className="report-edit-actions"><button onClick={close}>Cancel</button><button className="save" disabled={loading} onClick={() => onSave(id, form)}>{loading ? "Saving..." : "Save changes →"}</button></div>
      </div>
    </div>
  );
}

function ReportPage(props) {
  return (
    <div>
      <PageHeader
        eyebrow="REPORT SYSTEM"
        title="Report a community problem"
        text="Ask PeopleCare AI to classify the issue, then submit it to the administrator review queue. NYC 311 ML output is shown separately as an unvalidated reference."
      />

      <div className="single-panel">
        <div className="card large-form tilt-card">
          <ReportForm {...props} />
        </div>
      </div>
    </div>
  );
}

function ReportForm({
  report,
  setReport,
  location,
  setLocation,
  category,
  setCategory,
  prediction,
  reportNotice,
  reportError,
  loading,
  submitReport,
  classifyReport,
  classifierPreview,
  classifierBusy,
  classifierError,
  setClassifierError,
}) {
  return (
    <form onSubmit={submitReport}>
      <label>Problem description</label>

      <textarea
        className="tall"
        maxLength={4000}
        value={report}
        onChange={(e) => { setReport(e.target.value); setClassifierError(""); }}
        placeholder="Describe the issue in normal language…"
      />

      <div className="form-row">
        <div>
          <label>Location</label>

          <input
            value={location}
            onChange={(e) =>
              setLocation(e.target.value)
            }
            placeholder="Area / landmark"
          />
        </div>

        <div>
          <label>Category</label>

          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value)
            }
          >
            {CATEGORY_OPTIONS.map((x) => (
              <option key={x} value={x}>{categoryOptionLabel(x)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="report-classifier-controls">
        <button type="button" className="secondary-btn" disabled={classifierBusy || loading || !report.trim()} onClick={() => classifyReport(report, "general")}>
          {classifierBusy ? "Classifying…" : "Classify issue with AI"}
        </button>
        {classifierPreview?.description === report.trim() && classifierPreview?.domain === "general" && <span className="classifier-result">AI suggests: <strong>{classifierPreview.category}</strong></span>}
      </div>
      {classifierError && <p className="form-feedback error" role="status">{classifierError}</p>}
      <p className="classifier-help">AI classifies the described issue; the NYC 311 ML result is stored separately as an unvalidated reference for administrator review.</p>

      <button className="primary-btn" disabled={loading} type="submit">
        {loading ? "Saving report…" : "Submit report"}
      </button>

      {reportError && <p className="form-feedback error" role="alert">{reportError}</p>}
      {reportNotice && <p className="form-feedback success" role="status">{reportNotice}</p>}

      {prediction && (
        <div className="prediction-box">
          <div>
            <span>CLASSIFICATION FOR ADMIN REVIEW</span>

            <strong>
              {prediction.category}
            </strong>
            <small>NYC ML reference: {prediction.mlReferenceCategory}. This model is not validated for local reports.</small>
          </div>
        </div>
      )}
    </form>
  );
}

function SignalsPage({ signals }) {
  return (
    <div>
      <PageHeader
        eyebrow="EARLY WARNING ENGINE"
        title="Community signals"
        text="AI-generated indicators built from growth, volume, geographic concentration and anomaly features."
      />

      <SignalTable signals={signals} />
    </div>
  );
}

function AnalyticsPage({
  stats,
  signals,
  reports,
}) {
  const avg = signals.length
    ? signals.reduce(
        (a, b) => a + b.score,
        0
      ) / signals.length
    : 0;

  return (
    <div>
      <PageHeader
        eyebrow="ANALYTICS"
        title="Community intelligence analytics"
        text="A visual overview of the current project dataset and AI signal engine."
      />

      <div className="analytics-grid">
        <Kpi
          title="Reports"
          value={stats.total_reports}
          meta="Current local reports"
          icon="◫"
          tone="purple"
        />

        <Kpi
          title="Resolved"
          value={stats.resolved_reports}
          meta="Current local reports marked resolved"
          icon="✓"
          tone="green"
        />

        <Kpi
          title="Hotspots"
          value={stats.hotspot_clusters}
          meta="Not currently calculated"
          icon="⌁"
          tone="blue"
        />

        <Kpi
          title="Avg signal"
          value={avg.toFixed(1)}
          meta="NYC 311 reference set"
          icon="◈"
          tone="orange"
        />
      </div>

      <div className="analytics-panels">
        <div className="card chart-card">
          <div className="card-heading">
            <div>
              <span className="mini-kicker">
                SIGNAL SCORES
              </span>

              <h2>Top signal intensity</h2>
            </div>
          </div>

          {signals.slice(0, 10).map((s) => (
            <div
              className="chart-row"
              key={s.id}
            >
              <span title={s.issue}>
                {s.issue}
              </span>

              <div>
                <i
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(2, s.score)
                    )}%`,
                  }}
                />
              </div>

              <b>{s.score.toFixed(1)}</b>
            </div>
          ))}
        </div>

        <div className="card metric-story">
          <span className="mini-kicker">
            MODEL SNAPSHOT
          </span>

          <h2>
            How CommunitySignal reasons
          </h2>

          <div className="reason">
            <b>35%</b>
            <span>Growth change</span>
          </div>

          <div className="reason">
            <b>25%</b>
            <span>Current volume</span>
          </div>

          <div className="reason">
            <b>25%</b>
            <span>
              Geographic concentration
            </span>
          </div>

          <div className="reason">
            <b>15%</b>
            <span>Temporal anomaly</span>
          </div>

          <p>
            These weights are project heuristics used
            to create an explainable community-signal
            score.
          </p>
        </div>
      </div>

      <div className="card small-note">
        {reports.length} community reports have been
        submitted through the current interface.
      </div>
    </div>
  );
}

function RoadPage({ onSave, classifyReport, classifierPreview, classifierBusy, classifierError, setClassifierError }) {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [values, setValues] = useState({
    location: "",
    description: "",
    severity: "Moderate",
  });
  const matchingPreview = classifierPreview?.domain === "road" && classifierPreview?.description === values.description.trim()
    ? classifierPreview
    : null;

  async function submitRoadReport(event) {
    event.preventDefault();
    if (!values.location.trim() || !values.description.trim()) {
      setMessage("Add a location and describe the road issue before submitting.");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      const reportResult = await onSave(values, matchingPreview?.category || null);
      if (reportResult) setMessage(`Saved ${reportResult.ticket_id}. AI issue type: ${reportResult.ai_category || "classification is queued for admin review"}.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="ROAD & INFRASTRUCTURE"
        title="Road condition reporting"
        text="Capture potholes, damaged roads and unsafe road conditions as structured community reports."
      />

      <form className="card road-form tilt-card" onSubmit={submitRoadReport}>
        <div className="road-preview">
          <div className="road-visual">
            <span className="road-line" />
            <span className="road-car">●</span>
            <span className="pothole p1" />
            <span className="pothole p2" />
          </div>

          <div>
            <span className="mini-kicker">
              INFRASTRUCTURE LAYER
            </span>

            <h2>Road safety signal</h2>

            <p>
              Collect road problems and feed them into
              the same CommunitySignal reporting
              pipeline.
            </p>
          </div>
        </div>

        <label>Location</label>

        <input
          value={values.location}
          onChange={(e) =>
            setValues({
              ...values,
              location: e.target.value,
            })
          }
          placeholder="Road / locality / landmark"
        />

        <label>What is wrong?</label>

        <textarea
          value={values.description}
          onChange={(e) => {
            setValues({
              ...values,
              description: e.target.value,
            });
            setClassifierError("");
          }}
          placeholder="Pothole, broken road, waterlogging, damaged divider..."
        />

        <div className="report-classifier-controls">
          <button type="button" className="secondary-btn" disabled={classifierBusy || submitting || !values.description.trim()} onClick={() => classifyReport(values.description, "road")}>
            {classifierBusy ? "Classifying road issue…" : "Classify road issue with AI"}
          </button>
          {matchingPreview && <span className="classifier-result">AI suggests: <strong>{matchingPreview.category}</strong></span>}
        </div>
        {classifierError && <p className="form-feedback error" role="status">{classifierError}</p>}
        <p className="classifier-help">PeopleCare AI suggests a road issue type; the NYC 311 model is stored separately as an unvalidated ML reference.</p>

        <label>Severity</label>

        <select
          value={values.severity}
          onChange={(e) =>
            setValues({
              ...values,
              severity: e.target.value,
            })
          }
        >
          <option>Low</option>
          <option>Moderate</option>
          <option>High</option>
          <option>Critical</option>
        </select>

        <button className="primary-btn" type="submit" disabled={submitting}>
          {submitting ? "Saving road report…" : "Submit road report →"}
        </button>
        {message && <p className="form-feedback" role="status">{message}</p>}
      </form>
    </div>
  );
}

const SERVICE_IMAGES = {
  ambulance: "/emergency/ambulance.jpg",
  fire: "/emergency/fire_service.jpg",
  police: "/emergency/police.jpg",
  blood: "/emergency/blood_assistance.jpg",
  women: "/emergency/women_safety.jpg",
  night: "/emergency/night_help.jpg",
  road: "/emergency/road_emergency.jpg",
  accident: "/emergency/accident_assistance.jpg",
  sos: "/emergency/emergency_sos.jpg",
  support: "/emergency/helpline_support.jpg",
  disaster: "/emergency/disaster_alert.jpg",
  community: "/emergency/community_help.jpg",
};

function ServiceVisual({ type, className = "" }) {
  const image = SERVICE_IMAGES[type] || SERVICE_IMAGES.community;
  return (
    <div className={`service-image-visual ${className}`}>
      <img className="service-image-backdrop" src={image} alt="" aria-hidden="true" draggable="false" />
      <img className="service-image-main" src={image} alt="" draggable="false" />
      <div className="service-image-vignette" />
      <div className="service-image-scan" />
      <div className="service-image-glow" />
      <style>{`
        .service-image-visual{position:relative;width:100%;height:100%;min-height:150px;overflow:hidden;background:#020817;border-radius:inherit;isolation:isolate}
        .service-image-visual img{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}
        .service-image-visual .service-image-backdrop{object-fit:cover;filter:blur(16px) brightness(.38) saturate(1.08);transform:scale(1.08);opacity:.8}
        .service-image-visual .service-image-main{z-index:2;object-fit:contain;object-position:center center;filter:brightness(1.08) saturate(1.1) contrast(1.04) drop-shadow(0 8px 16px rgba(0,0,0,.38));transition:filter .35s ease}
        .emergency-service-card:hover .service-image-main,.selected-service-hero:hover .service-image-main{filter:brightness(1.13) saturate(1.14) contrast(1.05) drop-shadow(0 10px 18px rgba(0,0,0,.42))}
        .service-image-vignette{position:absolute;inset:0;background:linear-gradient(180deg,rgba(2,6,23,.015) 35%,rgba(2,6,23,.14) 100%);z-index:3;pointer-events:none}
        .service-image-scan{position:absolute;left:-20%;right:-20%;top:-15%;height:1px;background:linear-gradient(90deg,transparent,rgba(103,232,249,.62),transparent);box-shadow:0 0 12px rgba(56,189,248,.42);z-index:4;opacity:.28;animation:serviceScan 6.8s linear infinite;pointer-events:none}
        .service-image-glow{position:absolute;inset:auto 12% -24% 12%;height:42%;background:radial-gradient(ellipse,rgba(59,130,246,.22),transparent 68%);filter:blur(18px);z-index:1;animation:serviceGlow 3.2s ease-in-out infinite;pointer-events:none}
        .service-picture{overflow:hidden}
        .selected-service-hero{overflow:hidden}
        @keyframes serviceScan{0%{transform:translateY(0);opacity:0}12%{opacity:.28}50%{opacity:.36}88%{opacity:.24}100%{transform:translateY(290px);opacity:0}}
        @keyframes serviceGlow{0%,100%{transform:scale(.9);opacity:.55}50%{transform:scale(1.12);opacity:1}}
      `}</style>
    </div>
  );
}

function EmergencyServiceCard({ type, title, text, tone, onClick }) {
  return (
    <button type="button" className={`emergency-service-card ${tone}`} onClick={onClick}>
      <div className="service-picture">
        <ServiceVisual type={type} />
        <div className="service-scan" />
      </div>
      <div className="service-card-info">
        <div>
          <strong>{title}</strong>
          <span>{text}</span>
        </div>
        <div className="service-arrow">↗</div>
      </div>
      <div className="service-status">
        {type === "blood" ? "Request logging only" : "Local guidance only"}
      </div>
    </button>
  );
}


function PeopleCareAI({ stats, signals, setModal, navigate }) {
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [coreState, setCoreState] = useState("idle");
  const [voiceNote, setVoiceNote] = useState("Voice ready · tap mic to speak");
  const [agentTask, setAgentTask] = useState("No application tools used yet");
  const recognitionRef = useRef(null);
  const [messages, setMessages] = useState([
    {
      role: "ai",
      text: "Hello! I'm PeopleCare AI, your community support assistant. I can explain community trends, help you report an issue, or guide you to assistance. What can I help with today?",
      time: "now",
    },
  ]);
  const chatRef = useRef(null);
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, thinking]);

  const startVoice = () => {
    window.speechSynthesis?.cancel(); setSpeaking(false);
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setVoiceNote("Voice input isn't supported in this browser. Try Chrome."); setCoreState("error"); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); setCoreState("idle"); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN"; recognition.interimResults = false; recognition.maxAlternatives = 1;
    recognition.onstart = () => { setListening(true); setCoreState("listening"); setVoiceNote("Listening… speak your question"); };
    recognition.onresult = (event) => { const spoken = event.results?.[0]?.[0]?.transcript || ""; setInput(spoken); setVoiceNote(`Heard: ${spoken} · sending…`); if (spoken.trim()) window.setTimeout(() => send(spoken), 180); };
    recognition.onerror = (event) => { setVoiceNote(event.error === "not-allowed" ? "Microphone permission denied" : "Voice input stopped · try again"); setListening(false); setCoreState("error"); };
    recognition.onend = () => {
      setListening(false);
      setCoreState((current) => current === "listening" ? "idle" : current);
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch { setListening(false); setCoreState("error"); setVoiceNote("Microphone is busy · try again"); }
  };
  const speakLatest = () => {
    const latest = [...messages].reverse().find((m) => m.role === "ai")?.text;
    if (!latest || !window.speechSynthesis) { setVoiceNote("Voice output isn't supported in this browser."); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(latest); utterance.lang = "en-IN"; utterance.rate = 0.96;
    utterance.onstart = () => { setSpeaking(true); setCoreState("speaking"); setVoiceNote("PeopleCare AI is speaking…"); };
    utterance.onend = () => { setSpeaking(false); setCoreState("success"); setVoiceNote("Voice ready · tap mic to speak"); };
    utterance.onerror = (event) => { setSpeaking(false); setCoreState(event.error === "canceled" ? "idle" : "error"); setVoiceNote("Voice ready · tap mic to speak"); };
    window.speechSynthesis.speak(utterance);
  };
  useEffect(() => () => { recognitionRef.current?.stop(); window.speechSynthesis?.cancel(); }, []);
  const formatNumber = (value) => Number(value || 0).toLocaleString("en-IN");
  const currentSignals = signals.slice(0, 8);
  const jarvisState = listening ? "listening" : thinking ? "thinking" : speaking ? "speaking" : messages.at(-1)?.error ? "error" : coreState;
  const jarvisStateLabel = jarvisState === "idle" ? "READY" : jarvisState === "success" ? "RESPONSE READY" : jarvisState.toUpperCase();
  const quickPrompts = [
    { icon: "⌁", label: "Community trends", prompt: "Summarize the latest community signals." },
    { icon: "✚", label: "Emergency support", action: () => setModal("emergency") },
    { icon: "♥", label: "Blood assistance", action: () => setModal("blood") },
    { icon: "◈", label: "Women safety", action: () => setModal("women") },
    { icon: "☾", label: "Night travel help", action: () => setModal("night") },
    { icon: "＋", label: "Report an issue", action: () => navigate("report") },
  ];

  const clearChat = () => { setMessages([{ role: "ai", text: "New conversation started. How can I support your community today?", time: "now" }]); setCoreState("idle"); };

  const send = async (text = input) => {
    const clean = text.trim();
    if (!clean || thinking) return;
    const userMessage = { role: "user", text: clean, time: "now" };
    const history = messages.filter((m) => m.role === "user" || m.role === "ai").slice(-12).map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text }));
    setMessages((m) => [...m, userMessage]);
    setInput("");
    setThinking(true);
    setCoreState("thinking");
    try {
      const response = await fetch(apiUrl("/api/peoplecare/chat"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean, history, context: { stats, signals: currentSignals } }),
      });
      const raw = await response.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: raw || "Empty server response" }; }
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      const toolRuns = Array.isArray(data.tools_used) ? data.tools_used : [];
      if (toolRuns.length) {
        const ran = toolRuns.filter((item) => item.success).map((item) => item.name);
        const failed = toolRuns.filter((item) => !item.success).map((item) => `${item.name} unavailable`);
        setAgentTask(`Tools used: ${[...ran, ...failed].join(", ")}`);
      } else if (data.source === "provider_error" || data.source === "offline_support") {
        setAgentTask("AI provider unavailable; no application tools ran for this request.");
      } else {
        setAgentTask(`Answered by ${data.model || data.source || "configured provider"}; no data tools were needed.`);
      }
      const providerUnavailable = data.source === "provider_error" || data.source === "offline_support";
      setMessages((m) => [...m, { role: "ai", text: data.reply || "I couldn't generate a response. Please try again.", time: "now", error: providerUnavailable }]);
      setCoreState(providerUnavailable ? "error" : "success");
    } catch (error) {
      console.error("PeopleCare AI error:", error);
      setAgentTask("Request failed. Check the backend and selected provider, then retry.");
      setMessages((m) => [...m, { role: "ai", text: `PeopleCare AI error: ${error.message || "Unknown error"}. Check that the backend and AI provider are running.`, time: "now", error: true }]);
      setCoreState("error");
    } finally { setThinking(false); }
  };

  return (
    <aside className={`peoplecare-panel pc-pro ${expanded ? "peoplecare-expanded" : ""}`}>
      <style>{`
        .pc-pro{--pc-bg:#07111f;--pc-panel:#0b1728;--pc-line:rgba(148,163,184,.16);--pc-text:#edf5ff;--pc-muted:#8193ad;position:relative;isolation:isolate;overflow:hidden;border:1px solid rgba(100,116,139,.24)!important;border-radius:22px!important;background:radial-gradient(ellipse at 85% 0%,rgba(38,99,235,.16),transparent 38%),linear-gradient(155deg,#0b1728,#060d18 72%)!important;box-shadow:0 22px 65px rgba(0,0,0,.3),inset 0 1px rgba(255,255,255,.035)!important;color:var(--pc-text);padding:0!important;min-width:0}
        .pc-pro:before{content:"";position:absolute;inset:0;background:linear-gradient(rgba(148,163,184,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.025) 1px,transparent 1px);background-size:24px 24px;mask-image:linear-gradient(to bottom,black,transparent 65%);pointer-events:none;z-index:-1}
        .pc-pro .pc-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:19px 20px;border-bottom:1px solid var(--pc-line);background:rgba(5,12,22,.52)}
        .pc-pro .pc-brand{display:flex;align-items:center;gap:12px;min-width:0}.pc-pro .pc-logo{width:42px;height:42px;flex:0 0 42px;border-radius:14px;display:grid;place-items:center;color:#dffaff;font-size:20px;background:linear-gradient(145deg,#164e8a,#4338a8);border:1px solid rgba(125,211,252,.32);box-shadow:0 0 24px rgba(59,130,246,.18)}
        .pc-pro .pc-brand-copy{min-width:0}.pc-pro .pc-overline{font-size:8px;font-weight:900;letter-spacing:1.65px;color:#7dd3fc;text-transform:uppercase}.pc-pro .pc-brand h3{margin:3px 0 2px!important;font-size:17px!important;letter-spacing:-.45px;color:#f1f7ff}.pc-pro .pc-brand p{margin:0!important;font-size:10px;color:#8193ad}
        .pc-pro .pc-header-actions{display:flex;align-items:center;gap:7px}.pc-pro .pc-tool{width:31px;height:31px;border:1px solid var(--pc-line);border-radius:9px;background:#0c192a;color:#a8b8ce;cursor:pointer;font-size:14px;transition:.2s}.pc-pro .pc-tool:hover{border-color:#4b91e8;color:#fff;background:#12243a}.pc-pro .pc-status{display:flex;align-items:center;gap:6px;padding:6px 9px;border:1px solid rgba(52,211,153,.2);border-radius:99px;background:rgba(16,185,129,.07);color:#86efac;font-size:8px;font-weight:900;letter-spacing:.65px}.pc-pro .pc-status i{width:6px;height:6px;border-radius:50%;background:#34d399;box-shadow:0 0 9px #34d399}.pc-pro .pc-voice-orb{width:9px;height:9px;border-radius:50%;background:#38bdf8;box-shadow:0 0 0 0 rgba(56,189,248,.45);display:inline-block}.pc-pro .pc-voice-orb.active{animation:pcVoicePulse 1.05s infinite}.pc-pro .pc-voice-note{font-size:8px;color:#7f9fca;margin-top:8px;display:flex;align-items:center;gap:7px}.pc-pro .pc-mic{width:38px;height:38px;flex:0 0 38px;border:1px solid rgba(96,165,250,.25);border-radius:10px;background:#101e31;color:#9dd8ff;cursor:pointer}.pc-pro .pc-mic.active{background:linear-gradient(135deg,#991b1b,#be123c);color:#fff;border-color:#fb7185;animation:pcVoicePulse 1s infinite}.pc-pro .pc-mic.active:after{content:" •••";font-size:9px;letter-spacing:1px;animation:pcWave .55s infinite alternate}@keyframes pcWave{from{opacity:.35;letter-spacing:1px}to{opacity:1;letter-spacing:3px}}.pc-pro .pc-listening{color:#fca5a5!important}@keyframes pcVoicePulse{0%{box-shadow:0 0 0 0 rgba(56,189,248,.4);transform:scale(1)}70%{box-shadow:0 0 0 10px rgba(56,189,248,0);transform:scale(1.08)}100%{box-shadow:0 0 0 0 rgba(56,189,248,0);transform:scale(1)} }
        .pc-pro .pc-welcome{position:relative;margin:16px 16px 12px;padding:17px;border-radius:16px;border:1px solid rgba(96,165,250,.18);background:linear-gradient(115deg,rgba(30,64,120,.28),rgba(15,23,42,.55));overflow:hidden}.pc-pro .pc-welcome:after{content:"✦";position:absolute;right:16px;top:12px;font-size:48px;color:rgba(125,211,252,.09)}.pc-pro .pc-welcome-tag{display:flex;align-items:center;gap:7px;font-size:8px;letter-spacing:1.2px;font-weight:900;color:#93c5fd}.pc-pro .pc-welcome-tag i{width:5px;height:5px;background:#60a5fa;border-radius:50%;box-shadow:0 0 8px #60a5fa}.pc-pro .pc-welcome h4{margin:9px 0 6px!important;font-size:18px!important;color:#f3f8ff;letter-spacing:-.5px}.pc-pro .pc-welcome p{margin:0!important;max-width:470px;font-size:10px;line-height:1.65;color:#9eafc7}
        .pc-pro .pc-context{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 16px 13px}.pc-pro .pc-context-item{padding:10px 11px;border:1px solid var(--pc-line);border-radius:12px;background:rgba(8,17,30,.75);min-width:0}.pc-pro .pc-context-item span{display:block;font-size:8px;color:#71839e;margin-bottom:5px}.pc-pro .pc-context-item strong{font-size:13px;color:#dcecff;letter-spacing:-.2px}
        .pc-pro .pc-chat{height:285px;min-height:220px;overflow:auto;padding:15px 17px;display:flex;flex-direction:column;gap:12px;scrollbar-width:thin;scrollbar-color:#263b58 transparent}.pc-pro.peoplecare-expanded .pc-chat{height:440px}.pc-pro .pc-message{max-width:88%;display:flex;flex-direction:column;gap:5px;animation:pcRise .22s ease-out}.pc-pro .pc-message.ai{align-self:flex-start}.pc-pro .pc-message.user{align-self:flex-end;align-items:flex-end}.pc-pro .pc-msg-label{font-size:8px;letter-spacing:.9px;font-weight:900;color:#7296c4}.pc-pro .pc-bubble{padding:11px 13px;border-radius:13px;border:1px solid rgba(148,163,184,.14);background:linear-gradient(145deg,#101e31,#0b1727);font-size:10px;line-height:1.7;color:#c8d6e9;white-space:pre-wrap;overflow-wrap:anywhere}.pc-pro .pc-message.user .pc-bubble{background:linear-gradient(135deg,#1d4ed8,#3730a3);border-color:rgba(129,140,248,.3);color:#f4f7ff;border-bottom-right-radius:4px}.pc-pro .pc-message.ai .pc-bubble{border-bottom-left-radius:4px}.pc-pro .pc-message.ai.error .pc-bubble{border-color:rgba(248,113,113,.2);color:#fecaca}.pc-pro .pc-typing{display:flex;gap:4px;align-items:center;padding:13px}.pc-pro .pc-typing i{width:5px;height:5px;border-radius:50%;background:#60a5fa;animation:pcTyping 1s infinite}.pc-pro .pc-typing i:nth-child(2){animation-delay:.15s}.pc-pro .pc-typing i:nth-child(3){animation-delay:.3s}
        .pc-pro .pc-shortcuts{padding:0 16px 14px;display:flex;gap:7px;flex-wrap:wrap}.pc-pro .pc-shortcut{display:flex;align-items:center;gap:6px;border:1px solid rgba(100,116,139,.2);background:rgba(10,20,35,.85);color:#aebed3;padding:8px 10px;border-radius:9px;font-size:9px;font-weight:700;cursor:pointer;transition:.18s}.pc-pro .pc-shortcut span{color:#7dd3fc;font-size:12px}.pc-pro .pc-shortcut:hover{border-color:rgba(96,165,250,.5);color:#eaf4ff;background:#10223a;transform:translateY(-1px)}
        .pc-pro .pc-composer-wrap{margin:0 16px 13px;padding:7px;border:1px solid rgba(96,165,250,.2);border-radius:14px;background:rgba(4,11,20,.9);box-shadow:0 0 0 3px rgba(59,130,246,.025)}.pc-pro .pc-composer{display:flex;align-items:flex-end;gap:8px}.pc-pro .pc-composer textarea{flex:1;min-height:38px;max-height:100px;resize:vertical;border:0!important;outline:none!important;background:transparent!important;color:#eaf3ff!important;padding:10px 9px!important;font-size:10px!important;line-height:1.5}.pc-pro .pc-composer textarea::placeholder{color:#52647d}.pc-pro .pc-send{width:38px;height:38px;flex:0 0 38px;border:0;border-radius:10px;background:linear-gradient(135deg,#2563eb,#4f46e5);color:white;font-size:16px;box-shadow:0 6px 18px rgba(37,99,235,.24);cursor:pointer;transition:.2s}.pc-pro .pc-send:hover{transform:translateY(-1px);filter:brightness(1.12)}.pc-pro .pc-send:disabled{opacity:.45;cursor:not-allowed;transform:none}.pc-pro .pc-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 18px 15px;color:#53657e;font-size:8px}.pc-pro .pc-footer span{display:flex;align-items:center;gap:5px}.pc-pro .pc-footer b{font-weight:700;color:#7186a3}.pc-pro .pc-footer .pc-safe{color:#6f829c}
        @keyframes pcRise{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}@keyframes pcTyping{0%,60%,100%{transform:translateY(0);opacity:.45}30%{transform:translateY(-4px);opacity:1}}
        @media(max-width:600px){.pc-pro .pc-header{padding:14px}.pc-pro .pc-brand h3{font-size:15px!important}.pc-pro .pc-status{display:none}.pc-pro .pc-welcome{margin:12px;padding:14px}.pc-pro .pc-context{margin:0 12px 11px;gap:6px}.pc-pro .pc-context-item{padding:9px}.pc-pro .pc-context-item strong{font-size:11px}.pc-pro .pc-chat{height:260px;padding:12px}.pc-pro .pc-shortcuts{padding:0 12px 12px}.pc-pro .pc-composer-wrap{margin:0 12px 12px}.pc-pro .pc-footer{padding:0 13px 13px}}

        /* Shared PeopleCare assistant avatar and compact workspace layout. */
        .pc-pro{border-color:rgba(73,195,240,.26)!important;background:radial-gradient(ellipse at 52% 18%,rgba(24,126,202,.16),transparent 43%),linear-gradient(155deg,#071321,#060c17 72%)!important;box-shadow:0 0 28px rgba(33,166,231,.07),0 22px 65px rgba(0,0,0,.32),inset 0 1px rgba(255,255,255,.035)!important}
        .pc-pro:before{background:radial-gradient(circle at 50% 24%,rgba(42,161,236,.09),transparent 36%),linear-gradient(rgba(100,190,245,.024) 1px,transparent 1px),linear-gradient(90deg,rgba(100,190,245,.024) 1px,transparent 1px)!important}
        .pc-pro .pc-header{border-bottom-color:rgba(67,177,231,.2);background:rgba(5,12,22,.65)}
        .pc-pro .pc-logo-core{width:42px;filter:drop-shadow(0 0 10px rgba(49,206,255,.28))}
        .pc-pro .pc-overline,.pc-pro .pc-status{color:#71eaff}
        .pc-pro .pc-status{border-color:rgba(56,189,248,.22);background:rgba(21,122,174,.09)}
        .pc-pro .pc-status i{background:#54dfff;box-shadow:0 0 9px #26c9ff}
        .pc-pro .pc-status.thinking,.pc-pro .pc-status.listening,.pc-pro .pc-status.speaking{color:#9cefff}
        .pc-pro .pc-status.error{color:#ffcb9c;border-color:rgba(255,170,103,.32);background:rgba(125,63,24,.14)}
        .pc-pro .pc-mic.active{background:linear-gradient(135deg,#075985,#0e7490);color:#e5fbff;border-color:#38bdf8}
        .pc-pro .pc-listening{color:#9cefff!important}
        .pc-pro .pc-composer-wrap{border-color:rgba(53,178,225,.28);box-shadow:0 0 18px rgba(30,161,210,.07)}
        .pc-pro .pc-send{background:linear-gradient(135deg,#087fa9,#3755bb);box-shadow:0 6px 18px rgba(20,129,197,.25)}
        .pc-pro .pc-shortcut{border-color:rgba(71,174,220,.18);background:rgba(7,19,34,.85)}
        .pc-pro .pc-shortcut span{color:#73def5}
        .pc-pro .pc-shortcut:hover{border-color:rgba(67,204,239,.5);background:#0c243a}
        .community-ai-workbench{display:grid;grid-template-columns:minmax(136px,.82fr) minmax(300px,1.35fr) minmax(160px,.86fr);gap:clamp(10px,1.2vw,16px);align-items:center;padding:10px clamp(12px,1.3vw,20px) 12px}
        .community-ai-core-stage{min-width:0;min-height:344px;margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;border:1px solid rgba(77,191,238,.16);border-radius:18px;overflow:visible;background:radial-gradient(ellipse at center,rgba(21,142,204,.18),rgba(8,16,30,.16) 58%,transparent 78%)}
        .community-ai-core-stage .dashboard-jarvis-core{width:min(288px,100%);filter:drop-shadow(0 0 24px rgba(52,180,248,.2))}
        .community-ai-state{margin:-5px 0 8px;color:#b8f6ff;font-size:9px;letter-spacing:2px;font-weight:900;text-align:center}
        .community-ai-brand{margin-bottom:-8px;color:#9deeff;font-size:8px;font-weight:900;letter-spacing:2px;text-align:center}
        .community-ai-actions{gap:7px}
        .community-ai-actions button{padding:9px 10px;border-color:rgba(71,174,220,.19);background:linear-gradient(135deg,rgba(12,32,52,.94),rgba(7,16,29,.95));color:#d9effc;font-size:10px}
        .community-ai-actions button:hover{border-color:#39c7e8;box-shadow:0 0 16px rgba(30,170,216,.12)}
        .community-ai-actions button span{color:#70dcf2}
        .community-ai-actions .sos-chip{background:#a6384c;color:white}
        .agent-mini{padding:10px;border-color:rgba(71,174,220,.18);background:rgba(7,18,31,.8)}
        .agent-mini b{color:#78def3}
        .agent-mini small{color:#9cb3c7}
        @media(max-width:850px){.community-ai-workbench{grid-template-columns:1fr}.community-ai-actions{display:grid;grid-template-columns:1fr 1fr}.community-ai-core-stage{min-height:322px}.community-ai-core-stage .dashboard-jarvis-core{width:min(274px,88vw)}.community-ai-actions.right{display:grid;grid-template-columns:1fr 1fr}}
        @media(max-width:480px){.community-ai-core-stage{min-height:286px}.community-ai-core-stage .dashboard-jarvis-core{width:min(248px,82vw)}.community-ai-actions,.community-ai-actions.right{grid-template-columns:1fr 1fr}.pc-pro .pc-header{gap:8px;padding:13px}.pc-pro .pc-header-actions{gap:4px}}
        @media(prefers-reduced-motion:reduce){.community-ai-core-stage{scroll-behavior:auto}}
      `}</style>
      <div className="pc-header">
        <div className="pc-brand"><JarvisCore state={jarvisState} size={42} compact className="pc-logo-core" /><div className="pc-brand-copy"><span className="pc-overline">COMMUNITY SUPPORT • AI</span><h3>PeopleCare AI</h3><p>Holographic AI assistant</p></div></div>
        <div className="pc-header-actions"><button className="pc-tool" onClick={speakLatest} title="Speak latest AI reply">♫</button><button className="pc-tool" onClick={clearChat} title="New chat">↻</button><button className="pc-tool" onClick={() => setExpanded((v) => !v)} title={expanded ? "Compact" : "Expand"}>{expanded ? "↙" : "↗"}</button><span className={`pc-status ${jarvisState}`}><i/> {jarvisStateLabel}</span></div>
      </div>
      <div className="community-ai-workbench"><div className="community-ai-actions"><button onClick={() => send("Summarize the latest community trends and emerging signals.")}><span>▤</span> Analyze data</button><button onClick={() => send("Which observed community issues should receive review priority? Analyze the local reports and explain the evidence.")}><span>⌁</span> Prioritize reports</button><button onClick={() => setModal("emergency")}><span className="sos-chip">SOS</span> Emergency help</button><button onClick={() => navigate("report")}><span>＋</span> Report issue</button></div><div className="community-ai-core-stage">
  <div className="community-ai-brand">PEOPLECARE AI</div>
  <JarvisCore state={jarvisState} size={288} className="dashboard-jarvis-core" label="PeopleCare AI holographic core" />
  <div className="community-ai-state">{jarvisStateLabel}</div>
</div><div className="community-ai-actions right"><button onClick={() => {setAgentTask("Request in progress; tool results will be shown when returned.");send("Analyze major community problems and tell me which issue should be prioritized from the actual local reports.");}}><span>▱</span> Analyze community data</button><button onClick={() => send("Help me build or debug a React component in this project.")}><span>‹/›</span> Build / code (React)</button><button onClick={() => window.open("http://localhost:5173", "_blank", "noopener,noreferrer")}><span>▣</span> Open dashboard tab</button><div className="agent-mini"><b>PEOPLECARE · TOOL ROUTER</b><small>{thinking ? "Request in progress…" : agentTask}</small></div></div></div><div className="pc-welcome"><div className="pc-welcome-tag"><i/> YOUR COMMUNITY, WITH A LITTLE MORE CARE</div><h4>How can I help you today?</h4><p>Ask about community patterns, find the right assistance, or get guidance on reporting an issue. I'm here to make the next step clearer.</p><div className={`pc-voice-note ${listening ? 'pc-listening' : ''}`}><i className={`pc-voice-orb ${listening || speaking ? 'active' : ''}`}/>{voiceNote}</div></div>
      <div className="pc-context"><div className="pc-context-item"><span>Community reports</span><strong>{formatNumber(stats.total_reports)}</strong></div><div className="pc-context-item"><span>Emerging signals</span><strong>{formatNumber(stats.emerging_issues)}</strong></div><div className="pc-context-item"><span>Hotspot clusters</span><strong>{formatNumber(stats.hotspot_clusters)}</strong></div></div>
      <div className="pc-chat" ref={chatRef} aria-live="polite">{messages.map((m, i) => <div key={`${m.role}-${i}`} className={`pc-message ${m.role} ${m.error ? "error" : ""}`}><span className="pc-msg-label">{m.role === "ai" ? "PEOPLECARE AI" : "YOU"}</span><div className="pc-bubble">{m.text}</div></div>)}{thinking && <div className="pc-message ai"><span className="pc-msg-label">PEOPLECARE AI · THINKING</span><div className="pc-bubble pc-typing"><JarvisCore state="thinking" size={38} compact label="PeopleCare AI is processing" /></div></div>}</div>
      <div className="pc-shortcuts">{quickPrompts.map((item) => <button key={item.label} className="pc-shortcut" onClick={item.action || (() => send(item.prompt))}><span>{item.icon}</span>{item.label}</button>)}</div>
      <div className="pc-composer-wrap"><div className="pc-composer"><textarea value={input} rows={1} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Ask Community AI anything…" aria-label="Message PeopleCare AI"/><button className={`pc-mic ${listening ? "active" : ""}`} onClick={startVoice} title={listening ? "Stop listening" : "Speak your question"} aria-label="Voice input">{listening ? "■" : "🎙"}</button><button className="pc-send" onClick={() => send()} disabled={thinking || !input.trim()} aria-label="Send message">➤</button></div></div>
      <div className="pc-footer"><span><b>●</b> Connected to dashboard context</span><span className="pc-safe">AI guidance · Not emergency dispatch</span></div>
    </aside>
  );
}

function AssistanceModal({ type, close, onSave, openModal, recordActivity }) {
  const [values, setValues] = useState({
    location: "",
    name: "",
    phone: "",
    details: "",
    blood_group: "",
    destination: "",
  });
  const [selectedService, setSelectedService] = useState(null);

  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));

  if (type === "emergency") {
    const services = {
      ambulance: { title: "Ambulance", text: "Medical emergency assistance", tone: "ambulance" },
      fire: { title: "Fire Service", text: "Fire and rescue emergency", tone: "fire" },
      police: { title: "Police", text: "Safety and crime emergency", tone: "police" },
      blood: { title: "Blood Assistance", text: "Urgent blood requirement support", tone: "blood" },
    };

    if (selectedService) {
      const service = services[selectedService];
      return (
        <div className="modal-backdrop emergency-backdrop" onMouseDown={close}>
          <div className="modal emergency-modal-large" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={close}>×</button>
            <button type="button" className="back-service" onClick={() => setSelectedService(null)}>
              ← Back to emergency services
            </button>
            <div className={`selected-service-hero ${service.tone}`}>
              <ServiceVisual type={selectedService} />
            </div>
            <span className="mini-kicker">EMERGENCY SERVICE</span>
            <h2>{service.title}</h2>
            <p>{service.text}</p>
            <div className="emergency-action-box">
              <div>
                <span>Service selected</span>
                <strong>{service.title}</strong>
              </div>
              <a href={selectedService === "fire" ? "tel:101" : "tel:112"} className="emergency-call-big" onClick={() => recordActivity?.("emergency_call_tapped")}>
                <span>☎</span> Call {selectedService === "fire" ? "Fire Service · 101" : "Emergency · 112"}
              </a>
            </div>
            {selectedService === "blood" && (
              <div className="assistance-urgent-actions">
                <a href="https://eraktkosh.mohfw.gov.in/BLDAHIMS/bloodbank/stockAvailability.cnt" target="_blank" rel="noopener noreferrer" onClick={() => recordActivity?.("blood_resource_opened")}>
                  Check official blood availability · e-RaktKosh
                </a>
                <span>PeopleCare does not match donors or confirm stock. Verify availability with the blood bank.</span>
              </div>
            )}
            {selectedService === "fire" && <a href="tel:101" className="urgent-secondary-call" onClick={() => recordActivity?.("emergency_call_tapped")}>Call Fire Service · 101</a>}
            <div className="modal-note">
              CommunitySignal AI does not dispatch emergency responders. For immediate danger, contact the appropriate verified emergency service directly.
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="modal-backdrop emergency-backdrop" onMouseDown={close}>
        <div className="modal emergency-modal-large" onMouseDown={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={close}>×</button>
          <div className="emergency-modal-header">
            <div className="emergency-pulse-icon">✚</div>
            <div>
              <span className="mini-kicker">URGENT ASSISTANCE</span>
              <h2>Emergency Help</h2>
              <p>Select the type of emergency assistance you need.</p>
            </div>
          </div>
          <div className="emergency-warning">
            <strong>For immediate danger</strong>
            <span>Contact the appropriate official emergency service directly. This prototype does not dispatch responders automatically.</span>
          </div>
          <div className="emergency-direct-resources" aria-label="Direct emergency resources">
            <a href="tel:112" onClick={() => recordActivity?.("emergency_call_tapped")}><b>112</b><span>Immediate emergency</span></a>
            <a href="tel:101" onClick={() => recordActivity?.("emergency_call_tapped")}><b>101</b><span>Fire & rescue</span></a>
            <a href="tel:1091" onClick={() => recordActivity?.("emergency_call_tapped")}><b>1091</b><span>Women safety</span></a>
            <a href="https://eraktkosh.mohfw.gov.in/BLDAHIMS/bloodbank/stockAvailability.cnt" target="_blank" rel="noopener noreferrer" onClick={() => recordActivity?.("blood_resource_opened")}><b>Blood</b><span>e-RaktKosh stock search</span></a>
          </div>
          <a href="tel:112" className="emergency-call-big emergency-call-now" onClick={() => recordActivity?.("emergency_call_tapped")}>
            Call 112 now for immediate help
          </a>
          <div className="emergency-services-grid">
            <EmergencyServiceCard type="ambulance" title="Ambulance" text="Medical emergency" tone="ambulance" onClick={() => setSelectedService("ambulance")} />
            <EmergencyServiceCard type="fire" title="Fire Service" text="Fire & rescue" tone="fire" onClick={() => setSelectedService("fire")} />
            <EmergencyServiceCard type="police" title="Police" text="Safety / crime" tone="police" onClick={() => setSelectedService("police")} />
            <EmergencyServiceCard type="blood" title="Blood Assistance" text="Urgent blood need" tone="blood" onClick={() => setSelectedService("blood")} />
          </div>
          <div className="emergency-extra-visuals">
            <button type="button" onClick={() => openModal("women")}><ServiceVisual type="women" /><span>Women Safety</span></button>
            <button type="button" onClick={() => openModal("night")}><ServiceVisual type="night" /><span>Night Help</span></button>
            <button type="button" onClick={() => openModal("road")}><ServiceVisual type="road" /><span>Road Emergency</span></button>
            <button type="button" onClick={() => openModal("blood")}><ServiceVisual type="blood" /><span>Blood Assistance</span></button>
          </div>
          <style>{`
            .emergency-extra-visuals{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0 16px}
            .emergency-extra-visuals button{position:relative;min-height:135px;padding:0;border:1px solid rgba(100,116,139,.2);border-radius:15px;overflow:hidden;background:#07111f;color:#fff;cursor:pointer;text-align:left;box-shadow:0 14px 34px rgba(0,0,0,.2)}
            .emergency-extra-visuals button .service-image-visual{min-height:135px}
            .emergency-extra-visuals button>span{position:absolute;left:12px;right:12px;bottom:10px;z-index:6;font-size:11px;font-weight:900;text-shadow:0 2px 10px #000}
            .emergency-extra-visuals button:hover{transform:translateY(-3px);border-color:rgba(129,140,248,.45)}
            @media(max-width:900px){.emergency-extra-visuals{grid-template-columns:repeat(2,minmax(0,1fr))}}
            @media(max-width:560px){.emergency-extra-visuals{grid-template-columns:1fr 1fr;gap:8px}.emergency-extra-visuals button{min-height:115px}.emergency-extra-visuals button .service-image-visual{min-height:115px}}
          `}</style>
          <button
            type="button"
            className="urgent-road-button"
            onClick={() => openModal("road")}
          >
            ⚠ Report an urgent road hazard
          </button>
        </div>
      </div>
    );
  }

  const titles = {
    blood: ["Blood assistance", "Create a blood requirement request.", "Blood group"],
    night: ["Night help", "Record a night-travel assistance request.", "Destination"],
    women: ["Women safety", "Create a safety support request.", "Trusted contact / location"],
    road: ["Road hazard assistance", "Record a road hazard. For immediate danger or injury, call 112.", "Road / landmark"],
  };
  const [title, text, third] = titles[type];

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={close}>×</button>
        <div className={`modal-icon ${type}`}>
          {type === "blood" ? "♥" : type === "night" ? "☾" : "◌"}
        </div>
        <div className={`assistance-visual ${type}`}>
          <ServiceVisual type={type} className="assistance-service-visual" />
          <div className="assistance-visual-label">
            <span>{type === "women" ? "SAFETY MODE" : type === "night" ? "NIGHT SUPPORT" : type === "road" ? "ROAD HAZARD" : "BLOOD SUPPORT"}</span>
            <strong>{type === "women" ? "Women Safety" : type === "night" ? "Night Help" : type === "road" ? "Road Assistance" : "Blood Assistance"}</strong>
          </div>
        </div>
        <span className="mini-kicker">ASSISTANCE REQUEST</span>
        <h2>{title}</h2>
        <p>{text}</p>
        <div className="assistance-urgent-actions">
          <a href="tel:112" onClick={() => recordActivity?.("emergency_call_tapped")}>Call 112 for immediate danger</a>
          {type === "women" && <a href="tel:1091" onClick={() => recordActivity?.("emergency_call_tapped")}>Women’s helpline · 1091</a>}
          {type === "blood" && (
            <a href="https://eraktkosh.mohfw.gov.in/BLDAHIMS/bloodbank/stockAvailability.cnt" target="_blank" rel="noopener noreferrer" onClick={() => recordActivity?.("blood_resource_opened")}>
              Check official blood availability · e-RaktKosh
            </a>
          )}
        </div>
        <style>{`
          .assistance-visual{position:relative;height:190px;margin:0 0 18px;border:1px solid rgba(100,116,139,.22);border-radius:18px;overflow:hidden;background:#020817;box-shadow:0 18px 45px rgba(0,0,0,.28)}
          .assistance-service-visual{height:100%;min-height:0}
          .assistance-visual:after{content:"";position:absolute;inset:0;border:1px solid rgba(255,255,255,.06);border-radius:18px;pointer-events:none}
          .assistance-visual-label{position:absolute;left:16px;bottom:14px;z-index:5;display:grid;gap:4px;text-align:left}
          .assistance-visual-label span{font-size:8px;font-weight:900;letter-spacing:1.5px;color:#a5f3fc;text-shadow:0 1px 8px #020617}
          .assistance-visual-label strong{font-size:18px;color:#fff;text-shadow:0 2px 14px rgba(0,0,0,.75)}
          .assistance-visual.blood .service-image-glow{background:radial-gradient(ellipse,rgba(244,63,94,.36),transparent 68%)}
          .assistance-visual.night .service-image-glow{background:radial-gradient(ellipse,rgba(99,102,241,.36),transparent 68%)}
          .assistance-visual.women .service-image-glow{background:radial-gradient(ellipse,rgba(236,72,153,.36),transparent 68%)}
          .assistance-visual.blood .service-image-scan{background:linear-gradient(90deg,transparent,rgba(251,113,133,.9),transparent);box-shadow:0 0 20px rgba(244,63,94,.75)}
          .assistance-visual.women .service-image-scan{background:linear-gradient(90deg,transparent,rgba(244,114,182,.9),transparent);box-shadow:0 0 20px rgba(236,72,153,.75)}
          .assistance-visual.night .service-image-scan{background:linear-gradient(90deg,transparent,rgba(129,140,248,.9),transparent);box-shadow:0 0 20px rgba(99,102,241,.75)}
          @media(max-width:600px){.assistance-visual{height:155px}.assistance-visual-label strong{font-size:16px}}
        `}</style>
        <div className="modal-form">
          <label>Name
            <input value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="Your name" />
          </label>
          <label>Phone
            <input value={values.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Contact number" />
          </label>
          <label>Location
            <input value={values.location} onChange={(e) => set("location", e.target.value)} placeholder="Area / landmark" />
          </label>
          <label>{third}
            <input
              value={type === "blood" ? values.blood_group : values.destination}
              onChange={(e) => set(type === "blood" ? "blood_group" : "destination", e.target.value)}
              placeholder="Enter details"
            />
          </label>
          <label>Details
            <textarea value={values.details} onChange={(e) => set("details", e.target.value)} placeholder="Additional information…" />
          </label>
          <button type="button" className="primary-btn" onClick={() => onSave(type, values)}>
            Save request →
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
