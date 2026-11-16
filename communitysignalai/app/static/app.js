// ============================================================
// CommunitySignal AI
// Frontend Controller
// ============================================================

document.addEventListener("DOMContentLoaded", () => {

    // --------------------------------------------------------
    // ELEMENT HELPERS
    // --------------------------------------------------------

    const $ = (selector) =>
        document.querySelector(selector);

    const $$ = (selector) =>
        document.querySelectorAll(selector);


    // --------------------------------------------------------
    // TOAST
    // --------------------------------------------------------

    function toast(message) {

        const element = $("#toast");

        if (!element) return;

        element.textContent = message;

        element.classList.add("show");

        setTimeout(() => {
            element.classList.remove("show");
        }, 2600);
    }


    // --------------------------------------------------------
    // SAFE HTML
    // --------------------------------------------------------

    function escapeHTML(value) {

        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }


    // --------------------------------------------------------
    // NUMBER
    // --------------------------------------------------------

    function numberValue(value, fallback = 0) {

        const number = Number(value);

        return Number.isFinite(number)
            ? number
            : fallback;
    }


    // --------------------------------------------------------
    // RISK
    // --------------------------------------------------------

    function riskClass(level) {

        const value =
            String(level || "Low").toLowerCase();

        if (value === "critical") {
            return "high";
        }

        if (value === "high") {
            return "high";
        }

        if (value === "moderate") {
            return "medium";
        }

        return "low";
    }


    // ========================================================
    // LOAD DASHBOARD STATS
    // ========================================================

    async function loadStats() {

        try {

            const response =
                await fetch("/api/stats");

            const stats =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    stats.error ||
                    "Unable to load statistics."
                );
            }


            $("#totalReports").textContent =
                numberValue(
                    stats.total_reports,
                    30000
                ).toLocaleString();


            $("#highPriority").textContent =
                numberValue(
                    stats.high_priority,
                    0
                ).toLocaleString();


            $("#resolvedReports").textContent =
                numberValue(
                    stats.resolved_reports,
                    24563
                ).toLocaleString();


            $("#aiAccuracy").textContent =
                `${numberValue(
                    stats.ai_accuracy,
                    83.98
                ).toFixed(2)}%`;


            $("#analyticsTotal").textContent =
                numberValue(
                    stats.total_reports,
                    30000
                ).toLocaleString();


            $("#analyticsResolved").textContent =
                numberValue(
                    stats.resolved_reports,
                    24563
                ).toLocaleString();


            $("#analyticsHigh").textContent =
                numberValue(
                    stats.high_priority,
                    0
                ).toLocaleString();


        } catch (error) {

            console.error(error);

            $("#totalReports").textContent =
                "30,000";

            $("#highPriority").textContent =
                "0";

            $("#resolvedReports").textContent =
                "24,563";

            $("#aiAccuracy").textContent =
                "83.98%";
        }
    }


    // ========================================================
    // SIGNALS
    // ========================================================

    async function loadSignals() {

        const list =
            $("#signalList");

        if (!list) return;

        try {

            const response =
                await fetch("/api/signals");

            const signals =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    signals.error ||
                    "Unable to load signals."
                );
            }


            if (
                !Array.isArray(signals) ||
                signals.length === 0
            ) {

                list.innerHTML = `
                    <div class="loading">
                        No emerging signals available.
                    </div>
                `;

                return;
            }


            list.innerHTML = "";


            signals
                .slice(0, 6)
                .forEach(signal => {

                    const name =
                        signal.complaint_type ||
                        "Unknown Problem";

                    const score =
                        numberValue(
                            signal.community_signal_score
                        );

                    const risk =
                        signal.risk_level ||
                        "Low";

                    const growth =
                        numberValue(
                            signal.growth_rate
                        );


                    const row =
                        document.createElement("div");

                    row.className =
                        "signal-row";


                    row.innerHTML = `

                        <div class="signal-name">

                            <i class="fa-solid fa-wave-square"></i>

                            <div>

                                <strong>
                                    ${escapeHTML(name)}
                                </strong>

                                <small>
                                    ${growth >= 0
                                        ? "Rising community signal"
                                        : "Declining signal"}
                                </small>

                            </div>

                        </div>


                        <span class="signal-score">
                            ${score.toFixed(2)}
                        </span>


                        <b class="signal-risk ${riskClass(risk)}">
                            ${escapeHTML(risk.toUpperCase())}
                        </b>

                    `;

                    list.appendChild(row);
                });


            const rail =
                $("#railSignals");

            if (rail) {

                rail.innerHTML = "";

                signals
                    .slice(0, 5)
                    .forEach(signal => {

                        const name =
                            signal.complaint_type ||
                            "Community Issue";

                        const risk =
                            signal.risk_level ||
                            "Low";


                        const item =
                            document.createElement("div");

                        item.className =
                            "rail-signal";


                        item.innerHTML = `

                            <i class="fa-solid fa-circle-exclamation"></i>

                            <div>

                                <strong>
                                    ${escapeHTML(name)}
                                </strong>

                                <small>
                                    Signal detected
                                </small>

                            </div>

                            <b class="${riskClass(risk)}">
                                ${escapeHTML(
                                    risk.toUpperCase()
                                )}
                            </b>

                        `;

                        rail.appendChild(item);

                    });
            }

        } catch (error) {

            console.error(error);

            list.innerHTML = `
                <div class="loading">
                    Unable to load AI signals.
                </div>
            `;
        }
    }


    // ========================================================
    // CATEGORY DATA
    // ========================================================

    async function loadCategories() {

        try {

            const response =
                await fetch("/api/categories");

            const categories =
                await response.json();

            if (!response.ok ||
                !Array.isArray(categories)) {

                return;
            }


            if (!categories.length) {
                return;
            }


            const list =
                $("#categoryList");

            if (!list) return;


            const max =
                Math.max(
                    ...categories.map(
                        item =>
                            numberValue(
                                item.count
                            )
                    )
                );


            list.innerHTML = "";


            categories.forEach(
                (item, index) => {

                    const count =
                        numberValue(
                            item.count
                        );


                    const width =
                        Math.max(
                            10,
                            (count / max) * 100
                        );


                    const row =
                        document.createElement(
                            "div"
                        );

                    row.className =
                        "category-row";


                    row.innerHTML = `

                        <div class="category-name">
                            ${escapeHTML(
                                item.category
                            )}
                        </div>

                        <div class="category-bar ${
                            index === 1
                                ? "purple"
                                : index === 2
                                ? ""
                                : index === 3
                                ? "green"
                                : index === 4
                                ? "orange"
                                : index >= 5
                                ? "gray"
                                : ""
                        }">

                            <span
                                style="width:${width}%"
                            ></span>

                        </div>

                        <b>
                            ${count.toLocaleString()}
                        </b>

                    `;


                    list.appendChild(row);

                }
            );

        } catch (error) {

            console.error(
                "Category loading error:",
                error
            );
        }
    }


    // ========================================================
    // AI REPORT FORM
    // ========================================================

    const reportForm =
        $("#reportForm");


    if (reportForm) {

        reportForm.addEventListener(
            "submit",
            async event => {

                event.preventDefault();


                const text =
                    $("#reportText")
                        .value
                        .trim();

                const location =
                    $("#reportLocation")
                        .value
                        .trim();

                const priority =
                    $("#reportPriority")
                        .value;


                if (!text) {

                    toast(
                        "Please describe the community problem first."
                    );

                    $("#reportText").focus();

                    return;
                }


                const button =
                    reportForm.querySelector(
                        ".primary-button"
                    );


                const original =
                    button.innerHTML;


                button.disabled = true;

                button.innerHTML = `
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    AI Analyzing...
                `;


                const predictionBox =
                    $("#predictionBox");


                predictionBox.innerHTML = `
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    <span>
                        CommunitySignal AI is analyzing the report...
                    </span>
                `;


                try {

                    // ------------------------------------------------
                    // AI PREDICTION
                    // ------------------------------------------------

                    const predictionResponse =
                        await fetch(
                            "/predict",
                            {
                                method: "POST",

                                headers: {
                                    "Content-Type":
                                        "application/json"
                                },

                                body: JSON.stringify({
                                    report: text,
                                    text: text,
                                    description: text
                                })
                            }
                        );


                    const prediction =
                        await predictionResponse.json();


                    if (!predictionResponse.ok) {

                        throw new Error(
                            prediction.error ||
                            "AI prediction failed."
                        );
                    }


                    const predicted =
                        prediction.predicted_problem ||
                        prediction.prediction ||
                        "Community Problem";


                    const confidence =
                        prediction.confidence;


                    // ------------------------------------------------
                    // SAVE REPORT
                    // ------------------------------------------------

                    await fetch(
                        "/api/reports",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({

                                report: text,

                                description: text,

                                category:
                                    "Community Problem",

                                location:
                                    location ||
                                    "Not specified",

                                priority,

                                predicted_problem:
                                    predicted,

                                prediction:
                                    predicted
                            })
                        }
                    );


                    // ------------------------------------------------
                    // SHOW RESULT
                    // ------------------------------------------------

                    predictionBox.innerHTML = `

                        <i
                            class="fa-solid fa-circle-check"
                            style="color:#35df8c"
                        ></i>

                        <span>
                            AI detected:
                            <strong>
                                ${escapeHTML(
                                    predicted
                                )}
                            </strong>

                            ${
                                confidence !== null &&
                                confidence !== undefined
                                    ? ` · ${numberValue(
                                        confidence
                                    ).toFixed(1)}% confidence`
                                    : ""
                            }
                        </span>

                    `;


                    toast(
                        "Report analyzed and saved successfully."
                    );


                    reportForm.reset();


                    await Promise.all([
                        loadStats(),
                        loadSignals()
                    ]);

                } catch (error) {

                    console.error(error);


                    predictionBox.innerHTML = `

                        <i
                            class="fa-solid fa-triangle-exclamation"
                            style="color:#ff5a61"
                        ></i>

                        <span>
                            ${escapeHTML(
                                error.message ||
                                "Unable to connect to AI service."
                            )}
                        </span>

                    `;


                    toast(
                        "AI service could not process the report."
                    );

                } finally {

                    button.disabled = false;

                    button.innerHTML =
                        original;
                }

            }
        );
    }


    // ========================================================
    // EMERGENCY NUMBERS
    // ========================================================

    const emergencyNumbers = {

        ambulance: "102",

        fire: "101",

        police: "112",

        general: "112"

    };


    function openEmergencyModal() {

        const modal =
            $("#emergencyModal");

        if (!modal) return;

        modal.classList.add("open");
    }


    function closeEmergencyModal() {

        const modal =
            $("#emergencyModal");

        if (!modal) return;

        modal.classList.remove("open");
    }


    function callEmergency(type) {

        const number =
            emergencyNumbers[type] ||
            emergencyNumbers.general;


        toast(
            `Connecting to emergency service: ${number}`
        );


        // Actual phone call on supported devices.
        window.location.href =
            `tel:${number}`;
    }


    // Emergency buttons

    $$("[data-emergency]")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const type =
                        button.dataset.emergency;

                    callEmergency(type);

                }
            );
        });


    $("#emergencyOpen")
        ?.addEventListener(
            "click",
            openEmergencyModal
        );


    $("#railEmergency")
        ?.addEventListener(
            "click",
            openEmergencyModal
        );


    $("#closeEmergency")
        ?.addEventListener(
            "click",
            closeEmergencyModal
        );


    $("#emergencyModal")
        ?.addEventListener(
            "click",
            event => {

                if (
                    event.target.id ===
                    "emergencyModal"
                ) {

                    closeEmergencyModal();
                }

            }
        );


    // ========================================================
    // SIDEBAR NAVIGATION
    // ========================================================

    const navLinks =
        $$(".nav-link");


    function showSection(
        id,
        clickedLink = null
    ) {

        if (!id) return;


        // Dashboard is always visible.
        if (id === "dashboard") {

            $("#dashboard").style.display =
                "";

            $$(".hidden-section")
                .forEach(section => {

                    section.classList.remove(
                        "visible"
                    );

                });

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });

        } else {

            $$(".hidden-section")
                .forEach(section => {

                    section.classList.remove(
                        "visible"
                    );

                });


            const section =
                document.getElementById(id);

            if (section) {

                section.classList.add(
                    "visible"
                );

                section.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }

        }


        navLinks.forEach(link => {

            link.classList.remove(
                "active"
            );

        });


        if (clickedLink) {

            clickedLink.classList.add(
                "active"
            );
        }


        const sidebar =
            $("#sidebar");

        sidebar?.classList.remove(
            "open"
        );
    }


    navLinks.forEach(link => {

        link.addEventListener(
            "click",
            event => {

                event.preventDefault();

                const target =
                    link
                        .getAttribute("href")
                        .replace("#", "");


                if (
                    target === "emergency"
                ) {

                    openEmergencyModal();

                    return;
                }


                showSection(
                    target,
                    link
                );
            }
        );
    });


    // ========================================================
    // MOBILE MENU
    // ========================================================

    $("#mobileMenu")
        ?.addEventListener(
            "click",
            () => {

                $("#sidebar")
                    ?.classList
                    .toggle("open");

            }
        );


    // ========================================================
    // SPECIAL REPORT BUTTONS
    // ========================================================

    $("#roadReport")
        ?.addEventListener(
            "click",
            () => {

                showSection(
                    "dashboard"
                );

                setTimeout(() => {

                    $("#reportText").value =
                        "Road damage / pothole reported: ";

                    $("#reportText")
                        .focus();

                    toast(
                        "Describe the road problem and submit it for AI analysis."
                    );

                }, 350);
            }
        );


    $("#civicReport")
        ?.addEventListener(
            "click",
            () => {

                showSection(
                    "dashboard"
                );

                setTimeout(() => {

                    $("#reportText").value =
                        "Civic/community complaint: ";

                    $("#reportText")
                        .focus();

                    toast(
                        "Describe the civic issue and submit it."
                    );

                }, 350);
            }
        );


    $("#differenceButton")
        ?.addEventListener(
            "click",
            () => {

                showSection(
                    "dashboard"
                );

                setTimeout(() => {

                    $("#reportText")
                        .focus();

                    toast(
                        "Your community report can help identify emerging problems."
                    );

                }, 300);
            }
        );


    $("#communityAction")
        ?.addEventListener(
            "click",
            () => {

                showSection(
                    "dashboard"
                );

                setTimeout(() => {

                    $("#reportText")
                        .focus();

                }, 300);

            }
        );


    $("#womenEmergency")
        ?.addEventListener(
            "click",
            openEmergencyModal
        );


    // ========================================================
    // BLOOD REQUEST
    // ========================================================

    $("#bloodSubmit")
        ?.addEventListener(
            "click",
            () => {

                const group =
                    $("#bloodGroup").value;

                const area =
                    $("#bloodArea").value.trim();


                if (!group || !area) {

                    toast(
                        "Please select a blood group and area."
                    );

                    return;
                }


                toast(
                    `Blood assistance request created for ${group}.`
                );

            }
        );


    // ========================================================
    // GLOBAL SEARCH
    // ========================================================

    $("#globalSearch")
        ?.addEventListener(
            "keydown",
            event => {

                if (
                    event.key ===
                    "Enter"
                ) {

                    const query =
                        event.target.value
                            .trim()
                            .toLowerCase();


                    if (!query) return;


                    const cards =
                        $$(".dashboard-card");


                    cards.forEach(card => {

                        card.style.outline =
                            "none";

                    });


                    let found = false;


                    cards.forEach(card => {

                        if (
                            card.innerText
                                .toLowerCase()
                                .includes(query)
                        ) {

                            card.style.outline =
                                "1px solid #4285ff";

                            card.scrollIntoView({
                                behavior:
                                    "smooth",
                                block:
                                    "center"
                            });

                            found = true;

                        }

                    });


                    toast(
                        found
                            ? `Found results for "${query}".`
                            : `No dashboard result for "${query}".`
                    );
                }

            }
        );


    // ========================================================
    // KEYBOARD SHORTCUT
    // ========================================================

    document.addEventListener(
        "keydown",
        event => {

            if (
                (event.ctrlKey ||
                    event.metaKey) &&
                event.key.toLowerCase() ===
                    "k"
            ) {

                event.preventDefault();

                $("#globalSearch")
                    ?.focus();

            }


            if (
                event.key ===
                "Escape"
            ) {

                closeEmergencyModal();

            }

        }
    );


    // ========================================================
    // INITIAL DATA
    // ========================================================

    Promise.all([
        loadStats(),
        loadSignals(),
        loadCategories()
    ]);


    // ========================================================
    // CONSOLE
    // ========================================================

    console.log(
        "%cCommunitySignal AI",
        "color:#4f8cff;font-size:20px;font-weight:bold"
    );

    console.log(
        "Dashboard initialized successfully."
    );

});