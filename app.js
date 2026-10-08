const API_URL = 'https://api.tradeassist.online';

let isRegister = false;
let pollTimer = null;
let currentTab = 'dashboard';
let lastQuotes = {};
let selectedSymbol = null;
const chartHistory = Object.create(null);
const CHART_MAX_POINTS = 120;

window.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupChartResize();

    const token = localStorage.getItem('access_token');
    const email = localStorage.getItem('user_email');
    if (token) showApp(email || 'Account');
    else showLogin();
});

function $(id) { return document.getElementById(id); }

function safe(value) {
    return String(value ?? '—')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
    return String(value ?? '')
        .replaceAll('\\', '\\\\')
        .replaceAll("'", "\\'");
}

function formatNumber(value, digits = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return value == null || value === '' ? '—' : safe(value);
    return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatPrice(value, digits = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const d = Math.max(0, Math.min(Number(digits) || 2, 8));
    return n.toFixed(d);
}

function token() { return localStorage.getItem('access_token'); }

async function apiFetch(path, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };
    if (token()) headers.Authorization = `Bearer ${token()}`;

    const response = await fetch(`${API_URL}${path}`, { ...options, headers });
    let data = null;
    try { data = await response.json(); } catch (_) {}

    if (response.status === 401) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('user_email');
        showLogin();
        throw new Error('Your session has expired. Please sign in again.');
    }
    if (!response.ok) {
        throw new Error(data?.detail || data?.error || data?.message || `Request failed (${response.status})`);
    }
    return data || {};
}

function showLogin() {
    $('auth-card')?.classList.remove('hidden');
    $('app-shell')?.classList.add('hidden');
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
}

function showApp(email) {
    $('auth-card')?.classList.add('hidden');
    $('app-shell')?.classList.remove('hidden');
    if ($('user-display')) $('user-display').textContent = email;
    if ($('header-user-email')) $('header-user-email').textContent = email;

    switchTab(currentTab || 'dashboard', false);
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refreshCurrentView, 3000);
    refreshCurrentView();
}

function toggleAuthMode() {
    isRegister = !isRegister;
    if ($('auth-title')) $('auth-title').textContent = isRegister ? 'Create your account' : 'Login';
    if ($('auth-eyebrow')) $('auth-eyebrow').textContent = isRegister ? 'CREATE ACCOUNT' : 'WELCOME BACK';
    if ($('auth-btn')) $('auth-btn').textContent = isRegister ? 'Create Account' : 'Login';
    if ($('auth-toggle')) $('auth-toggle').textContent = isRegister ? 'Already have an account? Sign in' : 'Need an account? Register';
    if ($('auth-error')) $('auth-error').textContent = '';
}

async function handleAuth() {
    const email = $('email')?.value.trim();
    const password = $('password')?.value || '';
    const button = $('auth-btn');
    if ($('auth-error')) $('auth-error').textContent = '';
    if (!email || !password) {
        if ($('auth-error')) $('auth-error').textContent = 'Please enter your email and password.';
        return;
    }

    if (button) { button.disabled = true; button.textContent = isRegister ? 'Creating account…' : 'Signing in…'; }
    try {
        const data = await apiFetch(isRegister ? '/v1/auth/register' : '/v1/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        if (isRegister) {
            isRegister = false;
            if ($('auth-title')) $('auth-title').textContent = 'Login';
            if ($('auth-eyebrow')) $('auth-eyebrow').textContent = 'WELCOME BACK';
            if ($('auth-btn')) $('auth-btn').textContent = 'Login';
            if ($('auth-toggle')) $('auth-toggle').textContent = 'Need an account? Register';
            if ($('password')) $('password').value = '';
            if ($('auth-error')) $('auth-error').textContent = 'Registration successful. You can now sign in.';
            return;
        }
        const accessToken = data.access_token || data.token;
        if (!accessToken) throw new Error('The server did not return an access token.');
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('user_email', email);
        showApp(email);
    } catch (error) {
        console.error('Authentication error:', error);
        if ($('auth-error')) $('auth-error').textContent = error.message || 'Authentication failed.';
    } finally {
        if (button) { button.disabled = false; button.textContent = isRegister ? 'Create Account' : 'Login'; }
    }
}

async function logout() {
    try { if (token()) await apiFetch('/v1/auth/logout', { method: 'POST' }); } catch (_) {}
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_email');
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    showLogin();
}

function switchTab(tabName, refresh = true) {
    currentTab = tabName;
    document.querySelectorAll('.tab-view').forEach(v => v.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    $(`view-${tabName}`)?.classList.remove('hidden');
    $(`tab-${tabName}`)?.classList.add('active');
    closeMobileMenu();
    if (refresh) refreshCurrentView();
}

async function refreshCurrentView() {
    if (!token()) return;
    try {
        if (currentTab === 'dashboard') await fetchAccountData();
        else if (currentTab === 'signals') await fetchSignals();
        else if (currentTab === 'journal') await fetchJournal();
        else if (currentTab === 'profile') await Promise.all([fetchAccountData(), fetchDevices()]);
    } catch (error) {
        console.error(`Failed to refresh ${currentTab}:`, error);
        showPageError(currentTab, error.message);
    }
}

function showPageError(page, message) {
    const target = page === 'signals' ? $('signals-container') : page === 'journal' ? $('journal-list-container') : null;
    if (target) target.innerHTML = `<div class="empty-state glass error-state">Unable to load this page.<small>${safe(message)}</small></div>`;
}

function clearAccountViews(message = 'Waiting for live MT5 data…') {
    lastQuotes = {};
    selectedSymbol = null;
    if ($('conn-status')) { $('conn-status').textContent = 'NO DEVICE'; $('conn-status').className = 'status-tag status-wait'; }
    ['val-balance','val-equity','val-broker','val-account'].forEach(id => { if ($(id)) $(id).textContent = '—'; });
    if ($('last-update')) $('last-update').textContent = 'Never';
    if ($('watchlist-container')) $('watchlist-container').innerHTML = `<div class="empty-state">${safe(message)}</div>`;
    if ($('chart-symbols')) $('chart-symbols').innerHTML = '';
    if ($('chart-symbol-title')) $('chart-symbol-title').textContent = 'Market monitor';
    if ($('chart-price')) $('chart-price').textContent = '—';
    if ($('chart-empty')) { $('chart-empty').textContent = message; $('chart-empty').classList.remove('hidden'); }
    setChartStatus('WAITING');
    drawPriceChart();
}

async function fetchAccountData() {
    const data = await apiFetch('/v1/account');
    const status = data.status;
    if (status === 'NO_DEVICE_SNAPSHOT' || !data.snapshot) {
        clearAccountViews(status === 'NO_DEVICE_SNAPSHOT' ? 'No MT5 connector snapshot is available.' : 'Waiting for live MT5 data…');
        return;
    }

    const snapshot = data.snapshot || {};
    const mt5 = snapshot.mt5 || {};
    const account = mt5.account || snapshot.account || {};
    const quotes = mt5.quotes && typeof mt5.quotes === 'object' ? mt5.quotes : {};
    const currency = account.currency || '';

    if ($('conn-status')) { $('conn-status').textContent = 'CONNECTED'; $('conn-status').className = 'status-tag status-live'; }
    if ($('last-update')) $('last-update').textContent = new Date().toLocaleTimeString();
    updateAccountValues(account, currency);
    lastQuotes = quotes;
    renderWatchlist(quotes);
    updateChartSymbols(quotes);
    renderPositions(Array.isArray(mt5.positions) ? mt5.positions : []);
    renderOrders(Array.isArray(mt5.orders) ? mt5.orders : []);
    renderHistoryAndAnalytics(Array.isArray(mt5.history?.deals) ? mt5.history.deals : [], currency);
}

function updateAccountValues(account, currency) {
    const money = value => `${formatNumber(value)}${currency ? ` ${safe(currency)}` : ''}`;
    if ($('val-balance')) $('val-balance').innerHTML = money(account.balance);
    if ($('val-equity')) $('val-equity').innerHTML = money(account.equity);
    if ($('val-broker')) $('val-broker').textContent = account.company || account.broker || '—';
    if ($('val-account')) $('val-account').textContent = account.login ?? account.account_number ?? '—';
}

function renderWatchlist(quotes) {
    const container = $('watchlist-container');
    if (!container) return;
    const symbols = Object.keys(quotes || {});
    if (!symbols.length) {
        container.innerHTML = '<div class="empty-state">No market quotes available.</div>';
        setChartStatus('WAITING');
        return;
    }
    if (!selectedSymbol || !quotes[selectedSymbol]) selectedSymbol = symbols[0];

    container.innerHTML = symbols.map(symbol => {
        const q = quotes[symbol] || {};
        const bid = Number(q.bid), ask = Number(q.ask);
        const live = q.live !== false && (Number.isFinite(bid) || Number.isFinite(ask));
        const digits = Number.isFinite(Number(q.digits)) ? Number(q.digits) : 5;
        const spread = Number(q.spread);
        return `<button class="quote-card${symbol === selectedSymbol ? ' selected' : ''}" type="button" onclick="selectChartSymbol('${escapeAttr(symbol)}')">
            <div class="quote-card-top"><strong>${safe(symbol)}</strong><span class="quote-live ${live ? '' : 'offline'}"><span class="dot ${live ? 'dot-live' : 'dot-offline'}"></span>${live ? 'LIVE' : 'OFFLINE'}</span></div>
            ${live ? `<div class="quote-prices"><div><span>Bid</span><b>${formatPrice(bid, digits)}</b></div><div><span>Ask</span><b>${formatPrice(ask, digits)}</b></div></div><div class="quote-foot"><span>Spread</span><b>${Number.isFinite(spread) ? formatPrice(spread, Math.min(digits, 5)) : '—'}</b></div>` : '<div class="quote-offline">No live price</div>'}
        </button>`;
    }).join('');
}

function updateChartSymbols(quotes) {
    const holder = $('chart-symbols');
    if (!holder) return;
    const symbols = Object.keys(quotes || {});
    if (!symbols.length) { holder.innerHTML = ''; return; }
    if (!selectedSymbol || !quotes[selectedSymbol]) selectedSymbol = symbols[0];
    holder.innerHTML = symbols.map(symbol => `<button type="button" class="symbol-pill ${symbol === selectedSymbol ? 'active' : ''}" onclick="selectChartSymbol('${escapeAttr(symbol)}')">${safe(symbol)}</button>`).join('');
    updateChartForQuote(selectedSymbol, quotes[selectedSymbol]);
}

function selectChartSymbol(symbol) {
    if (!lastQuotes[symbol]) return;
    selectedSymbol = symbol;
    renderWatchlist(lastQuotes);
    updateChartSymbols(lastQuotes);
}

function updateChartForQuote(symbol, quote) {
    if (!symbol || !quote) return;
    const bid = Number(quote.bid);
    const ask = Number(quote.ask);
    const price = Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2 : Number.isFinite(bid) ? bid : ask;
    const live = quote.live !== false && Number.isFinite(price);

    if (!live) {
        setChartStatus('WAITING');
        if ($('chart-price')) $('chart-price').textContent = '—';
        if ($('chart-empty')) { $('chart-empty').textContent = 'Waiting for a live MT5 quote…'; $('chart-empty').classList.remove('hidden'); }
        drawPriceChart();
        return;
    }

    if (!chartHistory[symbol]) chartHistory[symbol] = [];
    const history = chartHistory[symbol];
    const now = Date.now();
    const last = history[history.length - 1];
    if (!last || last.price !== price || now - last.time >= 3000) history.push({ time: now, price });
    while (history.length > CHART_MAX_POINTS) history.shift();

    if ($('chart-symbol-title')) $('chart-symbol-title').textContent = symbol;
    if ($('chart-price')) $('chart-price').textContent = formatPrice(price, quote.digits);
    if ($('chart-empty')) $('chart-empty').classList.toggle('hidden', history.length > 0);
    setChartStatus('LIVE');
    drawPriceChart();
}

function setChartStatus(status) {
    const el = $('chart-status');
    if (!el) return;
    el.textContent = status;
    el.className = `status-tag ${status === 'LIVE' ? 'status-live' : 'status-wait'}`;
}

function drawPriceChart() {
    const canvas = $('price-chart');
    if (!canvas) return;
    const wrap = canvas.parentElement;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const width = Math.max(300, Math.floor(rect.width || 300));
    const height = Math.max(220, Math.floor(rect.height || 260));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawChartGrid(ctx, width, height);

    const data = selectedSymbol ? (chartHistory[selectedSymbol] || []) : [];
    if (!data.length) return;

    const values = data.map(p => p.price).filter(Number.isFinite);
    if (!values.length) return;
    let min = Math.min(...values), max = Math.max(...values);
    let range = max - min;
    const center = (max + min) / 2;
    if (!range) range = Math.max(Math.abs(center) * 0.0002, 0.00001);
    min = center - range * 0.65;
    max = center + range * 0.65;

    const pad = { left: 14, right: 14, top: 20, bottom: 22 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const point = (p, i) => ({
        x: pad.left + (i / Math.max(1, data.length - 1)) * plotW,
        y: pad.top + (1 - (p.price - min) / (max - min)) * plotH
    });
    const points = data.map(point);

    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#1677ff';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    if (points.length > 1) {
        const gradient = ctx.createLinearGradient(0, pad.top, 0, height);
        gradient.addColorStop(0, 'rgba(22,119,255,0.20)');
        gradient.addColorStop(1, 'rgba(22,119,255,0.00)');
        ctx.beginPath();
        points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, height - pad.bottom);
        ctx.lineTo(points[0].x, height - pad.bottom);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
    }

    const lastPoint = points[points.length - 1];
    ctx.beginPath(); ctx.arc(lastPoint.x, lastPoint.y, 4, 0, Math.PI * 2); ctx.fillStyle = '#1677ff'; ctx.fill();
    ctx.beginPath(); ctx.arc(lastPoint.x, lastPoint.y, 8, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(22,119,255,0.20)'; ctx.lineWidth = 3; ctx.stroke();
}

function drawChartGrid(ctx, width, height) {
    ctx.strokeStyle = 'rgba(110,125,150,0.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
        const y = height * i / 5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
}

function renderPositions(positions) {
    if ($('pos-count')) $('pos-count').textContent = positions.length;
    const body = $('pos-table-body'); if (!body) return;
    body.innerHTML = positions.length ? positions.map(p => {
        const type = normalizeDirection(p.type);
        return `<tr><td>${safe(p.ticket)}</td><td class="symbol-cell">${safe(p.symbol)}</td><td class="${type === 'BUY' ? 'buy' : type === 'SELL' ? 'sell' : ''}">${safe(type)}</td><td>${formatNumber(p.volume)}</td><td>${safe(p.price_open ?? p.price)}</td><td class="${Number(p.profit) >= 0 ? 'profit-pos' : 'profit-neg'}">${formatNumber(p.profit)}</td></tr>`;
    }).join('') : emptyRow(6, 'No open positions');
}

function renderOrders(orders) {
    if ($('orders-count')) $('orders-count').textContent = orders.length;
    const body = $('orders-table-body'); if (!body) return;
    body.innerHTML = orders.length ? orders.map(o => `<tr><td>${safe(o.ticket)}</td><td class="symbol-cell">${safe(o.symbol)}</td><td>${safe(normalizeDirection(o.type))}</td><td>${formatNumber(o.volume_initial ?? o.volume ?? o.lots)}</td><td>${safe(o.price_open ?? o.price)}</td></tr>`).join('') : emptyRow(5, 'No pending orders');
}

function renderHistoryAndAnalytics(deals, currency) {
    if ($('history-count')) $('history-count').textContent = deals.length;
    const body = $('history-table-body'); if (!body) return;
    if (!deals.length) {
        body.innerHTML = emptyRow(7, 'No closed deals');
        $('analytics-trades').textContent = '0'; $('analytics-pl').textContent = `0.00${currency ? ` ${currency}` : ''}`; $('analytics-winrate').textContent = '0%'; $('analytics-pf').textContent = '0.00';
        return;
    }
    let totalPL = 0, wins = 0, grossProfit = 0, grossLoss = 0;
    body.innerHTML = deals.map(d => {
        const profit = Number(d.profit || 0); totalPL += profit;
        if (profit > 0) { wins++; grossProfit += profit; } else if (profit < 0) grossLoss += Math.abs(profit);
        return `<tr><td>${safe(d.ticket)}</td><td class="symbol-cell">${safe(d.symbol)}</td><td>${safe(normalizeDirection(d.type))}</td><td>${formatNumber(d.volume)}</td><td>${safe(d.price)}</td><td>${formatTime(d.time)}</td><td class="${profit >= 0 ? 'profit-pos' : 'profit-neg'}">${profit.toFixed(2)}${currency ? ` ${safe(currency)}` : ''}</td></tr>`;
    }).join('');
    $('analytics-trades').textContent = deals.length;
    $('analytics-pl').textContent = `${totalPL.toFixed(2)}${currency ? ` ${currency}` : ''}`;
    $('analytics-winrate').textContent = `${(wins / deals.length * 100).toFixed(1)}%`;
    $('analytics-pf').textContent = grossLoss ? (grossProfit / grossLoss).toFixed(2) : grossProfit ? 'INF' : '0.00';
}

function normalizeDirection(value) {
    if (typeof value === 'number') return value === 0 ? 'BUY' : value === 1 ? 'SELL' : String(value);
    const s = String(value ?? '').toUpperCase();
    if (s.includes('BUY')) return 'BUY';
    if (s.includes('SELL')) return 'SELL';
    return s || '—';
}

function formatTime(value) {
    if (value == null || value === '') return '—';
    const n = Number(value);
    const date = Number.isFinite(n) ? new Date(n < 100000000000 ? n * 1000 : n) : new Date(value);
    return Number.isNaN(date.getTime()) ? safe(value) : date.toLocaleString();
}

async function fetchSignals() {
    const container = $('signals-container'); if (!container) return;
    try {
        const data = await apiFetch('/v1/signals');
        const raw = data.signals ?? data.data ?? [];
        const signals = Array.isArray(raw) ? raw : Object.values(raw || {});
        if (!signals.length) {
            container.innerHTML = '<div class="empty-state glass">No active signals are available from the connected system.</div>';
            return;
        }
        container.innerHTML = signals.map(s => {
            const direction = normalizeDirection(s.type ?? s.direction ?? s.side);
            const strength = s.strength ?? s.confidence ?? '—';
            const entry = s.entry ?? s.entry_price ?? s.price;
            const sl = s.sl ?? s.stop_loss ?? s.stopLoss;
            const tp1 = s.tp1 ?? s.take_profit_1 ?? s.takeProfit1;
            const tp2 = s.tp2 ?? s.take_profit_2 ?? s.takeProfit2;
            return `<article class="signal-card glass"><div class="signal-header"><div class="signal-title"><span class="symbol-title">${safe(s.symbol)}</span><span class="direction ${direction === 'BUY' ? 'buy' : direction === 'SELL' ? 'sell' : ''}">${safe(direction)}</span></div><div class="signal-meta"><span class="timeframe-pill">${safe(s.timeframe ?? s.tf ?? '—')}</span><span class="status-tag status-live">${safe(strength)}</span></div></div><div class="signal-strategy"><span><b>Strategy</b> ${safe(s.strategy ?? s.setup ?? '—')}</span><span><b>Risk / reward</b> ${safe(s.rr ?? s.risk_reward ?? '—')}</span></div><div class="signal-levels"><div><span>Entry</span><strong>${safe(entry)}</strong></div><div><span>Stop loss</span><strong class="level-danger">${safe(sl)}</strong></div><div><span>Take profit 1</span><strong class="level-success">${safe(tp1)}</strong></div><div><span>Take profit 2</span><strong class="level-success">${safe(tp2)}</strong></div></div><div class="confluence"><b>Confluence</b><span>${safe(s.confluence ?? s.reason ?? '—')}</span></div><div class="read-only-note">Read-only market analysis</div></article>`;
        }).join('');
    } catch (error) {
        console.error('Signal refresh failed:', error);
        showPageError('signals', error.message);
    }
}

async function saveJournalEntry() {
    const ticket = $('journal-ticket')?.value.trim();
    const setupType = $('journal-setup')?.value.trim();
    const notes = $('journal-notes')?.value.trim();
    if (!ticket || !notes) { alert('Please enter a ticket number and notes.'); return; }
    try {
        const data = await apiFetch('/v1/journal/save', { method: 'POST', body: JSON.stringify({ ticket: Number(ticket), setup_type: setupType, notes }) });
        if (data.ok === false) throw new Error(data.error || 'Failed to save journal entry.');
        $('journal-ticket').value = ''; $('journal-setup').value = ''; $('journal-notes').value = '';
        await fetchJournal();
        alert('Journal entry saved.');
    } catch (error) { console.error('Journal save failed:', error); alert(error.message || 'Unable to save journal entry.'); }
}

async function fetchJournal() {
    const container = $('journal-list-container'); if (!container) return;
    try {
        const data = await apiFetch('/v1/journal');
        const raw = data.journal ?? data.entries ?? data.data ?? [];
        const entries = Array.isArray(raw) ? raw : Object.values(raw || {});
        if (!entries.length) { container.innerHTML = '<div class="empty-state">No journal activity is available yet.</div>'; return; }
        container.innerHTML = entries.map(e => {
            const profit = Number(e.profit);
            const direction = normalizeDirection(e.type ?? e.direction);
            return `<article class="journal-entry"><div class="journal-entry-top"><div><strong>${safe(e.symbol ?? 'Trade')}</strong><span class="direction ${direction === 'BUY' ? 'buy' : direction === 'SELL' ? 'sell' : 'neutral'}">${safe(direction)}</span><span class="entry-meta">Vol: ${safe(e.volume ?? '—')} · Ticket #${safe(e.ticket ?? '—')}</span></div><div class="entry-right"><b class="${Number.isFinite(profit) && profit < 0 ? 'profit-neg' : 'profit-pos'}">${Number.isFinite(profit) ? profit.toFixed(2) : '—'}</b><span>${formatTime(e.time ?? e.timestamp)}</span></div></div><div class="setup-line"><b>Setup</b> ${safe(e.setup_type ?? e.setup ?? '—')}${e.comment ? ` · ${safe(e.comment)}` : ''}</div><div class="notes-box">${safe(e.notes || 'No reflection recorded.')}</div></article>`;
        }).join('');
    } catch (error) { console.error('Journal refresh failed:', error); showPageError('journal', error.message); }
}

async function fetchDevices() {
    const body = $('devices-table-body'); if (!body) return;
    try {
        const data = await apiFetch('/v1/devices');
        const devices = Array.isArray(data.devices) ? data.devices : [];
        body.innerHTML = devices.length ? devices.map(d => `<tr><td><code>${safe(d.device_id)}</code></td><td>${formatTime(d.created)}</td><td>${d.last_seen ? formatTime(d.last_seen) : 'Never'}</td><td><span class="status-tag ${d.revoked ? 'status-revoked' : 'status-live'}">${d.revoked ? 'REVOKED' : 'ACTIVE'}</span></td><td>${!d.revoked ? `<button class="btn-danger" onclick="revokeDevice('${escapeAttr(d.device_id)}')">Revoke</button>` : '—'}</td></tr>`).join('') : emptyRow(5, 'No devices paired');
    } catch (error) { console.error('Device refresh failed:', error); body.innerHTML = emptyRow(5, `Unable to load devices: ${error.message}`); }
}

async function revokeDevice(deviceId) {
    if (!deviceId || !confirm(`Revoke device ${deviceId}?`)) return;
    try { await apiFetch('/v1/device/revoke', { method: 'POST', body: JSON.stringify({ device_id: deviceId }) }); await fetchDevices(); }
    catch (error) { alert(error.message || 'Unable to revoke device.'); }
}

async function createPairingCode() {
    const display = $('pairing-code-display'); if (!display) return;
    display.textContent = 'Generating…';
    try {
        const data = await apiFetch('/v1/pairing/create', { method: 'POST' });
        const code = data.code ?? data.pairing_code ?? data.pairingCode;
        if (!code) throw new Error('The server did not return a pairing code.');
        display.innerHTML = `<span>Pairing code</span><strong>${safe(code)}</strong>`;
    } catch (error) { display.textContent = error.message || 'Unable to generate pairing code.'; }
}

function emptyRow(colspan, message) { return `<tr><td colspan="${colspan}"><div class="table-empty">${safe(message)}</div></td></tr>`; }

function setupNavigation() {
    const menuToggle = $('menu-toggle');
    const navigation = $('main-navigation');
    if (menuToggle && navigation) {
        menuToggle.addEventListener('click', () => {
            const open = navigation.classList.toggle('open');
            menuToggle.classList.toggle('open', open);
            menuToggle.setAttribute('aria-expanded', String(open));
            menuToggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
        });
    }
    window.addEventListener('resize', () => { if (window.innerWidth > 820) closeMobileMenu(); drawPriceChart(); });
}

function closeMobileMenu() {
    const menuToggle = $('menu-toggle');
    const navigation = $('main-navigation');
    if (!menuToggle || !navigation) return;
    navigation.classList.remove('open');
    menuToggle.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open navigation menu');
}

function setupChartResize() {
    if ('ResizeObserver' in window) {
        const wrap = document.querySelector('.chart-wrap');
        if (wrap) new ResizeObserver(() => drawPriceChart()).observe(wrap);
    }
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch(error => console.error('Service worker registration failed:', error)));
}
