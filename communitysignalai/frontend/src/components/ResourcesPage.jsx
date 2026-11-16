import { useState, useMemo } from "react";

const PUBLIC_RESOURCES = [
  {
    id: "res-1",
    category: "Emergency & Safety",
    title: "112 National Unified Emergency Service",
    description:
      "India's official integrated emergency response number. This app does not place calls or send location.",
    phone: "112",
    tag: "Emergency number",
    badge: "India",
    icon: "✚",
    link: "tel:112",
  },
  {
    id: "res-2",
    category: "Emergency & Safety",
    title: "National Police Helpline",
    description:
      "Police helpline listed by the Government of India. Confirm local availability when outside the listed service area.",
    phone: "100",
    tag: "Law Enforcement",
    badge: "Police 24/7",
    icon: "🛡",
    link: "tel:100",
  },
  {
    id: "res-3",
    category: "Medical & Health",
    title: "Emergency Medical & Ambulance Transport",
    description:
      "Ambulance contact listed by the Government of India. Availability and coverage may vary by location.",
    phone: "102",
    tag: "Medical Dispatch",
    badge: "Trauma Care",
    icon: "🚑",
    link: "tel:102",
  },
  {
    id: "res-4",
    category: "Medical & Health",
    title: "National Blood Transfusion & e-RaktKosh",
    description:
      "Government portal with blood bank information. PeopleCare does not verify stock or coordinate donors.",
    phone: "See portal",
    tag: "Blood Banking",
    badge: "Donor Network",
    icon: "♥",
    link: "https://eraktkosh.in",
  },
  {
    id: "res-5",
    category: "Women & Child Safety",
    title: "Women in Distress National Helpline",
    description:
      "Women’s helpline contacts listed by the Government of India. Confirm the service and coverage for your location.",
    phone: "1091 / 181",
    tag: "Women Protection",
    badge: "Confidential 24/7",
    icon: "◌",
    link: "tel:1091",
  },
  {
    id: "res-6",
    category: "Women & Child Safety",
    title: "Childline Emergency Support",
    description:
      "Child helpline contact listed by the Government of India. This app does not dispatch or monitor a response.",
    phone: "1098",
    tag: "Child Welfare",
    badge: "Toll Free 24/7",
    icon: "🚸",
    link: "tel:1098",
  },
  {
    id: "res-7",
    category: "Civic & Infrastructure",
    title: "Civic Central 311 Citizen Portal",
    description:
      "311 is used by some US municipalities and is not a general India civic helpline. Check your local authority for reporting channels.",
    phone: "Check locally",
    tag: "Civic Redressal",
    badge: "Municipal Ops",
    icon: "⌁",
    link: "tel:311",
  },
  {
    id: "res-8",
    category: "Emergency & Safety",
    title: "National Disaster Response Force (NDRF)",
    description:
      "National disaster response information. For immediate emergencies in India, call 112.",
    phone: "1078 / 011-24363260",
    tag: "Disaster Rescue",
    badge: "National Team",
    icon: "⚡",
    link: "tel:1078",
  },
  {
    id: "res-9",
    category: "Digital Safety",
    title: "National Cyber Crime Reporting Helpline",
    description:
      "Immediate reporting portal for cyber financial fraud, identity theft, online harassment, and digital exploitation.",
    phone: "1930",
    tag: "Cyber Security",
    badge: "MHA Cyber Wing",
    icon: "💻",
    link: "https://cybercrime.gov.in",
  },
  {
    id: "res-10",
    category: "Mental Health",
    title: "Tele-MANAS Mental Health Support",
    description:
      "National tele-mental health programme providing free, round-the-clock psychological counseling, crisis de-escalation, and psychiatric guidance.",
    phone: "14416 / 1800-891-4416",
    tag: "Mental Wellbeing",
    badge: "Free Counseling",
    icon: "🌱",
    link: "tel:14416",
  },
  {
    id: "res-11",
    category: "Civic & Infrastructure",
    title: "National Highway Helpline (NHAI)",
    description:
      "24/7 emergency patrol, towing assistance, medical emergency, and road condition alerts across all national highways.",
    phone: "1033",
    tag: "Highway Patrol",
    badge: "Expressway Ops",
    icon: "🛣",
    link: "tel:1033",
  },
  {
    id: "res-12",
    category: "Emergency & Safety",
    title: "Fire Emergency & Hazard Response",
    description:
      "Immediate tactical response for fire incidents, gas leakage, chemical hazards, and structural entrapments.",
    phone: "101",
    tag: "Fire Service",
    badge: "Fire Brigade",
    icon: "🔥",
    link: "tel:101",
  },
];

const CATEGORIES = [
  "All",
  "Emergency & Safety",
  "Medical & Health",
  "Women & Child Safety",
  "Civic & Infrastructure",
  "Digital Safety",
  "Mental Health",
];

export default function ResourcesPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return PUBLIC_RESOURCES.filter((res) => {
      const matchesCat = activeCategory === "All" || res.category === activeCategory;
      const matchesQuery =
        !q ||
        res.title.toLowerCase().includes(q) ||
        res.description.toLowerCase().includes(q) ||
        res.phone.toLowerCase().includes(q) ||
        res.tag.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [search, activeCategory]);

  return (
    <div className="resources-page-view">
      <div className="page-header">
        <div>
          <div className="eyebrow">COMMUNITY DIRECTORY • VERIFIED SERVICES</div>
          <h1>Public Safety & Civic Resources</h1>
          <p>
            Public service links and contact references. Numbers, coverage, and availability can change;
            confirm details with the linked official service. This app does not dispatch help.
          </p>
        </div>
        <div className="verified-seal">
          <span>•</span> REFERENCE DIRECTORY
        </div>
      </div>

      {/* Search & Category Filter */}
      <div className="resource-filter-bar glass-card">
        <div className="resource-search-box">
          <span className="search-icon">⌕</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search resources, helplines, medical care, women safety..."
            aria-label="Search resources"
          />
          {search && (
            <button className="clear-btn" onClick={() => setSearch("")}>
              ✕
            </button>
          )}
        </div>

        <div className="category-chips">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`cat-chip ${activeCategory === cat ? "active" : ""}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Resources Cards Grid */}
      <div className="resources-grid">
        {filtered.map((item) => (
          <div key={item.id} className="resource-card glass-card hover-lift">
            <div className="resource-card-head">
              <div className="resource-icon-box">{item.icon}</div>
              <div className="resource-badges">
                <span className="badge-tag">{item.tag}</span>
                <span className="badge-status">{item.badge}</span>
              </div>
            </div>

            <h3>{item.title}</h3>
            <p>{item.description}</p>

            <div className="resource-card-footer">
              <div className="phone-display">
                <small>Helpline / Contact</small>
                <strong>{item.phone}</strong>
              </div>

              <a
                href={item.link}
                target={item.link.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer"
                className="btn-call-action"
              >
                <span>{item.link.startsWith("http") ? "↗ Open Portal" : "☎ Direct Call"}</span>
              </a>
            </div>
          </div>
        ))}

        {!filtered.length && (
          <div className="empty-state-card glass-card full-span">
            <span className="empty-icon">⌕</span>
            <h3>No matching resources found</h3>
            <p>Try searching for a different keyword or select "All" categories.</p>
            <button
              className="primary-btn"
              onClick={() => {
                setSearch("");
                setActiveCategory("All");
              }}
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      <div className="resource-notice glass-card">
        <div className="notice-icon">ℹ</div>
        <div>
          <strong>Safety Advisory</strong>
          <p>
            CommunitySignal AI (powered by assistant PeopleCare AI) provides intelligent civic triage and direction. For
            life-threatening conditions, always dial <strong>112</strong> immediately.
          </p>
        </div>
      </div>
    </div>
  );
}
