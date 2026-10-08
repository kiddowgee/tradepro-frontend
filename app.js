const API_URL = 'https://api.tradeassist.online';
let isRegister = false;
let pollTimer = null;

window.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('access_token');
    const savedEmail = localStorage.getItem('user_email');
    if (token) {
        showDashboard(savedEmail || 'User');
    }
});

function toggleAuthMode() {
    isRegister = !isRegister;
    document.getElementById('auth-title').innerText = isRegister ? 'Register' : 'Login';
    document.getElementById('auth-btn').innerText = isRegister ? 'Register' : 'Login';
    document.getElementById('auth-toggle').innerText = isRegister ? 'Have an account? Login' : 'Need an account? Register';
    document.getElementById('auth-error').innerText = '';
}

function showDashboard(email) {
    document.getElementById('auth-card').classList.add('hidden');
    document.getElementById('dash-card').classList.remove('hidden');
    document.getElementById('user-display').innerText = email;
    
    fetchAccountData();
    fetchDevices();
    if (!pollTimer) {
        pollTimer = setInterval(() => {
            fetchAccountData();
            fetchDevices();
        }, 3000);
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
            showDashboard(e);
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

            // Account stats
            document.getElementById('val-balance').innerText = (accountInfo.balance ?? '-') + ' ' + (accountInfo.currency || '');
            document.getElementById('val-equity').innerText = (accountInfo.equity ?? '-') + ' ' + (accountInfo.currency || '');
            document.getElementById('val-broker').innerText = accountInfo.company || accountInfo.broker || '-';
            document.getElementById('val-account').innerText = accountInfo.login || accountInfo.account_number || '-';

            // Watchlist
            renderWatchlist(mt5.quotes || {});

            // Positions
            const positions = mt5.positions || [];
            document.getElementById('pos-count').innerText = positions.length;
            const posBody = document.getElementById('pos-table-body');
            if (positions.length === 0) {
                posBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8;">No open positions</td></tr>';
            } else {
                posBody.innerHTML = positions.map(p => `
                    <tr>
                        <td>${p.ticket}</td>
                        <td>${p.symbol}</td>
                        <td class="${p.type === 0 ? 'buy' : 'sell'}">${p.type === 0 ? 'BUY' : 'SELL'}</td>
                        <td>${p.volume}</td>
                        <td>${p.price_open}</td>
                        <td style="color:${p.profit >= 0 ? '#4ade80' : '#f87171'}">${p.profit}</td>
                    </tr>
                `).join('');
            }

            // Orders
            const orders = mt5.orders || [];
            document.getElementById('orders-count').innerText = orders.length;
            const orderBody = document.getElementById('orders-table-body');
            if (orders.length === 0) {
                orderBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No pending orders</td></tr>';
            } else {
                orderBody.innerHTML = orders.map(o => `
                    <tr>
                        <td>${o.ticket}</td>
                        <td>${o.symbol}</td>
                        <td>${o.type}</td>
                        <td>${o.volume_initial}</td>
                        <td>${o.price_open}</td>
                    </tr>
                `).join('');
            }

            // History & Analytics
            const history = (mt5.history && mt5.history.deals) ? mt5.history.deals : [];
            renderHistoryAndAnalytics(history, accountInfo.currency || '');
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
        if (!q.live) {
            return `
                <div class="quote-card" style="border-left-color: #64748b;">
                    <div class="quote-sym">${sym} <span style="font-size:0.7em; color:#94a3b8;">OFFLINE</span></div>
                    <div style="font-size:0.8em; color:#94a3b8; margin-top:4px;">${q.error || 'Symbol unavailable'}</div>
                </div>
            `;
        }

        const spreadFormatted = (q.spread ?? 0).toFixed(q.digits > 3 ? 1 : 2);

        return `
            <div class="quote-card">
                <div class="quote-sym">
                    ${sym}
                    <span style="font-size:0.7em; color:#38bdf8;">Spread: ${spreadFormatted}</span>
                </div>
                <div class="quote-row">
                    <span>Bid: <b class="quote-bid">${q.bid}</b></span>
                    <span>Ask: <b class="quote-ask">${q.ask}</b></span>
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
        document.getElementById('analytics-trades').innerText = '0';
        document.getElementById('analytics-pl').innerText = '0.00 ' + currency;
        document.getElementById('analytics-winrate').innerText = '0%';
        document.getElementById('analytics-pf').innerText = '0.00';
        return;
    }

    let totalPL = 0;
    let wins = 0;
    let grossProfit = 0;
    let grossLoss = 0;

    historyBody.innerHTML = deals.map(d => {
        const profit = d.profit || 0;
        totalPL += profit;
        if (profit > 0) {
            wins++;
            grossProfit += profit;
        } else if (profit < 0) {
            grossLoss += Math.abs(profit);
        }

        const timeStr = d.time ? new Date(d.time * 1000).toLocaleString() : '-';

        return `
            <tr>
                <td>${d.ticket}</td>
                <td>${d.symbol || '-'}</td>
                <td class="${d.type === 0 ? 'buy' : 'sell'}">${d.type === 0 ? 'BUY' : 'SELL'}</td>
                <td>${d.volume || 0}</td>
                <td>${d.price || 0}</td>
                <td>${timeStr}</td>
                <td class="${profit >= 0 ? 'profit-pos' : 'profit-neg'}">${profit.toFixed(2)} ${currency}</td>
            </tr>
        `;
    }).join('');

    const totalTrades = deals.length;
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0';
    const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : (grossProfit > 0 ? 'INF' : '0.00');

    document.getElementById('analytics-trades').innerText = totalTrades;
    document.getElementById('analytics-pl').innerText = totalPL.toFixed(2) + ' ' + currency;
    document.getElementById('analytics-pl').className = 'stat-val ' + (totalPL >= 0 ? 'profit-pos' : 'profit-neg');
    document.getElementById('analytics-winrate').innerText = winRate + '%';
    document.getElementById('analytics-pf').innerText = profitFactor;
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
            if (devices.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No devices paired</td></tr>';
                return;
            }
            tbody.innerHTML = devices.map(d => `
                <tr>
                    <td><code>${d.device_id}</code></td>
                    <td>${new Date(d.created * 1000).toLocaleDateString()}</td>
                    <td>${d.last_seen ? new Date(d.last_seen * 1000).toLocaleTimeString() : 'Never'}</td>
                    <td>
                        <span class="status-tag ${d.revoked ? 'status-revoked' : 'status-live'}">
                            ${d.revoked ? 'REVOKED' : 'ACTIVE'}
                        </span>
                    </td>
                    <td>
                        ${!d.revoked ? `<button class="btn-danger" onclick="revokeDevice('${d.device_id}')">Revoke</button>` : '-'}
                    </td>
                </tr>
            `).join('');
        }
    } catch (err) {
        console.error(err);
    }
}

async function revokeDevice(deviceId) {
    if (!confirm(`Are you sure you want to revoke device ${deviceId}?`)) return;

    const token = localStorage.getItem('access_token');
    if (!token) return;

    try {
        const res = await fetch(API_URL + '/v1/device/revoke', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token 
            },
            body: JSON.stringify({ device_id: deviceId })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
            fetchDevices();
            fetchAccountData();
        } else {
            alert(data.error || 'Failed to revoke device');
        }
    } catch (err) {
        alert('Error revoking device');
    }
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
        } else {
            alert(data.error || 'Failed to generate code');
        }
    } catch (err) {
        alert('Error generating code');
    }
}
