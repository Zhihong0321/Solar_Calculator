let charts = {};

document.addEventListener('DOMContentLoaded', () => {
    setPeriod('thisMonth');
});

async function setPeriod(period) {
    // Update active button
    document.querySelectorAll('.btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`button[onclick="setPeriod('${period}')"]`).classList.add('active');

    let startDate, endDate;
    const now = new Date();

    if (period === 'thisMonth') {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        // Correctly calculate last day of current month: move to next month, day 0
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        // Adjust timezone offset to ensure YYYY-MM-DD matches local intent
        // Or simply use formatting:
        startDate = formatDate(firstDay);
        endDate = formatDate(lastDay);
    } else if (period === 'lastMonth') {
        const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
        startDate = formatDate(firstDay);
        endDate = formatDate(lastDay);
    }
    // allTime: leave undefined

    await loadData(startDate, endDate);
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function loadData(startDate, endDate) {
    try {
        let url = '/api/kpi/overview';
        if (startDate && endDate) {
            url += `?startDate=${startDate}&endDate=${endDate}`;
        }

        const res = await fetch(url);
        const json = await res.json();

        if (json.success) {
            renderDashboard(json.data);
        } else {
            console.error('API Error:', json.error);
        }
    } catch (e) {
        console.error('Failed to load KPI data', e);
    }
}

function renderDashboard(data) {
    const { agentRanking, activityBreakdown, leadSourceStats } = data;

    // 1. Top Stats
    const totalPoints = agentRanking.reduce((sum, a) => sum + parseInt(a.total_points || 0), 0);
    const totalActivities = agentRanking.reduce((sum, a) => sum + parseInt(a.total_activities || 0), 0);
    const totalClosed = agentRanking.reduce((sum, a) => sum + parseInt(a.close_cases || 0), 0);

    document.getElementById('totalPoints').textContent = totalPoints.toLocaleString();
    document.getElementById('totalActivities').textContent = totalActivities.toLocaleString();
    document.getElementById('totalClosed').textContent = totalClosed.toLocaleString();

    // 2. Ranking Table
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
                            <div style="font-weight: 600;">${agent.agent_name}</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">${agent.contact || ''}</div>
                        </div>
                    </div>
                </td>
                <td style="font-weight: 700; color: var(--accent);">${agent.total_points}</td>
                <td>${agent.total_activities}</td>
                <td>${agent.close_cases}</td>
            </tr>
        `).join('');
    }

    // 3. Activity Chart (Donut)
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

    // 4. Lead Source Chart (Bar)
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

    // 5. Top Performers Highlight
    const topPerformersContainer = document.getElementById('topPerformersList');
    if (agentRanking.length > 0) {
        topPerformersContainer.innerHTML = agentRanking.slice(0, 3).map((agent, index) => `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; background: #f1f5f9; border-radius: 0.5rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div class="rank-badge rank-${index + 1}">${index + 1}</div>
                    <img src="${agent.profile_picture || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(agent.agent_name || 'U') + '&background=e2e8f0&color=64748b'}" class="avatar">
                    <span style="font-weight: 600;">${agent.agent_name}</span>
                </div>
                <span style="font-weight: 700;">${agent.total_points} pts</span>
            </div>
        `).join('');
    } else {
        topPerformersContainer.innerHTML = '<p style="text-align:center; color: var(--text-muted);">No top performers yet.</p>';
    }
}

function renderChart(canvasId, type, data) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    if (charts[canvasId]) {
        charts[canvasId].destroy();
        charts[canvasId] = null;
    }

    charts[canvasId] = new Chart(ctx, {
        type: type,
        data: data,
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
    // const ctx = document.getElementById(canvasId).getContext('2d');
    // ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    // ctx.textAlign = 'center';
    // ctx.fillText('No Data', ctx.canvas.width / 2, ctx.canvas.height / 2);
}
