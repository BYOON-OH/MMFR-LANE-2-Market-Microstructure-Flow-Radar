/* PROJECT: MMFR LANE 2 - v1.1.4
   REVISED: OI Directional Check, Adaptive Whale Limit, Logic Priority Reordering, TTL Tightening
*/

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const axios = require('axios');
const socketIo = require('socket.io');

const PORT = 3001;
const SYMBOLS = ['btcusdt', 'ethusdt'];
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// --- 퀀트 엔진 데이터 상태 ---
const State = {
    btcusdt: { p: 0, lastP: 0, min5Min: 0, max5Min: 0, atr: 0, lastOi: 0, history: [], algo: { lastT: 0, ivs: [] }, absVol: { BUY: 0, SELL: 0 }, signals: { liq: 0, abs: 0, algo: 0, oi: 0, scenario: 0 }, status: 'OBSERVE-MODE', lastStatusTime: 0 },
    ethusdt: { p: 0, lastP: 0, min5Min: 0, max5Min: 0, atr: 0, lastOi: 0, history: [], algo: { lastT: 0, ivs: [] }, absVol: { BUY: 0, SELL: 0 }, signals: { liq: 0, abs: 0, algo: 0, oi: 0, scenario: 0 }, status: 'OBSERVE-MODE', lastStatusTime: 0 }
};

const PRIORITY = { 'DISTRIBUTION': 100, 'LIQUIDITY SWEEP': 80, 'EXPANSION': 60, 'ACCUMULATION': 40, 'OBSERVE-MODE': 10 };

// --- 지표 계산 및 가변 기준 설정 ---
setInterval(async () => {
    for (const s of SYMBOLS) {
        try {
            const res = await axios.get(`https://fapi.binance.com/fapi/v1/klines?symbol=${s.toUpperCase()}&interval=5m&limit=21`);
            const data = res.data.map(d => ({ h: parseFloat(d[2]), l: parseFloat(d[3]), c: parseFloat(d[4]) }));
            const target = State[s];
            target.max5Min = Math.max(...data.slice(-3).map(d => d.h));
            target.min5Min = Math.min(...data.slice(-3).map(d => d.l));

            let trSum = 0;
            for (let i = 1; i < data.length; i++) {
                trSum += Math.max(data[i].h - data[i].l, Math.abs(data[i].h - data[i-1].c), Math.abs(data[i].l - data[i-1].c));
            }
            target.atr = trSum / 20;
            updateMarketStatus(s);
        } catch (e) {}
    }
}, 5000);

// [개선 4] 상태 결정 로직 우선순위 역전 (DISTRIBUTION 우선)
function updateMarketStatus(sym) {
    const s = State[sym];
    const now = Date.now();
    const sig = s.signals;
    
    // [개선 3] Scenario는 보조 신호로만 사용, Primary 카운트에서 제외
    const primarySigs = (sig.liq > 0 ? 1 : 0) + (sig.abs > 0 ? 1 : 0) + (sig.algo > 0 ? 1 : 0) + (sig.oi > 0 ? 1 : 0);

    let newStatus = 'OBSERVE-MODE';
    
    // 고점 흡수(Distribution)가 스윕보다 논리적 우선순위가 높아야 함 (분배 중 스윕이 발생하므로)
    if (sig.abs > 0 && s.p >= s.max5Min * 0.98) newStatus = 'DISTRIBUTION';
    else if (sig.liq > 0) newStatus = 'LIQUIDITY SWEEP';
    else if (sig.oi > 0 && primarySigs >= 2) newStatus = 'EXPANSION'; 
    else if (sig.algo > 0 || sig.scenario > 0) newStatus = 'ACCUMULATION';

    const canChange = (PRIORITY[newStatus] > PRIORITY[s.status]) || (now - s.lastStatusTime > 25000);
    const isDistLock = (s.status === 'DISTRIBUTION' && now - s.lastStatusTime < 40000);

    if (canChange && !isDistLock && s.status !== newStatus) {
        s.status = newStatus;
        s.lastStatusTime = now;
        io.emit('status_update', { sym: sym.toUpperCase(), status: newStatus, sigCount: primarySigs });
    }
}

const processTrade = (sym, p, q, side, timestamp) => {
    if (!State[sym]) return;
    const target = State[sym];
    const usd = p * q;
    const prevP = target.p;
    target.p = p;
    let eventTag = '';

    // [개선 2] Adaptive Whale Limit (ATR 기반 가변 기준)
    // 변동성이 클 때(ATR 높음) 기준을 높여 노이즈 제거, 낮을 때 기준 하향
    const baseLimit = sym === 'btcusdt' ? 400000 : 200000;
    const adaptiveMultiplier = target.atr > 0 ? Math.max(0.7, Math.min(1.5, target.atr / (p * 0.001))) : 1;
    const currentWhaleLimit = baseLimit * adaptiveMultiplier;

    // 1. LIQUIDITY HUNT (가변 기준 적용)
    if (usd >= currentWhaleLimit) {
        target.history.push({side, p});
        if (target.history.length > 3) target.history.shift();
        const isStreak = target.history.length === 3 && target.history.every(v => v.side === side);
        const atEdge = side === 'BUY' ? p >= target.max5Min * 0.999 : p <= target.min5Min * 1.001;
        if (isStreak && atEdge) {
            eventTag = 'LIQ HUNT';
            target.signals.liq += usd;
            io.emit('sig_act', { sym: sym.toUpperCase(), id: 'liq', vol: target.signals.liq });
            setTimeout(() => target.signals.liq = 0, 10000);
        }
    }

    // 2. ABSORPTION
    let isAbs = false;
    const absThreshold = sym === 'btcusdt' ? 0.00015 : 0.00025;
    if (Math.abs(p - prevP) / prevP < absThreshold && usd > currentWhaleLimit) {
        target.absVol[side] += usd;
        if (target.absVol[side] > currentWhaleLimit * 1.5) {
            eventTag = 'ABSORPTION';
            target.signals.abs += usd;
            isAbs = true;
            io.emit('sig_act', { sym: sym.toUpperCase(), id: 'abs', vol: target.signals.abs });
            target.absVol[side] = 0;
            setTimeout(() => target.signals.abs = 0, 10000);
        }
    }

    // 3. ALGO HINT
    let isAlgo = false;
    const delta = timestamp - target.algo.lastT;
    target.algo.lastT = timestamp;
    if (usd > 30000 && delta > 1000 && delta < 7000) {
        target.algo.ivs.push(delta);
        if (target.algo.ivs.length > 10) target.algo.ivs.shift();
        if (target.algo.ivs.length === 10) {
            const mean = target.algo.ivs.reduce((a, b) => a + b, 0) / 10;
            const stdDev = Math.sqrt(target.algo.ivs.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 10);
            if (stdDev / mean < 0.25) {
                eventTag = 'ALGO HINT';
                target.signals.algo += usd;
                isAlgo = true;
                io.emit('sig_act', { sym: sym.toUpperCase(), id: 'algo', vol: target.signals.algo });
                setTimeout(() => target.signals.algo = 0, 10000);
            }
        }
    }

    // [개선 3] Scenario TTL 단축 (15초 -> 8초) 및 엄격화
    if (isAbs || isAlgo) {
        eventTag = eventTag || 'SCENARIO';
        target.signals.scenario += usd;
        io.emit('sig_act', { sym: sym.toUpperCase(), id: 'scenario', vol: target.signals.scenario });
        setTimeout(() => target.signals.scenario = 0, 8000);
    }
    io.emit('m_up', { sym: sym.toUpperCase(), p: target.p, usd, side, tag: eventTag });
};

// [개선 1] OI 방향성 정합성 체크 (Math.sign)
setInterval(async () => {
    for (const s of SYMBOLS) {
        try {
            const res = await axios.get('https://fapi.binance.com/fapi/v1/openInterest?symbol=' + s.toUpperCase());
            const target = State[s];
            const curOi = parseFloat(res.data.openInterest) * target.p;
            if (target.lastOi > 0 && target.atr > 0) {
                const dOiUsd = curOi - target.lastOi;
                const dP = target.p - target.lastP;
                
                const oiSensitivity = s === 'btcusdt' ? 45 : 35; 
                // OI 증가와 가격 변화 방향이 일치할 때만 진성 시그널로 인정 (Long Build or Short Build)
                if (Math.abs(dOiUsd) > target.atr * oiSensitivity && dOiUsd > 0 && Math.sign(dOiUsd) === Math.sign(Math.abs(dP) > 0 ? dP : 0)) {
                    target.signals.oi += Math.abs(dOiUsd);
                    io.emit('sig_act', { sym: s.toUpperCase(), id: 'oi', vol: target.signals.oi });
                    setTimeout(() => target.signals.oi = 0, 10000);
                }
            }
            target.lastOi = curOi; target.lastP = target.p;
        } catch (e) {}
    }
}, 5000);

// --- WebSocket 및 서버 로직 ---
let wsBinance = null;
let wsAlive = false;
let lastWsMsgTime = Date.now();
let reconnectLock = false;
let failCount = 0;

function connectBinanceWS() {
    if (wsBinance) { try { wsBinance.terminate(); } catch {} }
    wsBinance = new WebSocket('wss://fstream.binance.com/ws/' + SYMBOLS.map(s => s + '@aggTrade').join('/'));
    wsAlive = false;
    wsBinance.on('open', () => { 
        wsAlive = true; lastWsMsgTime = Date.now(); failCount = 0;
        console.log('[WS] Connected'); 
    });
    wsBinance.on('message', (data) => {
        lastWsMsgTime = Date.now();
        try {
            const raw = JSON.parse(data);
            if (raw.e === 'aggTrade') processTrade(raw.s.toLowerCase(), parseFloat(raw.p), parseFloat(raw.q), raw.m ? 'SELL' : 'BUY', raw.T);
        } catch (e) {}
    });
    wsBinance.on('error', () => { wsAlive = false; });
    wsBinance.on('close', () => { wsAlive = false; scheduleReconnect(); });
}

function scheduleReconnect() {
    if (reconnectLock) return;
    reconnectLock = true;
    failCount++;
    const delay = Math.min(3000 * failCount, 30000);
    setTimeout(() => { reconnectLock = false; connectBinanceWS(); }, delay);
}

setInterval(() => {
    if (wsAlive && Date.now() - lastWsMsgTime > 15000) {
        try { wsBinance.terminate(); } catch {}
        wsAlive = false; scheduleReconnect();
    }
}, 5000);

connectBinanceWS();

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>MMFR LANE 2 | V1.1.4</title>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700;800&family=Inter:wght@700;900&display=swap" rel="stylesheet">
    <style>
        :root { --bg: #05060a; --panel: #0d0f17; --border: #232735; --accent: #00e5ff; --up: #00ffa3; --down: #ff3366; --warn: #ffcc00; --neutral: #5c627a; --safe: #00ffa3; --danger: #ff3366; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { background: var(--bg); color: #e1e4eb; font-family: 'Inter', sans-serif; margin: 0; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
        .nav-bar { height: 50px; background: #000; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; padding: 0 15px; flex-shrink: 0; }
        .mode-btn { cursor: pointer; color: var(--accent); border: 1px solid var(--accent); padding: 6px 12px; font-size: 11px; font-weight: 900; border-radius: 4px; text-transform: uppercase; }
        #master-ui, #protector-ui { flex: 1; display: none; overflow-y: auto; overflow-x: hidden; }
        .m-header { padding: 15px 20px; background: #000; border-bottom: 1px solid var(--border); }
        .brief-text { font-size: 15px; font-weight: 900; color: #fff; border-left: 3px solid var(--accent); padding-left: 12px; line-height: 1.2; }
        .m-main { display: grid; grid-template-columns: 1fr 360px; padding: 12px; gap: 12px; height: calc(100vh - 110px); }
        @media (max-width: 1100px) { .m-main { grid-template-columns: 1fr; height: auto; } }
        .box { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; }
        .box-h { padding: 8px 15px; font-size: 10px; font-weight: 800; color: #5c627a; border-bottom: 1px solid var(--border); background: rgba(255,255,255,0.01); letter-spacing: 0.5px; }
        .coin-card { padding: 20px; display: flex; flex-direction: column; gap: 25px; }
        @media (min-width: 650px) { .coin-card { display: grid; grid-template-columns: 240px 1fr; align-items: center; gap: 35px; } }
        .price-section { display: flex; flex-direction: column; justify-content: center; }
        .c-val { font-size: clamp(36px, 6vw, 54px); font-weight: 900; font-family: 'JetBrains Mono'; margin: 2px 0; letter-spacing: -2px; line-height: 1; }
        .status-tag { font-size: 11px; font-weight: 800; color: var(--accent); margin-top: 8px; }
        .signal-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        @media (min-width: 450px) { .signal-grid { grid-template-columns: repeat(5, 1fr); gap: 8px; } }
        .sig-item { background: rgba(255,255,255,0.03); border: 1px solid #1c1f2b; border-radius: 8px; padding: 12px 8px; transition: 0.2s ease; text-align: center; display: flex; flex-direction: column; justify-content: center; min-height: 60px; }
        .sig-item.active { border-color: var(--accent); background: rgba(0, 229, 255, 0.12); box-shadow: 0 0 15px rgba(0, 229, 255, 0.1); transform: translateY(-2px); }
        .s-name { font-size: 9px; font-weight: 800; color: #5c627a; margin-bottom: 5px; white-space: nowrap; }
        .s-vol { font-size: 11px; font-family: 'JetBrains Mono'; font-weight: 800; color: #fff; }
        .feed { height: 400px; overflow-y: auto; font-family: 'JetBrains Mono'; font-size: 11px; background: #08090e; }
        @media (min-width: 1101px) { .feed { height: auto; } }
        .row { padding: 9px 15px; border-bottom: 1px solid #14161f; display: grid; grid-template-columns: 55px 60px 1fr 70px; align-items: center; }
        .BUY { color: var(--up); } .SELL { color: var(--down); }
        .p-hero { padding: 50px 20px; background: #000; border-bottom: 1px solid var(--border); text-align: center; }
        .p-action { font-size: clamp(36px, 10vw, 72px); font-weight: 900; letter-spacing: -3px; }
        .p-grid { display: grid; grid-template-columns: 1fr; gap: 20px; padding: 20px; }
        @media (min-width: 850px) { .p-grid { grid-template-columns: 1fr 1fr; padding: 40px; gap: 30px; } }
        .p-card { background: var(--panel); border-radius: 20px; padding: 30px; border: 1px solid var(--border); }
        .gauge-bg { height: 12px; background: rgba(255,255,255,0.05); border-radius: 6px; margin: 25px 0; overflow: hidden; }
        .gauge-bar { height: 100%; width: 0%; transition: 1.2s cubic-bezier(0.16, 1, 0.3, 1); }
    </style>
</head>
<body>
    <div class="nav-bar">
        <div id="toggle-btn" class="mode-btn" onclick="toggleMode()">GO PROTECTOR</div>
        <div id="clock" style="color:var(--neutral); font-family:'JetBrains Mono'; font-size:11px; font-weight:800;">00:00:00</div>
    </div>
    <div id="master-ui" style="display:block;">
        <div class="m-header"><div id="brief-msg" class="brief-text">전 거래소 오더플로우 통합 엔진 감시 중...</div></div>
        <main class="m-main">
            <div style="display:flex; flex-direction:column; gap:12px;">
                <div class="box">
                    <div class="box-h">BITCOIN CORE / USDT</div>
                    <div class="coin-card">
                        <div class="price-section">
                            <div style="font-size:11px; color:#5c627a; font-weight:800; letter-spacing:1px;">BTC PRICE</div>
                            <div id="m-btc-p" class="c-val">0</div>
                            <div id="btc-status" class="status-tag">MONITORING</div>
                        </div>
                        <div class="signal-grid">
                            <div id="btc-liq" class="sig-item"><div class="s-name">LIQ HUNT</div><div class="s-vol" id="v-btc-liq">$0M</div></div>
                            <div id="btc-abs" class="sig-item"><div class="s-name">ABSORPTION</div><div class="s-vol" id="v-btc-abs">$0M</div></div>
                            <div id="btc-algo" class="sig-item"><div class="s-name">ALGO HINT</div><div class="s-vol" id="v-btc-algo">$0M</div></div>
                            <div id="btc-oi" class="sig-item"><div class="s-name">TRIPLE</div><div class="s-vol" id="v-btc-oi">$0M</div></div>
                            <div id="btc-scenario" class="sig-item" style="background:rgba(0,229,255,0.05); border-color:rgba(0,229,255,0.1);"><div class="s-name" style="color:#fff">SCENARIO</div><div class="s-vol" id="v-btc-scenario">$0M</div></div>
                        </div>
                    </div>
                </div>
                <div class="box">
                    <div class="box-h">ETHEREUM CORE / USDT</div>
                    <div class="coin-card">
                        <div class="price-section">
                            <div style="font-size:11px; color:#5c627a; font-weight:800; letter-spacing:1px;">ETH PRICE</div>
                            <div id="m-eth-p" class="c-val">0</div>
                            <div id="eth-status" class="status-tag">MONITORING</div>
                        </div>
                        <div class="signal-grid">
                            <div id="eth-liq" class="sig-item"><div class="s-name">LIQ HUNT</div><div class="s-vol" id="v-eth-liq">$0M</div></div>
                            <div id="eth-abs" class="sig-item"><div class="s-name">ABSORPTION</div><div class="s-vol" id="v-eth-abs">$0M</div></div>
                            <div id="eth-algo" class="sig-item"><div class="s-name">ALGO HINT</div><div class="s-vol" id="v-eth-algo">$0M</div></div>
                            <div id="eth-oi" class="sig-item"><div class="s-name">TRIPLE</div><div class="s-vol" id="v-eth-oi">$0M</div></div>
                            <div id="eth-scenario" class="sig-item" style="background:rgba(0,229,255,0.05); border-color:rgba(0,229,255,0.1);"><div class="s-name" style="color:#fff">SCENARIO</div><div class="s-vol" id="v-eth-scenario">$0M</div></div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="box">
                <div class="box-h">LIVE ORDER FLOW FEED</div>
                <div id="f" class="feed"></div>
            </div>
        </main>
    </div>
    <div id="protector-ui">
        <div class="p-hero">
            <div id="p-global-action" class="p-action" style="color:var(--neutral);">WAITING...</div>
            <div id="p-global-msg" style="margin-top:12px; font-weight:700; color:var(--neutral); font-size:14px;">데이터 엔진 분석 대기 중</div>
        </div>
        <div class="p-grid">
            <div class="p-card">
                <div style="font-weight:800; color:var(--neutral); font-size:12px;">BITCOIN <span id="p-btc-p">0</span></div>
                <div id="p-btc-action" style="font-size:38px; font-weight:900; margin:12px 0;">대기 중</div>
                <div class="gauge-bg"><div id="p-btc-gauge" class="gauge-bar"></div></div>
                <div id="p-btc-msg" style="color:var(--neutral); font-weight:700; font-size:14px;">감시 엔진 가동 중...</div>
            </div>
            <div class="p-card">
                <div style="font-weight:800; color:var(--neutral); font-size:12px;">ETHEREUM <span id="p-eth-p">0</span></div>
                <div id="p-eth-action" style="font-size:38px; font-weight:900; margin:12px 0;">대기 중</div>
                <div class="gauge-bg"><div id="p-eth-gauge" class="gauge-bar"></div></div>
                <div id="p-eth-msg" style="color:var(--neutral); font-weight:700; font-size:14px;">감시 엔진 가동 중...</div>
            </div>
        </div>
    </div>
    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let currentMode = 'MASTER';
        const MAP = {
            'OBSERVE-MODE': { color: 'var(--neutral)', action: '⛔ OBSERVE', msg: '시장 침묵: 기관 매집 중 / 진입 금지', level: 10 },
            'DISTRIBUTION': { color: 'var(--danger)', action: '🟥 NO ENTRY', msg: '고점 물량 넘기기: 관망 유지 ⭕', level: 95 },
            'LIQUIDITY SWEEP': { color: 'var(--warn)', action: '⚠️ SWEEPED', msg: '개인 손절 유도 완료: 개입 금지', level: 65 },
            'ACCUMULATION': { color: 'var(--safe)', action: '✅ ACCUM', msg: '매집 구간: 조용히 관전 유지', level: 30 },
            'EXPANSION': { color: 'var(--warn)', action: '⚠️ EXPAND', msg: '이미 늦었습니다. 사이즈 축소 권장', level: 85 }
        };
        function toggleMode() {
            currentMode = currentMode === 'MASTER' ? 'PROTECTOR' : 'MASTER';
            document.getElementById('master-ui').style.display = currentMode === 'MASTER' ? 'block' : 'none';
            document.getElementById('protector-ui').style.display = currentMode === 'PROTECTOR' ? 'block' : 'none';
            document.getElementById('toggle-btn').innerText = 'GO ' + (currentMode === 'MASTER' ? 'PROTECTOR' : 'MASTER');
        }
        setInterval(() => { document.getElementById('clock').innerText = new Date().toLocaleTimeString('ko-KR'); }, 1000);
        socket.on('m_up', d => {
            const sym = d.sym === 'BTCUSDT' ? 'btc' : 'eth';
            document.getElementById('m-'+sym+'-p').innerText = d.p.toLocaleString();
            const pp = document.getElementById('p-'+sym+'-p'); if(pp) pp.innerText = d.p.toLocaleString();
            if (d.usd > 30000) {
                const e = document.createElement('div');
                e.className = 'row ' + d.side;
                e.innerHTML = '<span>'+d.sym.replace('USDT','')+'</span><span>'+d.side+'</span><span>'+(d.tag||'')+'</span><span style="text-align:right">$'+(d.usd/1000).toFixed(0)+'k</span>';
                const f = document.getElementById('f');
                f.prepend(e); if(f.childElementCount > 35) f.lastChild.remove();
            }
        });
        socket.on('status_update', d => {
            const sym = d.sym === 'BTCUSDT' ? 'btc' : 'eth';
            const info = MAP[d.status];
            if(!info) return;
            if(sym === 'btc') {
                const ga = document.getElementById('p-global-action');
                ga.innerText = info.action; ga.style.color = info.color;
            }
            document.getElementById('p-'+sym+'-action').innerText = info.action;
            document.getElementById('p-'+sym+'-action').style.color = info.color;
            document.getElementById('p-'+sym+'-msg').innerText = info.msg;
            const gauge = document.getElementById('p-'+sym+'-gauge');
            gauge.style.width = info.level + '%';
            gauge.style.backgroundColor = info.color;
            document.getElementById(sym+'-status').innerText = d.status + ' ('+d.sigCount+')';
        });
        socket.on('sig_act', s => {
            const key = (s.sym === 'BTCUSDT' ? 'btc' : 'eth') + '-' + s.id;
            const el = document.getElementById(key);
            const volEl = document.getElementById('v-' + key);
            if(el) {
                el.classList.add('active');
                if(volEl) volEl.innerText = '$' + (s.vol / 1000000).toFixed(2) + 'M';
                setTimeout(() => el.classList.remove('active'), 8000);
            }
        });
    </script>
</body>
</html>
    `);
});

server.listen(PORT, () => console.log('LANE 2 v1.1.4 ONLINE'));
