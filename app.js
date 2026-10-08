const API_URL = 'https://api.tradeassist.online';
let isRegister = false;
let pollTimer = null;
let currentTab = 'dashboard';

window.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('access_token');
    const savedEmail = localStorage.getItem('user_email');
    if (token) {
        showApp(savedEmail || 'User');
    }
});

function toggleAuthMode() {
    isRegister = !isRegister;
    document.getElementById('auth-title').innerText = isRegister ? 'Register' : 'Login';
    document.getElementById('auth-btn').innerText = isRegister ? 'Register' : 'Login';
    document.getElementById('auth-toggle').innerText = isRegister ? 'Have an account? Login' : 'Need an account? Register';
    document.getElementById('auth-error').innerText = '';
}

function switchTab(tabName) {
    currentTab = tabName;
    document.querySelectorAll('.tab-view').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    const activeView = document.getElementById(`view-${tabName}`);
    const activeBtn = document.getElementById(`tab-${tabName}`);
    if (activeView) activeView.classList.remove('hidden');
    if (activeBtn) activeBtn.classList.add('active');

    refreshCurrentView();
}

function showApp(email) {
    document.getElementById('auth-card').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    document.getElementById('user-display').innerText = email;

    switchTab('dashboard');

    if (!pollTimer) {
        pollTimer = setInterval(refreshCurrentView, 3000);
    }
}

function refreshCurrentView() {
    if (currentTab === 'dashboard') {
        fetchAccountData();
    } else if (currentTab === 'signals') {
        fetchSignals();
    } else if (currentTab === 'profile') {
        fetchDevices();
    }
}

async function handleAuth() {
    document.getElementById('auth-error').innerText = '';
    const e = document.getElementById('email').value.trim();
    const p = document.getElementById('password').value;
    const endpoint = isRegister ? '/v1/auth/register' : '/v1/auth/login';

    try {
        const res = await fetch(API_URL + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: e, password: p })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Authentication failed');

        if (isRegister) {
            alert('Registration successful! Please login.');
            toggleAuthMode();
        } else {
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('user_email', e);
            showApp(e);
        }
    } catch (err) {
        document.getElementById('auth-error').innerText = err.message;
    }
}

async function logout() {
    if (pollTimer) clearInterval(pollTimer);
    const token = localStorage.getItem('access_token');
    if (token) {
        await fetch(API_URL + '/v1/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token }
        });
    }
    localStorage.clear();
    location.reload();
}

async function fetchAccountData() {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    try {
        const res = await fetch(API_URL + '/v1/account', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        if (res.ok && data.ok) {
            const statusTag = document.getElementById('conn-status');

            if (data.status === 'NO_DEVICE_SNAPSHOT') {
                document.getElementById('val-balance').innerText = 'No Device';
                document.getElementById('val-equity').innerText = 'No Device';
                document.getElementById('val-broker').innerText = 'N/A';
                document.getElementById('val-account').innerText = 'N/A';
                statusTag.innerText = 'NO DEVICE';
                statusTag.className = 'status-tag status-wait';
                return;
            }

            statusTag.innerText = 'CONNECTED';
            statusTag.className = 'status-tag status-live';
            document.getElementById('last-update').innerText = new Date().toLocaleTimeString();

            const snap = data.snapshot || {};
            const mt5 = snap.mt5 || {};
            const accountInfo = mt5.account || snap.account || snap;

            document.getElementById('val-balance').innerText = (accountInfo.balance ?? '-') + ' ' + (accountInfo.currency || '');
            document.getElementById('val-equity').innerText = (accountInfo.equity ?? '-') + ' ' + (accountInfo.currency || '');
            document.getElementById('val-broker').innerText = accountInfo.company || accountInfo.broker || '-';
            document.getElementById('val-account').innerText = accountInfo.login || accountInfo.account_number || '-';

            renderWatchlist(mt5.quotes || {});

            const positions = mt5.positions || [];
            document.getElementById('pos-count').innerText = positions.length;
            const posBody = document.getElementById('pos-table-body');
            posBody.innerHTML = positions.length === 0 ? '<tr><td colspan="6" style="text-align:center; color:#94a3b8;">No open positions</td></tr>' :
                positions.map(p => `
                    <tr>
                        <td>${p.ticket}</td>
                        <td>${p.symbol}</td>
                        <td class="${p.type === 0 ? 'buy' : 'sell'}">${p.type === 0 ? 'BUY' : 'SELL'}</td>
                        <td>${p.volume}</td>
                        <td>${p.price_open}</td>
                        <td style="color:${p.profit >= 0 ? '#4ade80' : '#f87171'}">${p.profit}</td>
                    </tr>
                `).join('');

            const orders = mt5.orders || [];
            document.getElementById('orders-count').innerText = orders.length;
            const orderBody = document.getElementById('orders-table-body');
            orderBody.innerHTML = orders.length === 0 ? '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No pending orders</td></tr>' :
                orders.map(o => `
                    <tr>
                        <td>${o.ticket}</td>
                        <td>${o.symbol}</td>
                        <td>${o.type}</td>
                        <td>${o.volume_initial}</td>
                        <td>${o.price_open}</td>
                    </tr>
                `).join('');

            renderHistoryAndAnalytics((mt5.history && mt5.history.deals) ? mt5.history.deals : [], accountInfo.currency || '');
        }
    } catch (err) {
        console.error(err);
    }
}

async function fetchSignals() {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    try {
        const res = await fetch(API_URL + '/v1/signals', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        if (res.ok && data.ok) {
            const container = document.getElementById('signals-container');
            const signals = data.signals || [];

            if (signals.length === 0) {
                container.innerHTML = '<div style="color:#94a3b8; text-align:center; padding:20px;">No active trade signals generated. Connect MT5 connector to enable real-time analysis.</div>';
                return;
            }

            container.innerHTML = signals.map(s => `
                <div class="signal-card">
                    <div class="signal-header">
                        <div>
                            <span style="font-size:1.2em; font-weight:bold;">${s.symbol}</span>
                            <span class="${s.type === 'BUY' ? 'buy' : 'sell'}" style="margin-left:10px;">${s.type}</span>
                        </div>
                        <div>
                            <span style="font-size:0.8em; color:#94a3b8; border:1px solid #475569; padding:2px 6px; border-radius:4px;">${s.timeframe}</span>
                            <span class="status-tag status-live" style="margin-left:5px;">${s.strength}</span>
                        </div>
                    </div>
                    <div style="font-size:0.9em; color:#cbd5e1; margin-bottom:10px;">
                        <b>Strategy:</b> ${s.strategy} | <b>Risk-Reward:</b> ${s.rr}
                    </div>
                    <div class="signal-body">
                        <div><span style="color:#94a3b8; font-size:0.8em;">Entry</span><br><b>${s.entry}</b></div>
                        <div><span style="color:#f87171; font-size:0.8em;">Stop Loss</span><br><b style="color:#f87171;">${s.sl}</b></div>
                        <div><span style="color:#4ade80; font-size:0.8em;">Take Profit 1</span><br><b style="color:#4ade80;">${s.tp1}</b></div>
                        <div><span style="color:#34d399; font-size:0.8em;">Take Profit 2</span><br><b style="color:#34d399;">${s.tp2}</b></div>
                    </div>
                    <div style="font-size:0.85em; color:#94a3b8; margin-top:10px; background:#0f172a; padding:8px; border-radius:4px;">
                        <b>Confluence Reason:</b> ${s.confluence}
                    </div>
                </div>
            `).join('');
        }
    } catch (err) {
        console.error(err);
    }
}

function renderWatchlist(quotes) {
    const container = document.getElementById('watchlist-container');
    const syms = Object.keys(quotes);
    if (syms.length === 0) {
        container.innerHTML = '<div style="color: #94a3b8; grid-column: 1 / -1;">No active market quotes available</div>';
        return;
    }
    container.innerHTML = syms.map(sym => {
        const q = quotes[sym];
        if (!q.live) return `<div class="quote-card" style="border-left-color:#64748b;"><div class="quote-sym">${sym} <span style="font-size:0.7em; color:#94a3b8;">OFFLINE</span></div></div>`;
        return `
            <div class="quote-card">
                <div class="quote-sym">${sym} <span style="font-size:0.7em; color:#38bdf8;">Spread: ${(q.spread ?? 0).toFixed(q.digits > 3 ? 1 : 2)}</span></div>
                <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:0.9em;">
                    <span>Bid: <b style="color:#f87171;">${q.bid}</b></span>
                    <span>Ask: <b style="color:#4ade80;">${q.ask}</b></span>
                </div>
            </div>
        `;
    }).join('');
}

function renderHistoryAndAnalytics(deals, currency) {
    document.getElementById('history-count').innerText = deals.length;
    const historyBody = document.getElementById('history-table-body');
    if (deals.length === 0) {
        historyBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#94a3b8;">No closed deals</td></tr>';
        return;
    }
    let totalPL = 0, wins = 0, grossProfit = 0, grossLoss = 0;
    historyBody.innerHTML = deals.map(d => {
        const profit = d.profit || 0;
        totalPL += profit;
        if (profit > 0) { wins++; grossProfit += profit; }
        else if (profit < 0) { grossLoss += Math.abs(profit); }
        return `
            <tr>
                <td>${d.ticket}</td>
                <td>${d.symbol || '-'}</td>
                <td class="${d.type === 0 ? 'buy' : 'sell'}">${d.type === 0 ? 'BUY' : 'SELL'}</td>
                <td>${d.volume || 0}</td>
                <td>${d.price || 0}</td>
                <td>${d.time ? new Date(d.time * 1000).toLocaleString() : '-'}</td>
                <td class="${profit >= 0 ? 'profit-pos' : 'profit-neg'}">${profit.toFixed(2)} ${currency}</td>
            </tr>
        `;
    }).join('');

    const totalTrades = deals.length;
    document.getElementById('analytics-trades').innerText = totalTrades;
    document.getElementById('analytics-pl').innerText = totalPL.toFixed(2) + ' ' + currency;
    document.getElementById('analytics-winrate').innerText = (totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0') + '%';
    document.getElementById('analytics-pf').innerText = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : (grossProfit > 0 ? 'INF' : '0.00');
}

async function fetchDevices() {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    try {
        const res = await fetch(API_URL + '/v1/devices', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        if (res.ok && data.ok) {
            const tbody = document.getElementById('devices-table-body');
            const devices = data.devices || [];
            tbody.innerHTML = devices.length === 0 ? '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No devices paired</td></tr>' :
                devices.map(d => `
                    <tr>
                        <td><code>${d.device_id}</code></td>
                        <td>${new Date(d.created * 1000).toLocaleDateString()}</td>
                        <td>${d.last_seen ? new Date(d.last_seen * 1000).toLocaleTimeString() : 'Never'}</td>
                        <td><span class="status-tag ${d.revoked ? 'status-revoked' : 'status-live'}">${d.revoked ? 'REVOKED' : 'ACTIVE'}</span></td>
                        <td>${!d.revoked ? `<button class="btn-danger" onclick="revokeDevice('${d.device_id}')">Revoke</button>` : '-'}</td>
                    </tr>
                `).join('');
        }
    } catch (err) {
        console.error(err);
    }
}

async function revokeDevice(deviceId) {
    if (!confirm(`Revoke device ${deviceId}?`)) return;
    const token = localStorage.getItem('access_token');
    if (!token) return;
    try {
        const res = await fetch(API_URL + '/v1/device/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ device_id: deviceId })
        });
        if (res.ok) fetchDevices();
    } catch (err) { alert('Error revoking device'); }
}

async function createPairingCode() {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    try {
        const res = await fetch(API_URL + '/v1/pairing/create', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        if (res.ok && data.code) {
            document.getElementById('pairing-code-display').innerHTML = 'Pairing Code: <code>' + data.code + '</code>';
        }
    } catch (err) { alert('Error generating code'); }
}
