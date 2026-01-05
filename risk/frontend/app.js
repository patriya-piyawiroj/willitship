const API_URL = "http://localhost:8003/api/v1/risk-assessments";

// DOM Elements
const views = document.querySelectorAll('.view');
const navLinks = document.querySelectorAll('.nav-links li');
const form = document.getElementById('assessment-form');
const resultPanel = document.getElementById('result-panel');

// Navigation Logic
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        const tabId = link.getAttribute('data-tab');
        views.forEach(view => {
            view.classList.remove('active');
            if (view.id === `${tabId}-view`) view.classList.add('active');
        });

        if (tabId === 'dashboard') loadDashboard();
    });
});

// Assessment Form Submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Quick Animation for button
    const btn = form.querySelector('button');
    const originalText = btn.innerText;
    btn.innerText = "Analyzing...";
    btn.disabled = true;

    const payload = {
        blNumber: document.getElementById('blNumber').value,
        shipper: { name: document.getElementById('shipperName').value },
        consignee: { name: document.getElementById('consigneeName').value },
        portOfLoading: document.getElementById('pol').value,
        portOfDischarge: document.getElementById('pod').value,
        incoterm: document.getElementById('incoterm').value,
        freightPaymentTerms: document.getElementById('freightTerms').value,
        dateOfIssue: document.getElementById('issueDate').value,
        shippedOnBoardDate: document.getElementById('shippedDate').value
    };

    try {
        const res = await fetch(API_URL + "/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error("API call failed");

        const data = await res.json();
        const responseData = data.breakdown ? data : convertSnakeToCamel(data); // Handle alias issues

        renderResult(responseData);

    } catch (err) {
        alert("Error analyzing risk: " + err.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

// Helper to handle mixed naming conventions if any
function convertSnakeToCamel(data) {
    // Basic mapping if needed, assuming Pydantic aliases work mostly
    return data;
}

function renderResult(data) {
    resultPanel.classList.remove('hidden');

    // 1. Text Fields
    document.getElementById('rating-grade').innerText = data.riskRating || data.risk_rating;
    document.getElementById('rating-reason').innerText = data.riskRatingReasoning || data.risk_rating_reasoning;

    const band = (data.riskBand || data.risk_band).toLowerCase();
    const badge = document.getElementById('risk-badge');
    badge.innerText = band.toUpperCase() + " RISK";
    badge.className = `badge ${band}`;

    // 2. Score Ring Animation
    const score = data.overallScore || data.overall_score;
    document.getElementById('score-value').innerText = score;

    const circle = document.querySelector('.progress-ring__circle');
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (score / 100) * circumference;

    circle.style.strokeDashoffset = offset;
    circle.style.stroke = getScoreColor(score);

    // 3. Breakdown List
    const breakdownContainer = document.querySelector('.breakdown-list');
    breakdownContainer.innerHTML = ''; // Clear prev

    const breakdowns = data.breakdown || [];
    breakdowns.forEach(item => {
        const type = item.scoreType || item.score_type;
        const s = item.score;
        const reasons = item.reasons || [];

        const div = document.createElement('div');
        div.className = 'breakdown-row';
        div.innerHTML = `
            <div>
                <span style="text-transform: capitalize; color: #8b949e;">${type} Score</span>
                ${reasons.length > 0 ? `<br><small style="color:#da3633">${reasons[0]}</small>` : ''}
            </div>
            <div class="breakdown-score" style="color: ${getScoreColor(s)}">${s}</div>
        `;
        breakdownContainer.appendChild(div);
    });

    // 4. Events
    const penalty = data.eventPenalty || data.event_penalty;
    if (penalty !== 0) {
        document.getElementById('event-penalty-section').classList.remove('hidden');
        document.getElementById('event-penalty-text').innerText = `Total Penalty: ${penalty}`;
    } else {
        document.getElementById('event-penalty-section').classList.add('hidden');
    }
}

function getScoreColor(score) {
    if (score >= 80) return '#238636'; // Green
    if (score >= 60) return '#d29922'; // Yellow
    return '#da3633'; // Red
}

// Dashboard Logic
async function loadDashboard() {
    try {
        const [statsRes, historyRes] = await Promise.all([
            fetch(API_URL + "/stats"),
            fetch(API_URL + "/")
        ]);

        const stats = await statsRes.json();
        const history = await historyRes.json();

        // Render Stats
        document.getElementById('kpi-total').innerText = stats.totalTransactions || stats.total_transactions;
        document.getElementById('kpi-avg').innerText = stats.avgScore || stats.avg_score;
        document.getElementById('kpi-high').innerText = stats.highRiskCount || stats.high_risk_count;

        // Render Table
        const tbody = document.getElementById('history-table-body');
        tbody.innerHTML = '';

        history.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.transactionRef || row.transaction_ref}</td>
                <td>${row.shipper}</td>
                <td>${row.consignee}</td>
                <td style="color:${getScoreColor(row.score)}">${row.score}</td>
                <td><span class="badge ${(row.riskBand || row.risk_band).toLowerCase()}">${row.riskRating || row.risk_rating}</span></td>
                <td>${new Date(row.createdAt || row.created_at).toLocaleDateString()}</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error("Dashboard error", err);
    }
}
