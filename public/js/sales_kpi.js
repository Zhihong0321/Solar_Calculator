let charts = {};

const state = {
    startDate: null,
    endDate: null,
    selectedAgentId: null,
    selectedAgentName: null
};

document.addEventListener('DOMContentLoaded', () => {
    setupRankingClick();
    setupTopPerformerClick();
    setPeriod('today');
});

function setupRankingClick() {
    const tbody = document.querySelector('#rankingTable tbody');
    if (!tbody) return;

    tbody.addEventListener('click', (event) => {
        const btn = event.target.closest('.agent-name-btn');
        if (!btn) return;

        const agentId = btn.getAttribute('data-agent-id');
        const agentName = btn.getAttribute('data-agent-name') || 'Selected Agent';
        if (!agentId) return;

        selectAgent(agentId, agentName, true);
    });
}

function setupTopPerformerClick() {
    const container = document.getElementById('topPerformersList');
    if (!container) return;

    container.addEventListener('click', (event) => {
        const btn = event.target.closest('.top-agent-btn');
        if (!btn) return;

        const agentId = btn.getAttribute('data-agent-id');
        const agentName = btn.getAttribute('data-agent-name') || 'Selected Agent';
        if (!agentId) return;

        selectAgent(agentId, agentName, true);
    });
}

async function setPeriod(period) {
    document.querySelectorAll('.btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`button[onclick="setPeriod('${period}')"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const { startDate, endDate } = resolvePeriod(period);
    state.startDate = formatDate(startDate);
    state.endDate = formatDate(endDate);

    await loadOverview();

    if (state.selectedAgentId) {
        await loadAgentDailyDetail(state.selectedAgentId, state.selectedAgentName, false);
    } else {
        renderDefaultAgentDetail();
    }
}

function resolvePeriod(period) {
    const today = new Date();
    const startDate = new Date(today);
    const endDate = new Date(today);

    if (period === 'yesterday') {
        startDate.setDate(today.getDate() - 1);
        endDate.setDate(today.getDate() - 1);
    } else if (period === 'lastWeek') {
        startDate.setDate(today.getDate() - 6);
    } else if (period === 'thisMonth') {
        startDate.setDate(1);
    }

    return { startDate, endDate };
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function loadOverview() {
    try {
        let url = '/api/kpi/overview';
        const params = new URLSearchParams();
        if (state.startDate) params.append('startDate', state.startDate);
        if (state.endDate) params.append('endDate', state.endDate);
        if (params.toString()) url += `?${params.toString()}`;

        const res = await fetch(url);
        const json = await res.json();

        if (json.success) {
            renderDashboard(json.data);
        } else {
            console.error('API Error:', json.error);
        }
    } catch (e) {
        console.error('Failed to load overview data', e);
    }
}

function renderDashboard(data) {
    const { agentRanking, activityBreakdown, leadSourceStats } = data;

    const totalPoints = agentRanking.reduce((sum, a) => sum + parseInt(a.total_points || 0, 10), 0);
    const totalActivities = agentRanking.reduce((sum, a) => sum + parseInt(a.total_activities || 0, 10), 0);
    const totalClosed = agentRanking.reduce((sum, a) => sum + parseInt(a.close_cases || 0, 10), 0);

    document.getElementById('totalPoints').textContent = totalPoints.toLocaleString();
    document.getElementById('totalActivities').textContent = totalActivities.toLocaleString();
    document.getElementById('totalClosed').textContent = totalClosed.toLocaleString();

    const tbody = document.querySelector('#rankingTable tbody');
    if (agentRanking.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem;">No data available for this period.</td></tr>';
    } else {
        tbody.innerHTML = agentRanking.map((agent, index) => `
            <tr>
                <td><div class="rank-badge rank-${index + 1}">${index + 1}</div></td>
                <td>
                    <div class="agent-cell">
                        <img src="${agent.profile_picture || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(agent.agent_name || 'U') + '&background=e2e8f0&color=64748b'}" class="avatar">
                        <div>
                            <button
                                type="button"
                                class="agent-name-btn"
                                data-agent-id="${escapeAttr(agent.bubble_id || '')}"
                                data-agent-name="${escapeAttr(agent.agent_name || 'Unknown')}"
                            >${escapeHtml(agent.agent_name || 'Unknown')}</button>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(agent.contact || '')}</div>
                        </div>
                    </div>
                </td>
                <td style="font-weight: 700; color: var(--accent);">${agent.total_points}</td>
                <td>${agent.total_activities}</td>
                <td>${agent.close_cases}</td>
            </tr>
        `).join('');
    }

    if (activityBreakdown.length > 0) {
        renderChart('activityChart', 'doughnut', {
            labels: activityBreakdown.map(a => a.activity_type),
            datasets: [{
                data: activityBreakdown.map(a => a.count),
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b', '#06b6d4'],
                borderWidth: 0
            }]
        });
    } else {
        clearChart('activityChart');
    }

    if (leadSourceStats.length > 0) {
        renderChart('leadSourceChart', 'bar', {
            labels: leadSourceStats.map(l => l.lead_source || 'Unknown'),
            datasets: [{
                label: 'Leads',
                data: leadSourceStats.map(l => l.count),
                backgroundColor: '#0f172a',
                borderRadius: 4
            }]
        });
    } else {
        clearChart('leadSourceChart');
    }

    const topPerformersContainer = document.getElementById('topPerformersList');
    if (agentRanking.length > 0) {
        topPerformersContainer.innerHTML = agentRanking.slice(0, 3).map((agent, index) => `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; background: #f1f5f9; border-radius: 0.5rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div class="rank-badge rank-${index + 1}">${index + 1}</div>
                    <img src="${agent.profile_picture || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(agent.agent_name || 'U') + '&background=e2e8f0&color=64748b'}" class="avatar">
                    <button
                        type="button"
                        class="agent-name-btn top-agent-btn"
                        style="font-weight: 600;"
                        data-agent-id="${escapeAttr(agent.bubble_id || '')}"
                        data-agent-name="${escapeAttr(agent.agent_name || 'Unknown')}"
                    >${escapeHtml(agent.agent_name || 'Unknown')}</button>
                </div>
                <span style="font-weight: 700;">${agent.total_points} pts</span>
            </div>
        `).join('');
    } else {
        topPerformersContainer.innerHTML = '<p style="text-align:center; color: var(--text-muted);">No top performers yet.</p>';
    }
}

function selectAgent(agentId, agentName, scroll = true) {
    if (!agentId) return;
    state.selectedAgentId = agentId;
    state.selectedAgentName = agentName || 'Selected Agent';
    loadAgentDailyDetail(state.selectedAgentId, state.selectedAgentName, scroll);
}

async function loadAgentDailyDetail(agentId, agentName, scroll = true) {
    const label = document.getElementById('selectedAgentLabel');
    const detailContainer = document.getElementById('agentDailyDetail');
    label.textContent = agentName || 'Selected Agent';
    detailContainer.innerHTML = '<p style="text-align:center; color: var(--text-muted);">Loading detail...</p>';

    try {
        const params = new URLSearchParams({
            agentId,
            startDate: state.startDate,
            endDate: state.endDate,
            limit: '1000'
        });

        const res = await fetch(`/api/kpi/agent-activities?${params.toString()}`);
        const json = await res.json();
        if (!json.success) {
            detailContainer.innerHTML = `<p style="text-align:center; color: #ef4444;">${escapeHtml(json.error || 'Failed to load detail')}</p>`;
            return;
        }

        renderAgentDailyDetail(json.data || []);
        if (scroll) {
            document.getElementById('agentDetailSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    } catch (e) {
        detailContainer.innerHTML = '<p style="text-align:center; color: #ef4444;">Failed to load detail</p>';
    }
}

function renderDefaultAgentDetail() {
    document.getElementById('selectedAgentLabel').textContent = 'Select a person in ranking';
    document.getElementById('agentDailyDetail').innerHTML = '<p style="text-align:center; color: var(--text-muted);">Click a person in ranking to view daily detail.</p>';
}

function renderAgentDailyDetail(rows) {
    const detailContainer = document.getElementById('agentDailyDetail');
    if (!rows || rows.length === 0) {
        detailContainer.innerHTML = '<p style="text-align:center; color: var(--text-muted);">No activities found for selected person in this period.</p>';
        return;
    }

    const grouped = rows.reduce((acc, row) => {
        const dayKey = formatDate(new Date(row.report_date));
        if (!acc[dayKey]) acc[dayKey] = [];
        acc[dayKey].push(row);
        return acc;
    }, {});

    const dayKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
    detailContainer.innerHTML = dayKeys.map(day => {
        const dayRows = grouped[day];
        const totalPoints = dayRows.reduce((sum, row) => sum + Number(row.report_point || 0), 0);
        return `
            <div style="border:1px solid var(--border); border-radius: 0.75rem; padding: 0.875rem; margin-bottom: 0.75rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:0.75rem;">
                    <div style="font-weight:700;">${formatDisplayDate(day)}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${dayRows.length} activities • ${totalPoints} points</div>
                </div>
                <div style="margin-top:0.5rem;">
                    ${dayRows.map(row => `
                        <div style="border-top:1px solid #f1f5f9; padding-top:0.5rem; margin-top:0.5rem;">
                            <div style="display:flex; justify-content:space-between; gap:0.75rem;">
                                <div style="font-size:0.8125rem; font-weight:600;">${escapeHtml(row.activity_type || '-')}</div>
                                <div style="font-size:0.75rem; font-weight:700; color:var(--accent);">${row.report_point || 0} pts</div>
                            </div>
                            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">${escapeHtml(row.follow_up_subtype || '')}</div>
                            <div style="font-size:0.8125rem; margin-top:0.25rem;">${escapeHtml(row.remark || '-')}</div>
                            ${row.customer_name ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">Customer: ${escapeHtml(row.customer_name)}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function renderChart(canvasId, type, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (charts[canvasId]) {
        charts[canvasId].destroy();
        charts[canvasId] = null;
    }

    charts[canvasId] = new Chart(ctx, {
        type,
        data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { boxWidth: 12, font: { size: 11 } }
                }
            },
            scales: type === 'bar' ? {
                y: { beginAtZero: true, grid: { display: false } },
                x: { grid: { display: false } }
            } : {}
        }
    });
}

function clearChart(canvasId) {
    if (charts[canvasId]) {
        charts[canvasId].destroy();
        charts[canvasId] = null;
    }
}
