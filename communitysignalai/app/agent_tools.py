"""Bounded intent routing and metadata for PeopleCare's read-only agent tools.

Tool selection is deliberately deterministic: chat can retrieve data and run the
installed classifier, but it cannot execute arbitrary code or mutate reports.
"""

import re
import time


TOOL_REGISTRY = {
    "get_community_stats": {
        "description": "Read current local report totals and separately labeled NYC reference metrics.",
        "read_only": True,
        "required": [],
    },
    "report_summary": {
        "description": "Summarize actual local report categories, statuses, and priorities.",
        "read_only": True,
        "required": [],
    },
    "search_community_reports": {
        "description": "Search local reports and return redacted ticket metadata only.",
        "read_only": True,
        "required": ["query"],
    },
    "lookup_report_status": {
        "description": "Look up a report by ticket ID and return its status and non-sensitive metadata.",
        "read_only": True,
        "required": ["ticket_id"],
    },
    "community_report_insights": {
        "description": "Compute observed category, priority, and time-window counts from local reports.",
        "read_only": True,
        "required": [],
    },
    "analyze_community_signals": {
        "description": "Summarize precomputed historical NYC 311 signals, not live local reports.",
        "read_only": True,
        "required": [],
    },
    "classify_complaint": {
        "description": "Run the installed descriptor-only V3 classifier on supplied civic text.",
        "read_only": True,
        "required": ["text"],
    },
    "road_problem_analysis": {
        "description": "Count local reports matching road and infrastructure categories.",
        "read_only": True,
        "required": [],
    },
    "search_blood_requests": {
        "description": "Find blood-assistance request records and return redacted ticket metadata; no donor matching.",
        "read_only": True,
        "required": [],
    },
    "emergency_guidance": {
        "description": "Return configured India emergency guidance; this app does not dispatch responders.",
        "read_only": True,
        "required": [],
    },
    "resource_lookup": {
        "description": "Search the platform's configured public resource directory.",
        "read_only": True,
        "required": ["query"],
    },
    "prepare_report": {
        "description": "Prepare a report draft and optional ML category prediction without saving it.",
        "read_only": True,
        "required": ["text"],
    },
    "project_health": {
        "description": "Check model, dataset, reports, signals, and provider configuration.",
        "read_only": True,
        "required": [],
    },
    "dataset_summary": {
        "description": "Summarize the loaded reference dataset and its documented scope.",
        "read_only": True,
        "required": [],
    },
    "project_search": {
        "description": "Retrieve relevant source and documentation snippets from this project.",
        "read_only": True,
        "required": ["query"],
    },
}

MAX_TOOLS_PER_TURN = 3


def _search_query(message):
    cleaned = re.sub(
        r"\b(?:please|find|search|show|list|look up|check|recent|latest|community|civic|local|reports?|tickets?|about|for|the|in|my|any|all|road|problem|issues?)\b",
        " ",
        message,
        flags=re.IGNORECASE,
    )
    return re.sub(r"\s+", " ", cleaned).strip(" .?!,:;")[:100]


def select_agent_tools(message):
    """Choose a small allowlisted tool set from explicit user intent."""
    text = str(message or "").strip()
    lower = text.lower()
    selected = []

    ticket_match = re.search(r"\bPC-\d{8}-[A-Z0-9]{4,12}\b", text, re.IGNORECASE)
    if ticket_match:
        selected.append(("lookup_report_status", {"ticket_id": ticket_match.group(0).upper()}))

    if re.search(r"\b(blood request|blood assistance|need blood|urgent blood|blood donor|donor request)\b|रक्त|खून", lower):
        selected.append(("search_blood_requests", {}))
    elif re.search(r"\b(emergency|ambulance|police|fire rescue|immediate danger|life[- ]threatening|112)\b|आपातकाल", lower):
        selected.append(("emergency_guidance", {}))

    if re.search(r"\b(classify|classification|categorize|what category|category for|predict the category|category prediction)\b|वर्गीकरण|वर्गीकृत|श्रेणी", lower) and re.search(
        r"\b(complaint|report|issue|problem|pothole|water|road|street|light|garbage|drain)\b|शिकायत|समस्या|सड़क|गड्ढा", lower
    ):
        selected.append(("classify_complaint", {"text": text[:4000]}))

    if re.search(r"\b(draft|write|prepare|help me submit|help me report)\b|मसौदा|लिखने|तैयार", lower) and re.search(
        r"\b(report|complaint|issue|problem)\b", lower
    ):
        selected.append(("prepare_report", {"text": text[:4000]}))

    if re.search(r"\b(resource|helpline|hotline|official contact|contact number|where can i get help)\b|सहायता|हेल्पलाइन|संसाधन", lower):
        selected.append(("resource_lookup", {"query": _search_query(text) or text[:100]}))

    report_search = (re.search(r"\b(find|search|show|list|look up|any|recent|latest)\b", lower) and re.search(
        r"\b(reports?|tickets?|potholes?|road issues?)\b", lower
    )) or (re.search(r"खोज|दिख|सूची|नवीनतम|हाल के", lower) and re.search(r"रिपोर्ट|टिकट|सड़क|गड्ढ", lower))
    if report_search and not ticket_match:
        selected.append(("search_community_reports", {"query": _search_query(text) or "*"}))

    analysis = re.search(r"\b(analy[sz]e|analysis|trend|trends|pattern|patterns|prioriti[sz]e|highest priority|major problems|most common|what should.*priorit|forecast|predict.*urgent|which issues.*urgent)\b|विश्लेषण|रुझान|प्राथमिकता|प्रमुख समस्य", lower)
    asks_stats = re.search(r"\b(how many|count|total|statistics|stats|summary|resolved|pending|high[- ]priority)\b|कितन[ेीा]|कुल|संख्या|सारांश", lower)
    if analysis:
        selected.append(("community_report_insights", {}))
        if re.search(r"\b(signal|signals|nyc|311|historical|emerging)\b", lower):
            selected.append(("analyze_community_signals", {}))
        else:
            selected.append(("report_summary", {}))
    elif asks_stats and re.search(r"\b(report|community|signal|local|dashboard|issue)\b|रिपोर्ट|समुदाय|संकेत|स्थानीय|समस्या", lower):
        selected.extend([("get_community_stats", {}), ("report_summary", {})])

    if re.search(r"\b(signal|signals|nyc 311|emerging community)\b|संकेत|सिग्नल", lower) and not any(
        name == "analyze_community_signals" for name, _ in selected
    ):
        selected.append(("analyze_community_signals", {}))

    if re.search(r"\b(road|roads|pothole|infrastructure|street light|drainage)\b|सड़क|गड्ढा", lower) and re.search(
        r"\b(our|local|community|reports?|data|problems?|issues?|trend|analy[sz]e|many|common)\b|हमारे|स्थानीय|समुदाय|रिपोर्ट|डेटा|समस्य|विश्लेषण|कितन[ेीा]", lower
    ) and not any(name == "classify_complaint" for name, _ in selected):
        selected.append(("road_problem_analysis", {}))

    project_context = re.search(
        r"\b(peoplecare|communitysignal)\b", lower
    ) and re.search(r"\b(architecture|source code|features|model|components|stack|system|how it works|tools|project health)\b", lower)
    explicit_project_question = re.search(r"\b(project architecture|project files|how does .* platform work|project health|communitysignal architecture)\b", lower)
    if project_context or explicit_project_question:
        selected.append(("project_health", {}))
        selected.append(("project_search", {"query": text[:200]}))

    # Keep order while deduplicating; never exceed the per-turn execution budget.
    deduplicated = []
    seen = set()
    for name, args in selected:
        if name not in seen and name in TOOL_REGISTRY:
            deduplicated.append((name, args))
            seen.add(name)
        if len(deduplicated) >= MAX_TOOLS_PER_TURN:
            break
    return deduplicated


def execute_agent_tools(message, executor, logger=None):
    """Run only registered tools; return bounded results and data-free telemetry."""
    results = []
    telemetry = []
    for name, args in select_agent_tools(message):
        started = time.perf_counter()
        try:
            result = executor(name, args)
            if not isinstance(result, dict):
                raise TypeError("Tool returned an invalid result shape")
            results.append({"name": name, "success": True, "result": result})
            telemetry.append({"name": name, "success": True, "elapsed_ms": round((time.perf_counter() - started) * 1000)})
        except Exception as error:
            if logger:
                logger.warning("PeopleCare tool '%s' failed (%s).", name, type(error).__name__)
            results.append({"name": name, "success": False, "error": "This data tool is temporarily unavailable."})
            telemetry.append({"name": name, "success": False, "elapsed_ms": round((time.perf_counter() - started) * 1000)})
    return results, telemetry
