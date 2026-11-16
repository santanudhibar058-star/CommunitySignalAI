import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const NAV = [
  { id: "dashboard", icon: "⌂", label: "Dashboard" },
  { id: "report", icon: "＋", label: "Report Problem" },
  { id: "signals", icon: "◉", label: "Community Signals" },
  { id: "analytics", icon: "▥", label: "Analytics" },
  { id: "reports", icon: "▤", label: "Manage Reports" },
  { id: "road", icon: "⌁", label: "Road & Infrastructure" },
];

const HELP = [
  { id: "emergency", icon: "✚", title: "Emergency Help", text: "Police, fire, ambulance & urgent help", tone: "red" },
  { id: "blood", icon: "♥", title: "Blood Assistance", text: "Create a blood requirement request", tone: "rose" },
  { id: "night", icon: "☾", title: "Night Help", text: "Safer night travel & destination help", tone: "blue" },
  { id: "women", icon: "◌", title: "Women Safety", text: "Safety support and trusted contacts", tone: "purple" },
];

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

const FALLBACK_STATS = {
  total_reports: 30002,
  resolved_reports: 29021,
  high_priority: 1,
  emerging_issues: 8,
  ai_accuracy: 83.98,
  anomalies: 1300,
  hotspot_clusters: 335,
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
  const [active, setActive] = useState("dashboard");
  const [stats, setStats] = useState(FALLBACK_STATS);
  const [signals, setSignals] = useState([]);
  const [reports, setReports] = useState([]);

  const [report, setReport] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("AI will classify");

  const [prediction, setPrediction] = useState(null);
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

  useEffect(() => {
    loadDashboard();

    const timer = window.setInterval(loadDashboard, 10000);

    return () => window.clearInterval(timer);
  }, []);

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

  async function jsonFetch(url, options) {
    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }

  async function loadDashboard() {
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
}

  function navigate(section) {
    setActive(section);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function submitReport(event) {
  event.preventDefault();

  if (!report.trim()) {
    alert("Please describe the community problem first.");
    return;
  }

  setLoading(true);
  setPrediction(null);

  try {
    // 1. Send report to the ML prediction API
    const predictionData = await jsonFetch("/predict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        report: report,
        category: category,
        location: location,
      }),
    });

    const predicted =
      predictionData.prediction ||
      predictionData.predicted_problem ||
      predictionData.category ||
      predictionData.complaint_type ||
      category;

    const rawConfidence = predictionData.confidence;
    const normalizedConfidence =
      rawConfidence == null
        ? null
        : Number(rawConfidence) > 1
          ? Number(rawConfidence) / 100
          : Number(rawConfidence);

    setPrediction({
      category: predicted,
      confidence: Number.isFinite(normalizedConfidence)
        ? normalizedConfidence
        : null,
    });

    // 2. Save the classified report
    await jsonFetch("/api/reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        category: predicted,
        description: report,
        location: location,
      }),
    });

    // 3. Refresh dashboard data
    await loadDashboard();

  } catch (error) {
    console.error("Report submission error:", error);

    setPrediction({
      category: "Unable to analyze report",
      confidence: null,
    });
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
      await loadDashboard();
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
      await loadDashboard();
    } catch (error) {
      console.error("Delete report error:", error);
      alert("Unable to delete this report. Check that Flask is running.");
    } finally {
      setReportActionLoading(false);
    }
  }

  async function saveAssistanceRequest(type, values = {}) {
    const labels = {
      blood: "Blood Assistance",
      night: "Night Help",
      women: "Women Safety",
      road: "Road Damage",
    };

    try {
      await jsonFetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category: labels[type] || type,
          description: `${labels[type] || type}: ${JSON.stringify(values)}`,
          location:
            values.location ||
            location ||
            "Not specified",
        }),
      });

      await loadDashboard();

      setModal(null);

      alert("Request recorded successfully.");
    } catch {
      alert(
        "Backend is not connected. Start Flask and try again."
      );
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
      <div className="ambient-background">
        <span className="ambient-orb orb-a" />
        <span className="ambient-orb orb-b" />
        <span className="ambient-orb orb-c" />
        <div className="ambient-grid" />
      </div>

      <aside className="sidebar">
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
              onClick={() => setModal(item.id)}
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

      <main className="main-shell">
        <header className="topbar">
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
          className="page-content page-enter"
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
              loading={loading}
              submitReport={submitReport}
              topSignals={topSignals}
              setModal={setModal}
              navigate={navigate}
              reports={reports}
              connected={connected}
              lastUpdated={lastUpdated}
            />
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
              loading={loading}
              submitReport={submitReport}
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
              onSave={(values) =>
                saveAssistanceRequest("road", values)
              }
            />
          )}
        </div>
      </main>

      {modal && (
        <AssistanceModal
          type={modal}
          close={() => setModal(null)}
          onSave={saveAssistanceRequest}
          openModal={setModal}
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
  loading,
  submitReport,
  topSignals,
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
            <div className="hero-kicker"><span /> LIVE COMMUNITY SIGNAL</div>
            <h2>AI is scanning the community for <em>early signals.</em></h2>
            <p>Classification, anomaly detection, hotspot analysis and trend scoring are working together to surface problems that deserve attention.</p>

            <div className="hero-actions">
              <button className="primary-btn hero-primary" onClick={() => navigate("signals")}>Explore AI signals <b>↗</b></button>
              <button className="hero-secondary" onClick={() => setModal("emergency")}>Emergency assistance <b>→</b></button>
            </div>

            <div className="hero-footnote"><span className="status-dot connected" /> Decision-support indicators • Not an emergency dispatch system</div>
          </div>

          <div className="signal-radar" aria-hidden="true">
            <div className="radar-ring r1" /><div className="radar-ring r2" /><div className="radar-ring r3" />
            <div className="radar-sweep" />
            <div className="radar-core">AI<span>LIVE</span></div>
            <i className="radar-node n1" /><i className="radar-node n2" /><i className="radar-node n3" /><i className="radar-node n4" />
          </div>
        </div>

        <div className="command-side-stack">
          <div className="card command-health">
            <div className="command-card-head"><span className="mini-kicker">MODEL HEALTH</span><span className="health-badge">ONLINE</span></div>
            <div className="health-main"><strong>{stats.ai_accuracy}%</strong><span>classification accuracy</span></div>
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
        <Kpi title="Emerging issues" value={stats.emerging_issues} meta="AI signal candidates" icon="◈" tone="orange" />
        <Kpi title="Hotspot clusters" value={stats.hotspot_clusters} meta={`${stats.anomalies} anomalies scanned`} icon="⌁" tone="blue" />
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
          <div className="card-heading"><div><span className="mini-kicker">COMMUNITY REPORTER</span><h2>Report an issue</h2></div><span className="ai-chip">AI CLASSIFICATION</span></div>
          <form onSubmit={submitReport}>
            <label>What is happening?</label>
            <textarea value={report} onChange={(e) => setReport(e.target.value)} placeholder="Example: Large pothole near the market entrance..." />
            <div className="form-row">
              <div><label>Location</label><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Area / road / landmark" /></div>
              <div><label>Category</label><select value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORY_OPTIONS.map((x) => <option key={x}>{x}</option>)}</select></div>
            </div>
            <div className="form-bottom"><span>AI predicts the likely issue category and stores the report.</span><button className="primary-btn" disabled={loading}>{loading ? "Analyzing…" : "Analyze & Submit →"}</button></div>
          </form>
          {prediction && <div className="prediction-box"><div><span>AI RESULT</span><strong>{prediction.category}</strong></div>{prediction.confidence != null && <b>{Math.round(Number(prediction.confidence) * 100)}% confidence</b>}</div>}
        </div>
      </section>

      <section className="command-lower-grid">
        <Heatmap stats={stats} />
        <div className="card category-card tilt-card">
          <div className="card-heading"><div><span className="mini-kicker">CATEGORY INTELLIGENCE</span><h2>Where attention is going</h2></div></div>
          <div className="bars">
            {[['Noise - Residential',95],['Illegal Parking',82],['HEAT/HOT WATER',61],['Noise - Street/Sidewalk',52],['Street Condition',34]].map(([name,value]) => <div className="bar-row" key={name}><div><span>{name}</span><b>{value}%</b></div><div className="bar-track"><i style={{width:`${value}%`}} /></div></div>)}
          </div>
          <div className="category-foot"><span>Prototype dataset mix</span><button onClick={() => navigate("analytics")}>Open analytics →</button></div>
        </div>
      </section>

      <section className="card activity-card command-activity">
        <div className="card-heading"><div><span className="mini-kicker">RECENT ACTIVITY</span><h2>Latest community reports</h2></div><button className="text-btn" onClick={() => navigate("analytics")}>View analytics →</button></div>
        {reports.slice(0, 5).map((r, i) => <div className="activity-row" key={r.unique_key || r.id || i}><span className="activity-dot" /><div><strong>{r.complaint_type || r.category || "Community report"}</strong><span>{r.location || r.borough || "Location recorded"}</span></div><time>{r.created_date || r.timestamp || "Recent"}</time></div>)}
        {!reports.length && <div className="empty-state">Reports submitted through the dashboard will appear here.</div>}
      </section>

      <div className="footer-note">CommunitySignal AI • ML-powered community intelligence • Signals are decision-support indicators.</div>
    </>
  );
}

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

function Heatmap({ stats }) {
  return (
    <div className="card heat-card tilt-card">
      <div className="card-heading">
        <div>
          <span className="mini-kicker">
            GEOSPATIAL INTELLIGENCE
          </span>

          <h2>Community issue heatmap</h2>
        </div>

        <span className="map-chip">
          {stats.hotspot_clusters} clusters
        </span>
      </div>

      <div className="fake-map">
        <div className="map-grid" />

        {Array.from({ length: 30 }).map(
          (_, i) => (
            <span
              key={i}
              className="map-point"
              style={{
                left: `${8 + ((i * 37) % 84)}%`,
                top: `${9 + ((i * 53) % 78)}%`,
                animationDelay: `${i * 90}ms`,
              }}
            />
          )
        )}

        <div className="map-label m1">
          HIGH ACTIVITY
        </div>

        <div className="map-label m2">
          COMMUNITY ZONE
        </div>

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
          : value}
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
  const filtered = reports.filter((r) => {
    const q = reportSearch.trim().toLowerCase();
    const matchesSearch = !q || [r.report, r.description, r.location, r.category, r.predicted_problem]
      .some((v) => String(v || "").toLowerCase().includes(q));
    const matchesStatus = reportStatus === "All" || String(r.status || "Pending") === reportStatus;
    const matchesCategory = reportCategory === "All" || String(r.category || "") === reportCategory;
    const matchesPriority = reportPriority === "All" || String(r.priority || "Normal") === reportPriority;
    return matchesSearch && matchesStatus && matchesCategory && matchesPriority;
  });

  const categories = [...new Set(reports.map((r) => r.category).filter(Boolean))];
  const statuses = ["Pending", "In Progress", "Resolved", "Rejected"];
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
                    <div className="admin-report-meta"><span>📍 {r.location || "Location not specified"}</span><span>AI: {r.predicted_problem || "Not classified"}</span><span>ID #{r.id || r.report_id}</span><span>{r.created_at || "Recent"}</span></div>
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
          statuses={statuses}
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
        text="Submit a report and use the trained ML model to classify it."
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
  loading,
  submitReport,
}) {
  return (
    <form onSubmit={submitReport}>
      <label>Problem description</label>

      <textarea
        className="tall"
        value={report}
        onChange={(e) =>
          setReport(e.target.value)
        }
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
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
      </div>

      <button
        className="primary-btn"
        disabled={loading}
      >
        {loading
          ? "Analyzing…"
          : "Analyze & Save Report"}
      </button>

      {prediction && (
        <div className="prediction-box">
          <div>
            <span>AI RESULT</span>

            <strong>
              {prediction.category}
            </strong>
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
          meta="Dataset + submitted"
          icon="◫"
          tone="purple"
        />

        <Kpi
          title="Resolved"
          value={stats.resolved_reports}
          meta="Historical resolved"
          icon="✓"
          tone="green"
        />

        <Kpi
          title="Hotspots"
          value={stats.hotspot_clusters}
          meta="DBSCAN clusters"
          icon="⌁"
          tone="blue"
        />

        <Kpi
          title="Avg signal"
          value={avg.toFixed(1)}
          meta="Top signal set"
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

function RoadPage({ onSave }) {
  const [values, setValues] = useState({
    location: "",
    description: "",
    severity: "Moderate",
  });

  return (
    <div>
      <PageHeader
        eyebrow="ROAD & INFRASTRUCTURE"
        title="Road condition reporting"
        text="Capture potholes, damaged roads and unsafe road conditions as structured community reports."
      />

      <div className="card road-form tilt-card">
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
          onChange={(e) =>
            setValues({
              ...values,
              description: e.target.value,
            })
          }
          placeholder="Pothole, broken road, waterlogging, damaged divider..."
        />

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

        <button
          className="primary-btn"
          onClick={() => onSave(values)}
        >
          Submit road report →
        </button>
      </div>
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
      <img src={image} alt="" draggable="false" />
      <div className="service-image-vignette" />
      <div className="service-image-scan" />
      <div className="service-image-glow" />
      <style>{`
        .service-image-visual{position:relative;width:100%;height:100%;min-height:150px;overflow:hidden;background:#020817;border-radius:inherit;isolation:isolate}
        .service-image-visual img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;transform:scale(1.015);transition:transform .7s cubic-bezier(.2,.8,.2,1),filter .5s ease;filter:saturate(1.08) contrast(1.03)}
        .emergency-service-card:hover .service-image-visual img,.selected-service-hero:hover .service-image-visual img{transform:scale(1.065);filter:saturate(1.18) contrast(1.06) brightness(1.04)}
        .service-image-vignette{position:absolute;inset:0;background:linear-gradient(180deg,rgba(2,6,23,.02) 35%,rgba(2,6,23,.5) 100%);z-index:2;pointer-events:none}
        .service-image-scan{position:absolute;left:-20%;right:-20%;top:-15%;height:2px;background:linear-gradient(90deg,transparent,rgba(103,232,249,.8),transparent);box-shadow:0 0 18px rgba(56,189,248,.65);z-index:3;opacity:.65;animation:serviceScan 4.8s linear infinite;pointer-events:none}
        .service-image-glow{position:absolute;inset:auto 12% -24% 12%;height:42%;background:radial-gradient(ellipse,rgba(59,130,246,.22),transparent 68%);filter:blur(18px);z-index:1;animation:serviceGlow 3.2s ease-in-out infinite;pointer-events:none}
        .service-picture{overflow:hidden}
        .selected-service-hero{overflow:hidden}
        @keyframes serviceScan{0%{transform:translateY(0);opacity:0}12%{opacity:.75}50%{opacity:.9}88%{opacity:.7}100%{transform:translateY(290px);opacity:0}}
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
        <span />
        Emergency assistance
      </div>
    </button>
  );
}


function PeopleCareAI({ stats, signals, setModal, navigate }) {
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "ai",
      text:
        "Hi! I'm PeopleCare AI. I'm here to understand community problems, explain the live dashboard and help you decide what to do next. Ask me naturally — you don't need special keywords.",
      time: "now",
    },
  ]);

  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  const formatNumber = (value) =>
    Number(value || 0).toLocaleString("en-IN");

  const currentSignals = signals.slice(0, 8);

  const openReport = () => navigate("report");
  const openSignals = () => navigate("signals");
  const openAnalytics = () => navigate("analytics");

  const clearChat = () => {
    setMessages([
      {
        role: "ai",
        text:
          "Chat cleared. I'm ready to help. Tell me what is happening in your community.",
        time: "now",
      },
    ]);
  };

  const send = async (text = input) => {
    const clean = text.trim();
    if (!clean || thinking) return;

    const userMessage = {
      role: "user",
      text: clean,
      time: "now",
    };

    const history = messages
      .filter((m) => m.role === "user" || m.role === "ai")
      .slice(-12)
      .map((m) => ({
        role: m.role === "ai" ? "assistant" : "user",
        content: m.text,
      }));

    setMessages((m) => [...m, userMessage]);
    setInput("");
    setThinking(true);

    try {
      const response = await fetch("/api/peoplecare/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: clean,
          history,
          context: {
            stats,
            signals: currentSignals,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setMessages((m) => [
        ...m,
        {
          role: "ai",
          text:
            data.reply ||
            "I couldn't generate a response right now. Please try again.",
          time: "now",
        },
      ]);
    } catch (error) {
      console.error("PeopleCare AI error:", error);

      setMessages((m) => [
        ...m,
        {
          role: "ai",
          text:
            "I couldn't connect to my AI service right now. Please check that the PeopleCare backend is running and that the AI API key is configured.",
          time: "now",
        },
      ]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <aside
      className={`peoplecare-panel peoplecare-3d-panel ${
        expanded ? "peoplecare-expanded" : ""
      }`}
    >
      <div className="peoplecare-glow" />
      <div className="peoplecare-scan-line" />

      <div className="peoplecare-head">
        <div className="peoplecare-brand">
          <div className="peoplecare-avatar">
            <span>✦</span>
            <i />
          </div>

          <div>
            <span className="mini-kicker">COMMUNITY ASSISTANT</span>
            <h3>PeopleCare AI</h3>
            <small>AI for Community Support</small>
          </div>
        </div>

        <div className="peoplecare-head-actions">
          <button
            className="peoplecare-clear"
            onClick={clearChat}
            title="Clear chat"
          >
            ↻
          </button>

          <button
            className="peoplecare-expand"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Compact chat" : "Expand chat"}
          >
            {expanded ? "↙" : "↗"}
          </button>

          <span className="peoplecare-online">
            <i /> ONLINE
          </span>
        </div>
      </div>

      <div className="peoplecare-orbit" aria-hidden="true">
        <span />
        <b />
        <i />
      </div>

      <div className="peoplecare-context">
        <span>LIVE CONTEXT</span>
        <b>{formatNumber(stats.total_reports)} reports</b>
        <b>{stats.emerging_issues} signals</b>
        <b>{formatNumber(stats.hotspot_clusters)} hotspots</b>
      </div>

      <div className="peoplecare-chat" ref={chatRef}>
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={`peoplecare-message ${m.role}`}
          >
            {m.role === "ai" && (
              <span className="peoplecare-message-label">
                PEOPLECARE
              </span>
            )}
            <div>{m.text}</div>
          </div>
        ))}

        {thinking && (
          <div className="peoplecare-message ai thinking-message">
            <span className="peoplecare-message-label">
              PEOPLECARE
            </span>
            <div className="thinking-dots">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
      </div>

      <div className="peoplecare-quick">
        <button onClick={() => send("What are the latest community signals?")}>
          📡 Latest signals
        </button>

        <button onClick={() => setModal("emergency")}>
          🚨 Emergency help
        </button>

        <button onClick={() => setModal("blood")}>
          🩸 Blood help
        </button>

        <button onClick={() => setModal("women")}>
          🛡 Women safety
        </button>

        <button onClick={() => setModal("night")}>
          🌙 Night help
        </button>

        <button onClick={openReport}>
          📝 Report problem
        </button>

        <button onClick={openSignals}>
          📊 Signals
        </button>

        <button onClick={openAnalytics}>
          📈 Analytics
        </button>
      </div>

      <div className="peoplecare-input">
        <textarea
          value={input}
          rows="1"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask PeopleCare anything..."
          aria-label="Ask PeopleCare AI"
        />

        <button
          onClick={() => send()}
          disabled={thinking}
          aria-label="Send message"
        >
          ➤
        </button>
      </div>

      <div className="peoplecare-note">
        ● Uses live dashboard context • AI responses are informational • Not
        a replacement for official emergency services
      </div>
    </aside>
  );
}

function AssistanceModal({ type, close, onSave, openModal }) {
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
              <a href="tel:112" className="emergency-call-big">
                <span>☎</span> Call Emergency
              </a>
            </div>
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
            onClick={() => onSave("road", { location: "Urgent location - user to provide", description: "Urgent road hazard" })}
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
            <span>{type === "women" ? "SAFETY MODE" : type === "night" ? "NIGHT SUPPORT" : "BLOOD SUPPORT"}</span>
            <strong>{type === "women" ? "Women Safety" : type === "night" ? "Night Help" : "Blood Assistance"}</strong>
          </div>
        </div>
        <span className="mini-kicker">ASSISTANCE REQUEST</span>
        <h2>{title}</h2>
        <p>{text}</p>
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
