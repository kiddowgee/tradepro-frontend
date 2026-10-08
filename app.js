const API_URL = 'https://api.tradeassist.online';

let isRegister = false;
let pollTimer = null;
let currentTab = 'dashboard';

const chartHistory = {};
const CHART_MAX_POINTS = 100;

let selectedSymbol = null;
let lastQuotes = {};


/* =========================================================
   HELPERS
========================================================= */

function safe(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getToken() {
    return localStorage.getItem('access_token');
}

function getUserEmail() {
    return localStorage.getItem('user_email') || '';
}

function authHeaders() {
    const token = getToken();

    return token
        ? {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
        : {
            'Content-Type': 'application/json'
        };
}

async function apiFetch(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            ...authHeaders(),
            ...(options.headers || {})
        }
    });

    if (response.status === 401) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('user_email');

        showLogin();

        throw new Error('Your session has expired. Please sign in again.');
    }

    let data = null;

    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        throw new Error(
            data?.detail ||
            data?.message ||
            `Request failed (${response.status})`
        );
    }

    return data;
}

function formatNumber(value) {
    if (
        value === null ||
        value === undefined ||
        value === ''
    ) {
        return '—';
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return safe(value);
    }

    return number.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatQuote(value, digits) {
    if (
        value === null ||
        value === undefined ||
        value === ''
    ) {
        return '—';
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return safe(value);
    }

    let places = Number(digits);

    if (!Number.isFinite(places)) {
        places = 5;
    }

    places = Math.max(0, Math.min(places, 8));

    return number.toLocaleString(undefined, {
        minimumFractionDigits: places,
        maximumFractionDigits: places
    });
}


/* =========================================================
   AUTHENTICATION
========================================================= */

function showLogin() {
    const authCard = document.getElementById('auth-card');
    const appShell = document.getElementById('app-shell');

    if (authCard) {
        authCard.classList.remove('hidden');
    }

    if (appShell) {
        appShell.classList.add('hidden');
    }

    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

function showApp() {
    const authCard = document.getElementById('auth-card');
    const appShell = document.getElementById('app-shell');

    if (authCard) {
        authCard.classList.add('hidden');
    }

    if (appShell) {
        appShell.classList.remove('hidden');
    }

    const email = getUserEmail();

    const userDisplay =
        document.getElementById('user-display');

    const headerEmail =
        document.getElementById('header-user-email');

    if (userDisplay) {
        userDisplay.textContent =
            email || 'Account';
    }

    if (headerEmail) {
        headerEmail.textContent =
            email || 'Account';
    }

    switchTab(currentTab);

    if (pollTimer) {
        clearInterval(pollTimer);
    }

    pollTimer = setInterval(() => {
        refreshCurrentView();
    }, 3000);

    refreshCurrentView();
}

function toggleAuthMode() {
    isRegister = !isRegister;

    const title =
        document.getElementById('auth-title');

    const eyebrow =
        document.getElementById('auth-eyebrow');

    const button =
        document.getElementById('auth-btn');

    const toggle =
        document.getElementById('auth-toggle');

    const password =
        document.getElementById('password');

    const error =
        document.getElementById('auth-error');

    if (isRegister) {
        if (eyebrow) {
            eyebrow.textContent = 'CREATE ACCOUNT';
        }

        if (title) {
            title.textContent = 'Create your account';
        }

        if (button) {
            button.textContent = 'Create Account';
        }

        if (toggle) {
            toggle.textContent =
                'Already have an account? Sign in';
        }

        if (password) {
            password.autocomplete = 'new-password';
        }
    } else {
        if (eyebrow) {
            eyebrow.textContent = 'WELCOME BACK';
        }

        if (title) {
            title.textContent = 'Login';
        }

        if (button) {
            button.textContent = 'Login';
        }

        if (toggle) {
            toggle.textContent =
                'Need an account? Register';
        }

        if (password) {
            password.autocomplete = 'current-password';
        }
    }

    if (error) {
        error.textContent = '';
    }
}

function showAuthError(message) {
    const error =
        document.getElementById('auth-error');

    if (error) {
        error.textContent = message;
    }
}

async function handleAuth() {
    const emailInput =
        document.getElementById('email');

    const passwordInput =
        document.getElementById('password');

    const button =
        document.getElementById('auth-btn');

    const email =
        emailInput?.value.trim();

    const password =
        passwordInput?.value || '';

    showAuthError('');

    if (!email || !password) {
        showAuthError(
            'Please enter your email and password.'
        );
        return;
    }

    if (button) {
        button.disabled = true;
        button.textContent =
            isRegister
                ? 'Creating account...'
                : 'Signing in...';
    }

    try {
        const endpoint =
            isRegister
                ? '/v1/auth/register'
                : '/v1/auth/login';

        const data = await apiFetch(endpoint, {
            method: 'POST',
            body: JSON.stringify({
                email,
                password
            })
        });

        const token =
            data?.access_token ||
            data?.token;

        if (!token) {
            throw new Error(
                'The server did not return an access token.'
            );
        }

        localStorage.setItem(
            'access_token',
            token
        );

        localStorage.setItem(
            'user_email',
            email
        );

        showApp();

    } catch (error) {
        console.error('Authentication error:', error);

        showAuthError(
            error.message ||
            'Unable to sign in.'
        );

    } finally {
        if (button) {
            button.disabled = false;

            button.textContent =
                isRegister
                    ? 'Create Account'
                    : 'Login';
        }
    }
}

async function logout() {
    try {
        if (getToken()) {
            await apiFetch('/v1/auth/logout', {
                method: 'POST'
            });
        }
    } catch (error) {
        console.warn(
            'Logout API request failed:',
            error
        );
    }

    localStorage.removeItem('access_token');
    localStorage.removeItem('user_email');

    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }

    showLogin();

    const email =
        document.getElementById('email');

    const password =
        document.getElementById('password');

    if (email) {
        email.value = '';
    }

    if (password) {
        password.value = '';
    }
}


/* =========================================================
   NAVIGATION
========================================================= */

function switchTab(tabName) {
    currentTab = tabName;

    document
        .querySelectorAll('.tab-view')
        .forEach(view => {
            view.classList.add('hidden');
        });

    document
        .querySelectorAll('.nav-btn')
        .forEach(button => {
            button.classList.remove('active');
        });

    const view =
        document.getElementById(
            `view-${tabName}`
        );

    const button =
        document.getElementById(
            `tab-${tabName}`
        );

    if (view) {
        view.classList.remove('hidden');
    }

    if (button) {
        button.classList.add('active');
    }

    closeMobileMenu();

    refreshCurrentView();
}

async function refreshCurrentView() {
    if (!getToken()) {
        return;
    }

    try {
        if (currentTab === 'dashboard') {
            await fetchAccountData();
        }

        if (currentTab === 'signals') {
            await fetchSignals();
        }

        if (currentTab === 'journal') {
            await fetchJournal();
        }

        if (currentTab === 'profile') {
            await fetchDevices();
        }
    } catch (error) {
        console.error(
            `Failed to refresh ${currentTab}:`,
            error
        );
    }
}


/* =========================================================
   ACCOUNT DATA
========================================================= */

async function fetchAccountData() {
    const data =
        await apiFetch('/v1/account');

    if (!data) {
        return;
    }

    const snapshot =
        data.snapshot || {};

    const mt5 =
        snapshot.mt5 || {};

    const account =
        mt5.account || {};

    const quotes =
        mt5.quotes || {};

    const positions =
        Array.isArray(mt5.positions)
            ? mt5.positions
            : [];

    const orders =
        Array.isArray(mt5.orders)
            ? mt5.orders
            : [];

    const history =
        Array.isArray(mt5.history?.deals)
            ? mt5.history.deals
            : [];

    lastQuotes = quotes;

    updateAccountValues(account);

    renderWatchlist(quotes);

    renderPositions(positions);

    renderOrders(orders);

    renderHistory(history);

    renderAnalytics(history);

    updateChartSymbols(quotes);

    if (
        selectedSymbol &&
        quotes[selectedSymbol]
    ) {
        updateChartForQuote(
            selectedSymbol,
            quotes[selectedSymbol]
        );
    }

    updateConnectionStatus(
        snapshot,
        mt5
    );
}

function updateAccountValues(account) {
    const balance =
        document.getElementById(
            'val-balance'
        );

    const equity =
        document.getElementById(
            'val-equity'
        );

    const broker =
        document.getElementById(
            'val-broker'
        );

    const accountNumber =
        document.getElementById(
            'val-account'
        );

    const lastUpdate =
        document.getElementById(
            'last-update'
        );

    if (balance) {
        balance.textContent =
            formatNumber(account.balance);
    }

    if (equity) {
        equity.textContent =
            formatNumber(account.equity);
    }

    if (broker) {
        broker.textContent =
            account.broker ||
            account.company ||
            'MT5';
    }

    if (accountNumber) {
        accountNumber.textContent =
            account.login ||
            account.account ||
            account.account_number ||
            '—';
    }

    if (lastUpdate) {
        lastUpdate.textContent =
            new Date().toLocaleTimeString();
    }
}

function updateConnectionStatus(
    snapshot,
    mt5
) {
    const status =
        document.getElementById(
            'conn-status'
        );

    if (!status) {
        return;
    }

    const connected =
        snapshot.connected ??
        mt5.connected ??
        snapshot.live ??
        true;

    if (connected) {
        status.textContent =
            'MT5 Connected';

        status.className =
            'status-tag status-success';
    } else {
        status.textContent =
            'MT5 Offline';

        status.className =
            'status-tag status-revoked';
    }
}


/* =========================================================
   WATCHLIST
========================================================= */

function renderWatchlist(quotes) {
    const container =
        document.getElementById(
            'watchlist-container'
        );

    if (!container) {
        return;
    }

    const symbols =
        Object.keys(quotes || {});

    if (!symbols.length) {
        container.innerHTML = `
            <div class="empty-state">
                No active market quotes available.
            </div>
        `;

        return;
    }

    container.innerHTML =
        symbols.map(symbol => {

            const quote =
                quotes[symbol] || {};

            const live =
                quote.live !== false;

            const selected =
                selectedSymbol === symbol
                    ? ' selected'
                    : '';

            if (!live) {
                return `
                    <button
                        type="button"
                        class="quote-card${selected}"
                        data-symbol="${safe(symbol)}"
                        onclick="selectChartSymbol('${safe(symbol)}')"
                    >
                        <div class="quote-card-top">

                            <span class="quote-symbol">
                                ${safe(symbol)}
                            </span>

                            <span class="quote-offline">
                                OFFLINE
                            </span>

                        </div>

                        <div class="quote-offline-text">
                            Market data unavailable
                        </div>

                    </button>
                `;
            }

            const bid =
                quote.bid;

            const ask =
                quote.ask;

            const spread =
                quote.spread;

            const digits =
                Number.isFinite(
                    Number(quote.digits)
                )
                    ? Number(quote.digits)
                    : 5;

            return `
                <button
                    type="button"
                    class="quote-card${selected}"
                    data-symbol="${safe(symbol)}"
                    onclick="selectChartSymbol('${safe(symbol)}')"
                >

                    <div class="quote-card-top">

                        <span class="quote-symbol">
                            ${safe(symbol)}
                        </span>

                        <span class="quote-spread">
                            Spread:
                            ${formatQuote(
                                spread,
                                digits > 3 ? 1 : 2
                            )}
                        </span>

                    </div>


                    <div class="quote-prices">

                        <div>

                            <span class="quote-label">
                                Bid
                            </span>

                            <strong class="quote-bid">
                                ${formatQuote(
                                    bid,
                                    quote.digits
                                )}
                            </strong>

                        </div>


                        <div>

                            <span class="quote-label">
                                Ask
                            </span>

                            <strong class="quote-ask">
                                ${formatQuote(
                                    ask,
                                    quote.digits
                                )}
                            </strong>

                        </div>

                    </div>

                </button>
            `;
        }).join('');
}

function updateChartSymbols(quotes) {
    const container =
        document.getElementById(
            'chart-symbols'
        );

    const title =
        document.getElementById(
            'chart-symbol-title'
        );

    if (!container) {
        return;
    }

    const symbols =
        Object.keys(quotes || {});

    if (!symbols.length) {
        container.innerHTML = '';
        selectedSymbol = null;

        if (title) {
            title.textContent =
                'Market monitor';
        }

        setChartStatus('Waiting');

        return;
    }

    if (
        !selectedSymbol ||
        !quotes[selectedSymbol]
    ) {
        selectedSymbol =
            symbols[0];
    }

    if (title) {
        title.textContent =
            selectedSymbol;
    }

    container.innerHTML =
        symbols.map(symbol => `
            <button
                type="button"
                class="symbol-pill ${
                    symbol === selectedSymbol
                        ? 'active'
                        : ''
                }"
                onclick="selectChartSymbol('${safe(symbol)}')"
            >
                ${safe(symbol)}
            </button>
        `).join('');
}

function selectChartSymbol(symbol) {
    if (!lastQuotes[symbol]) {
        return;
    }

    selectedSymbol =
        symbol;

    updateChartSymbols(
        lastQuotes
    );

    document
        .querySelectorAll('.quote-card')
        .forEach(card => {
            card.classList.toggle(
                'selected',
                card.dataset.symbol === symbol
            );
        });

    updateChartForQuote(
        symbol,
        lastQuotes[symbol]
    );
}


/* =========================================================
   LIVE PRICE CHART
========================================================= */

function updateChartForQuote(
    symbol,
    quote
) {
    if (!quote) {
        return;
    }

    const bid =
        Number(quote.bid);

    const ask =
        Number(quote.ask);

    if (
        !Number.isFinite(bid) &&
        !Number.isFinite(ask)
    ) {
        setChartStatus(
            'No live price'
        );

        return;
    }

    let price;

    if (
        Number.isFinite(bid) &&
        Number.isFinite(ask)
    ) {
        price =
            (bid + ask) / 2;
    } else if (
        Number.isFinite(bid)
    ) {
        price = bid;
    } else {
        price = ask;
    }

    if (!chartHistory[symbol]) {
        chartHistory[symbol] = [];
    }

    const history =
        chartHistory[symbol];

    const now =
        Date.now();

    const previous =
        history[
            history.length - 1
        ];

    if (
        !previous ||
        previous.price !== price
    ) {
        history.push({
            time: now,
            price
        });
    }

    while (
        history.length >
        CHART_MAX_POINTS
    ) {
        history.shift();
    }

    const chartPrice =
        document.getElementById(
            'chart-price'
        );

    if (chartPrice) {
        chartPrice.textContent =
            formatQuote(
                price,
                quote.digits
            );
    }

    setChartStatus(
        'Live · Read-only'
    );

    const empty =
        document.getElementById(
            'chart-empty'
        );

    if (empty) {
        empty.classList.toggle(
            'hidden',
            history.length > 0
        );
    }

    drawPriceChart(symbol);
}

function setChartStatus(text) {
    const status =
        document.getElementById(
            'chart-status'
        );

    if (status) {
        status.textContent =
            text;

        status.className =
            'status-tag status-success';
    }
}

function drawPriceChart(symbol) {
    const canvas =
        document.getElementById(
            'price-chart'
        );

    if (!canvas) {
        return;
    }

    const wrapper =
        canvas.parentElement;

    const width =
        Math.max(
            wrapper?.clientWidth || 700,
            300
        );

    const height =
        Math.max(
            wrapper?.clientHeight || 320,
            240
        );

    const ratio =
        window.devicePixelRatio || 1;

    canvas.width =
        width * ratio;

    canvas.height =
        height * ratio;

    canvas.style.width =
        `${width}px`;

    canvas.style.height =
        `${height}px`;

    const ctx =
        canvas.getContext('2d');

    if (!ctx) {
        return;
    }

    ctx.setTransform(
        ratio,
        0,
        0,
        ratio,
        0,
        0
    );

    ctx.clearRect(
        0,
        0,
        width,
        height
    );

    drawChartGrid(
        ctx,
        width,
        height
    );

    const history =
        chartHistory[symbol] || [];

    if (history.length < 2) {
        return;
    }

    const prices =
        history.map(
            point => point.price
        );

    let min =
        Math.min(...prices);

    let max =
        Math.max(...prices);

    if (min === max) {
        const padding =
            Math.abs(min) *
                0.0001 ||
            0.0001;

        min -= padding;
        max += padding;
    }

    const range =
        max - min;

    const paddingLeft = 52;
    const paddingRight = 24;
    const paddingTop = 24;
    const paddingBottom = 32;

    const plotWidth =
        width -
        paddingLeft -
        paddingRight;

    const plotHeight =
        height -
        paddingTop -
        paddingBottom;

    const points =
        history.map(
            (point, index) => {

                const x =
                    paddingLeft +
                    (
                        index /
                        (history.length - 1)
                    ) *
                    plotWidth;

                const y =
                    paddingTop +
                    (
                        1 -
                        (
                            point.price -
                            min
                        ) /
                        range
                    ) *
                    plotHeight;

                return {
                    x,
                    y,
                    price: point.price
                };
            }
        );

    const gradient =
        ctx.createLinearGradient(
            0,
            paddingTop,
            0,
            height
        );

    gradient.addColorStop(
        0,
        'rgba(22,119,255,0.18)'
    );

    gradient.addColorStop(
        1,
        'rgba(22,119,255,0)'
    );

    ctx.beginPath();

    ctx.moveTo(
        points[0].x,
        height - paddingBottom
    );

    points.forEach(point => {
        ctx.lineTo(
            point.x,
            point.y
        );
    });

    ctx.lineTo(
        points[
            points.length - 1
        ].x,
        height - paddingBottom
    );

    ctx.closePath();

    ctx.fillStyle =
        gradient;

    ctx.fill();


    ctx.beginPath();

    points.forEach(
        (point, index) => {

            if (index === 0) {
                ctx.moveTo(
                    point.x,
                    point.y
                );
            } else {
                ctx.lineTo(
                    point.x,
                    point.y
                );
            }
        }
    );

    ctx.strokeStyle =
        '#1677ff';

    ctx.lineWidth =
        2.5;

    ctx.lineJoin =
        'round';

    ctx.lineCap =
        'round';

    ctx.stroke();


    const last =
        points[
            points.length - 1
        ];

    ctx.beginPath();

    ctx.arc(
        last.x,
        last.y,
        4,
        0,
        Math.PI * 2
    );

    ctx.fillStyle =
        '#1677ff';

    ctx.fill();


    ctx.beginPath();

    ctx.arc(
        last.x,
        last.y,
        7,
        0,
        Math.PI * 2
    );

    ctx.strokeStyle =
        'rgba(22,119,255,0.22)';

    ctx.lineWidth =
        2;

    ctx.stroke();


    ctx.fillStyle =
        '#172033';

    ctx.font =
        '600 12px system-ui, sans-serif';

    ctx.textAlign =
        'right';

    ctx.textBaseline =
        'middle';

    ctx.fillText(
        formatQuote(last.price),
        width - 10,
        last.y
    );
}

function drawChartGrid(
    ctx,
    width,
    height
) {
    const paddingLeft = 52;
    const paddingRight = 24;
    const paddingTop = 24;
    const paddingBottom = 32;

    const rows = 5;
    const columns = 6;

    ctx.strokeStyle =
        'rgba(23,32,51,0.07)';

    ctx.lineWidth = 1;

    for (
        let i = 0;
        i <= rows;
        i++
    ) {
        const y =
            paddingTop +
            (
                i / rows
            ) *
            (
                height -
                paddingTop -
                paddingBottom
            );

        ctx.beginPath();

        ctx.moveTo(
            paddingLeft,
            y
        );

        ctx.lineTo(
            width - paddingRight,
            y
        );

        ctx.stroke();
    }

    for (
        let i = 0;
        i <= columns;
        i++
    ) {
        const x =
            paddingLeft +
            (
                i / columns
            ) *
            (
                width -
                paddingLeft -
                paddingRight
            );

        ctx.beginPath();

        ctx.moveTo(
            x,
            paddingTop
        );

        ctx.lineTo(
            x,
            height -
            paddingBottom
        );

        ctx.stroke();
    }
}


/* =========================================================
   POSITIONS
========================================================= */

function renderPositions(
    positions
) {
    const body =
        document.getElementById(
            'pos-table-body'
        );

    const count =
        document.getElementById(
            'pos-count'
        );

    if (count) {
        count.textContent =
            positions.length;
    }

    if (!body) {
        return;
    }

    if (!positions.length) {
        body.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="table-empty">
                        No open positions.
                    </div>
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML =
        positions.map(position => {

            const type =
                String(
                    position.type ??
                    position.side ??
                    ''
                ).toUpperCase();

            const isBuy =
                type.includes('BUY');

            const profit =
                Number(
                    position.profit ??
                    position.pnl ??
                    0
                );

            return `
                <tr>

                    <td>
                        ${safe(
                            position.ticket ??
                            position.id ??
                            '—'
                        )}
                    </td>

                    <td>
                        ${safe(
                            position.symbol ??
                            '—'
                        )}
                    </td>

                    <td>
                        <span class="${
                            isBuy
                                ? 'buy'
                                : 'sell'
                        }">
                            ${isBuy
                                ? 'BUY'
                                : 'SELL'}
                        </span>
                    </td>

                    <td>
                        ${formatNumber(
                            position.volume ??
                            position.lots
                        )}
                    </td>

                    <td>
                        ${formatNumber(
                            position.price_open ??
                            position.open_price
                        )}
                    </td>

                    <td class="${
                        profit >= 0
                            ? 'profit-pos'
                            : 'profit-neg'
                    }">
                        ${formatNumber(
                            profit
                        )}
                    </td>

                </tr>
            `;
        }).join('');
}


/* =========================================================
   ORDERS
========================================================= */

function renderOrders(
    orders
) {
    const body =
        document.getElementById(
            'orders-table-body'
        );

    const count =
        document.getElementById(
            'orders-count'
        );

    if (count) {
        count.textContent =
            orders.length;
    }

    if (!body) {
        return;
    }

    if (!orders.length) {
        body.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="table-empty">
                        No pending orders.
                    </div>
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML =
        orders.map(order => {

            const type =
                String(
                    order.type ??
                    order.side ??
                    ''
                ).toUpperCase();

            const isBuy =
                type.includes('BUY');

            return `
                <tr>

                    <td>
                        ${safe(
                            order.ticket ??
                            order.id ??
                            '—'
                        )}
                    </td>

                    <td>
                        ${safe(
                            order.symbol ??
                            '—'
                        )}
                    </td>

                    <td>
                        <span class="${
                            isBuy
                                ? 'buy'
                                : 'sell'
                        }">
                            ${safe(
                                type || '—'
                            )}
                        </span>
                    </td>

                    <td>
                        ${formatNumber(
                            order.volume ??
                            order.lots
                        )}
                    </td>

                    <td>
                        ${formatNumber(
                            order.price_open ??
                            order.price
                        )}
                    </td>

                </tr>
            `;
        }).join('');
}


/* =========================================================
   HISTORY
========================================================= */

function renderHistory(
    history
) {
    const body =
        document.getElementById(
            'history-table-body'
        );

    const count =
        document.getElementById(
            'history-count'
        );

    if (count) {
        count.textContent =
            history.length;
    }

    if (!body) {
        return;
    }

    if (!history.length) {
        body.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="table-empty">
                        No closed deals.
                    </div>
                </td>
            </tr>
        `;

        return;
    }

    const recent =
        [...history].reverse();

    body.innerHTML =
        recent.map(deal => {

            const type =
                String(
                    deal.type ??
                    deal.side ??
                    ''
                ).toUpperCase();

            const isBuy =
                type.includes('BUY');

            const profit =
                Number(
                    deal.profit ??
                    deal.pnl ??
                    0
                );

            return `
                <tr>

                    <td>
                        ${safe(
                            deal.ticket ??
                            deal.id ??
                            '—'
                        )}
                    </td>

                    <td>
                        ${safe(
                            deal.symbol ??
                            '—'
                        )}
                    </td>

                    <td>
                        <span class="${
                            isBuy
                                ? 'buy'
                                : 'sell'
                        }">
                            ${safe(
                                type || '—'
                            )}
                        </span>
                    </td>

                    <td>
                        ${formatNumber(
                            deal.volume ??
                            deal.lots
                        )}
                    </td>

                    <td>
                        ${formatNumber(
                            deal.price ??
                            deal.price_open
                        )}
                    </td>

                    <td>
                        ${safe(
                            deal.time ??
                            deal.timestamp ??
                            '—'
                        )}
                    </td>

                    <td class="${
                        profit >= 0
                            ? 'profit-pos'
                            : 'profit-neg'
                    }">
                        ${formatNumber(
                            profit
                        )}
                    </td>

                </tr>
            `;
        }).join('');
}


/* =========================================================
   ANALYTICS
========================================================= */

function renderAnalytics(
    history
) {
    let totalPL = 0;
    let wins = 0;
    let grossProfit = 0;
    let grossLoss = 0;

    history.forEach(deal => {

        const profit =
            Number(
                deal.profit ??
                deal.pnl ??
                0
            );

        totalPL += profit;

        if (profit > 0) {
            wins++;
            grossProfit += profit;
        }

        if (profit < 0) {
            grossLoss +=
                Math.abs(profit);
        }
    });

    const totalTrades =
        history.length;

    const winRate =
        totalTrades
            ? (
                wins /
                totalTrades
            ) * 100
            : 0;

    const profitFactor =
        grossLoss > 0
            ? grossProfit /
              grossLoss
            : grossProfit > 0
                ? Infinity
                : 0;

    const trades =
        document.getElementById(
            'analytics-trades'
        );

    const pl =
        document.getElementById(
            'analytics-pl'
        );

    const winrate =
        document.getElementById(
            'analytics-winrate'
        );

    const pf =
        document.getElementById(
            'analytics-pf'
        );

    if (trades) {
        trades.textContent =
            totalTrades;
    }

    if (pl) {
        pl.textContent =
            formatNumber(totalPL);

        pl.className =
            totalPL >= 0
                ? 'profit-pos'
                : 'profit-neg';
    }

    if (winrate) {
        winrate.textContent =
            `${winRate.toFixed(1)}%`;
    }

    if (pf) {
        pf.textContent =
            profitFactor === Infinity
                ? '∞'
                : profitFactor.toFixed(2);
    }
}


/* =========================================================
   SIGNALS
========================================================= */

async function fetchSignals() {
    const container =
        document.getElementById(
            'signals-container'
        );

    if (!container) {
        return;
    }

    try {
        const data =
            await apiFetch(
                '/v1/signals'
            );

        const signals =
            Array.isArray(data)
                ? data
                : data?.signals || [];

        if (!signals.length) {
            container.innerHTML = `
                <div class="empty-state glass">
                    No trade signals are currently available.
                </div>
            `;

            return;
        }

        container.innerHTML =
            signals.map(signal => {

                const direction =
                    String(
                        signal.direction ??
                        signal.side ??
                        signal.action ??
                        ''
                    ).toUpperCase();

                const isBuy =
                    direction === 'BUY';

                const confluence =
                    Array.isArray(
                        signal.confluence
                    )
                        ? signal.confluence.join(' · ')
                        : signal.confluence ??
                          '—';

                return `
                    <article class="signal-card glass">

                        <div class="signal-header">

                            <div>

                                <span class="signal-symbol">
                                    ${safe(
                                        signal.symbol ??
                                        'Unknown'
                                    )}
                                </span>

                                <span class="signal-timeframe">
                                    ${safe(
                                        signal.timeframe ??
                                        '—'
                                    )}
                                </span>

                            </div>

                            <span class="signal-direction ${
                                isBuy
                                    ? 'buy'
                                    : 'sell'
                            }">
                                ${safe(
                                    direction ||
                                    '—'
                                )}
                            </span>

                        </div>


                        <div class="signal-grid">

                            <div class="signal-item">
                                <span>Strength</span>
                                <strong>
                                    ${safe(
                                        signal.strength ??
                                        signal.confidence ??
                                        '—'
                                    )}
                                </strong>
                            </div>


                            <div class="signal-item">
                                <span>Strategy</span>
                                <strong>
                                    ${safe(
                                        signal.strategy ??
                                        '—'
                                    )}
                                </strong>
                            </div>


                            <div class="signal-item">
                                <span>Risk / Reward</span>
                                <strong>
                                    ${safe(
                                        signal.risk_reward ??
                                        signal.rr ??
                                        '—'
                                    )}
                                </strong>
                            </div>


                            <div class="signal-item">
                                <span>Entry</span>
                                <strong>
                                    ${formatNumber(
                                        signal.entry
                                    )}
                                </strong>
                            </div>


                            <div class="signal-item">
                                <span>Stop Loss</span>
                                <strong>
                                    ${formatNumber(
                                        signal.stop_loss ??
                                        signal.sl
                                    )}
                                </strong>
                            </div>


                            <div class="signal-item">
                                <span>TP1</span>
                                <strong>
                                    ${formatNumber(
                                        signal.tp1
                                    )}
                                </strong>
                            </div>


                            <div class="signal-item">
                                <span>TP2</span>
                                <strong>
                                    ${formatNumber(
                                        signal.tp2
                                    )}
                                </strong>
                            </div>

                        </div>


                        <div class="signal-confluence">

                            <span>
                                Confluence
                            </span>

                            <p>
                                ${safe(
                                    confluence
                                )}
                            </p>

                        </div>


                        <div class="read-only-note">
                            Read-only market analysis
                        </div>

                    </article>
                `;
            }).join('');

    } catch (error) {

        console.error(
            'Signal loading error:',
            error
        );

        container.innerHTML = `
            <div class="empty-state glass error-state">
                Unable to load signals.
                <small>
                    ${safe(
                        error.message
                    )}
                </small>
            </div>
        `;
    }
}


/* =========================================================
   JOURNAL
========================================================= */

async function saveJournalEntry() {
    const ticket =
        document.getElementById(
            'journal-ticket'
        )?.value.trim();

    const setup =
        document.getElementById(
            'journal-setup'
        )?.value.trim();

    const notes =
        document.getElementById(
            'journal-notes'
        )?.value.trim();

    if (!setup && !notes) {
        alert(
            'Please enter a setup or journal note.'
        );

        return;
    }

    try {
        await apiFetch(
            '/v1/journal/save',
            {
                method: 'POST',

                body: JSON.stringify({
                    ticket,
                    setup,
                    notes
                })
            }
        );

        const ticketInput =
            document.getElementById(
                'journal-ticket'
            );

        const setupInput =
            document.getElementById(
                'journal-setup'
            );

        const notesInput =
            document.getElementById(
                'journal-notes'
            );

        if (ticketInput) {
            ticketInput.value = '';
        }

        if (setupInput) {
            setupInput.value = '';
        }

        if (notesInput) {
            notesInput.value = '';
        }

        await fetchJournal();

    } catch (error) {

        console.error(
            'Journal save error:',
            error
        );

        alert(
            `Unable to save journal entry: ${
                error.message
            }`
        );
    }
}

async function fetchJournal() {
    const container =
        document.getElementById(
            'journal-list-container'
        );

    if (!container) {
        return;
    }

    try {
        const data =
            await apiFetch(
                '/v1/journal'
            );

        const entries =
            Array.isArray(data)
                ? data
                : data?.journal ||
                  data?.entries ||
                  [];

        if (!entries.length) {
            container.innerHTML = `
                <div class="empty-state">
                    No journal entries yet.
                </div>
            `;

            return;
        }

        container.innerHTML =
            entries.map(entry => `

                <article class="journal-entry">

                    <div class="journal-entry-header">

                        <div>

                            <strong>
                                ${safe(
                                    entry.setup ||
                                    entry.title ||
                                    'Journal Entry'
                                )}
                            </strong>

                            ${
                                entry.ticket
                                    ? `
                                        <span class="journal-ticket">
                                            #${safe(
                                                entry.ticket
                                            )}
                                        </span>
                                      `
                                    : ''
                            }

                        </div>

                        <time>
                            ${safe(
                                entry.created_at ||
                                entry.timestamp ||
                                entry.date ||
                                ''
                            )}
                        </time>

                    </div>


                    <p>
                        ${safe(
                            entry.notes ||
                            entry.note ||
                            ''
                        )}
                    </p>

                </article>

            `).join('');

    } catch (error) {

        console.error(
            'Journal loading error:',
            error
        );

        container.innerHTML = `
            <div class="empty-state error-state">
                Unable to load journal.
                <small>
                    ${safe(
                        error.message
                    )}
                </small>
            </div>
        `;
    }
}


/* =========================================================
   DEVICES / PROFILE
========================================================= */

async function fetchDevices() {
    const body =
        document.getElementById(
            'devices-table-body'
        );

    if (!body) {
        return;
    }

    try {
        const data =
            await apiFetch(
                '/v1/devices'
            );

        const devices =
            Array.isArray(data)
                ? data
                : data?.devices || [];

        if (!devices.length) {
            body.innerHTML = `
                <tr>
                    <td colspan="5">
                        <div class="table-empty">
                            No paired devices.
                        </div>
                    </td>
                </tr>
            `;

            return;
        }

        body.innerHTML =
            devices.map(device => {

                const id =
                    device.id ??
                    device.device_id ??
                    '';

                return `
                    <tr>

                        <td>
                            ${safe(id)}
                        </td>

                        <td>
                            ${safe(
                                device.created_at ??
                                device.created ??
                                '—'
                            )}
                        </td>

                        <td>
                            ${safe(
                                device.last_active ??
                                device.last_seen ??
                                '—'
                            )}
                        </td>

                        <td>
                            <span class="status-tag status-success">
                                ${safe(
                                    device.status ??
                                    'Active'
                                )}
                            </span>
                        </td>

                        <td>

                            <button
                                type="button"
                                class="small-danger-btn"
                                onclick="revokeDevice('${safe(id)}')"
                            >
                                Revoke
                            </button>

                        </td>

                    </tr>
                `;
            }).join('');

    } catch (error) {

        console.error(
            'Device loading error:',
            error
        );

        body.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="table-empty">
                        Unable to load devices.
                    </div>
                </td>
            </tr>
        `;
    }
}

async function revokeDevice(
    deviceId
) {
    if (!deviceId) {
        return;
    }

    const confirmed =
        window.confirm(
            'Revoke this device pairing?'
        );

    if (!confirmed) {
        return;
    }

    try {
        await apiFetch(
            '/v1/device/revoke',
            {
                method: 'POST',

                body: JSON.stringify({
                    device_id: deviceId
                })
            }
        );

        await fetchDevices();

    } catch (error) {

        console.error(
            'Device revoke error:',
            error
        );

        alert(
            `Unable to revoke device: ${
                error.message
            }`
        );
    }
}

async function createPairingCode() {
    const display =
        document.getElementById(
            'pairing-code-display'
        );

    if (!display) {
        return;
    }

    display.textContent =
        'Generating...';

    try {
        const data =
            await apiFetch(
                '/v1/pairing/create',
                {
                    method: 'POST'
                }
            );

        const code =
            data?.code ??
            data?.pairing_code ??
            data?.pairingCode ??
            'Unavailable';

        display.textContent =
            code;

    } catch (error) {

        console.error(
            'Pairing error:',
            error
        );

        display.textContent =
            'Unable to generate code';
    }
}


/* =========================================================
   MOBILE NAVIGATION
========================================================= */

function closeMobileMenu() {
    const navigation =
        document.getElementById(
            'main-navigation'
        );

    const toggle =
        document.getElementById(
            'menu-toggle'
        );

    if (navigation) {
        navigation.classList.remove(
            'open'
        );
    }

    if (toggle) {
        toggle.setAttribute(
            'aria-expanded',
            'false'
        );
    }
}

function toggleMobileMenu() {
    const navigation =
        document.getElementById(
            'main-navigation'
        );

    const toggle =
        document.getElementById(
            'menu-toggle'
        );

    if (!navigation) {
        return;
    }

    const isOpen =
        navigation.classList.toggle(
            'open'
        );

    if (toggle) {
        toggle.setAttribute(
            'aria-expanded',
            isOpen
                ? 'true'
                : 'false'
        );
    }
}


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener(
    'DOMContentLoaded',
    () => {

        const menuToggle =
            document.getElementById(
                'menu-toggle'
            );

        if (menuToggle) {
            menuToggle.addEventListener(
                'click',
                toggleMobileMenu
            );
        }


        document
            .querySelectorAll('.nav-btn')
            .forEach(button => {

                button.addEventListener(
                    'click',
                    closeMobileMenu
                );

            });


        const emailInput =
            document.getElementById(
                'email'
            );

        const passwordInput =
            document.getElementById(
                'password'
            );


        if (emailInput) {
            emailInput.addEventListener(
                'keydown',
                event => {

                    if (
                        event.key === 'Enter'
                    ) {
                        handleAuth();
                    }

                }
            );
        }


        if (passwordInput) {
            passwordInput.addEventListener(
                'keydown',
                event => {

                    if (
                        event.key === 'Enter'
                    ) {
                        handleAuth();
                    }

                }
            );
        }


        window.addEventListener(
            'resize',
            () => {

                if (
                    window.innerWidth > 768
                ) {
                    closeMobileMenu();
                }

                if (
                    selectedSymbol
                ) {
                    drawPriceChart(
                        selectedSymbol
                    );
                }

            }
        );


        if (getToken()) {
            showApp();
        } else {
            showLogin();
        }

    }
);


/* =========================================================
   SERVICE WORKER
========================================================= */

if (
    'serviceWorker' in navigator
) {
    window.addEventListener(
        'load',
        () => {

            navigator.serviceWorker
                .register(
                    '/service-worker.js'
                )
                .then(
                    registration => {

                        console.log(
                            'TradePro service worker registered:',
                            registration.scope
                        );

                    }
                )
                .catch(
                    error => {

                        console.error(
                            'TradePro service worker registration failed:',
                            error
                        );

                    }
                );

        }
    );
}
