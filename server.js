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


const State = {
    btcusdt: { p: 0, lastP: 0, min5Min: 0, max5Min: 0, atr: 0, lastOi: 0, history: [], algo: { lastT: 0, ivs: [] }, absVol: { BUY: 0, SELL: 0 }, signals: { liq: 0, abs: 0, algo: 0, oi: 0, scenario: 0 }, status: 'OBSERVE-MODE', lastStatusTime: 0 },
    ethusdt: { p: 0, lastP: 0, min5Min: 0, max5Min: 0, atr: 0, lastOi: 0, history: [], algo: { lastT: 0, ivs: [] }, absVol: { BUY: 0, SELL: 0 }, signals: { liq: 0, abs: 0, algo: 0, oi: 0, scenario: 0 }, status: 'OBSERVE-MODE', lastStatusTime: 0 }
};

const PRIORITY = { 'DISTRIBUTION': 100, 'LIQUIDITY SWEEP': 80, 'EXPANSION': 60, 'ACCUMULATION': 40, 'OBSERVE-MODE': 10 };


setInterval(async () => {
    for (const s of SYMBOLS) {
        try {
            const res = await axios.get(`https://fapi.binance.com/fapi/v1/klines?symbol=${s.toUpperCase()}&interval=5m&limit=20`);
            const highs = res.data.map(d => parseFloat(d[2]));
            const lows = res.data.map(d => parseFloat(d[3]));
            const closes = res.data.map(d => parseFloat(d[4]));
            const target = State[s];
            target.max5Min = Math.max(...highs.slice(-3));
            target.min5Min = Math.min(...lows.slice(-3));
            let sum = 0;
            for(let i=1; i<closes.length; i++) sum += Math.abs(highs[i] - lows[i]);
            target.atr = sum / 20;

            updateMarketStatus(s);
        } catch (e) {}
    }
}, 5000);

function updateMarketStatus(sym) {
    const s = State[sym];
    const now = Date.now();
    const sig = s.signals;
    const activeSigs = Object.values(sig).filter(v => v > 0).length;

    let newStatus = 'OBSERVE-MODE';
    
  
    if (sig.liq > 0) newStatus = 'LIQUIDITY SWEEP';

    else if (sig.abs > 0 && s.p >= s.max5Min * 0.99) newStatus = 'DISTRIBUTION';
  
    else if (sig.oi > 0 && activeSigs >= 2) newStatus = 'EXPANSION'; 
 
    else if ((sig.scenario > 0 || sig.algo > 0)) newStatus = 'ACCUMULATION';

    const canChange = (PRIORITY[newStatus] > PRIORITY[s.status]) || (now - s.lastStatusTime > 25000);
    const isDistLock = (s.status === 'DISTRIBUTION' && now - s.lastStatusTime < 40000);

    if (canChange && !isDistLock && s.status !== newStatus) {
        s.status = newStatus;
        s.lastStatusTime = now;
        io.emit('status_update', { sym: sym.toUpperCase(), status: newStatus, sigCount: activeSigs });
    }
}


const processTrade = (sym, p, q, side, timestamp, exchange) => {
    if (!State[sym]) return;
    const target = State[sym];
    const usd = p * q;
    const prevP = target.p;
    target.p = p;
    let eventTag = '';

    const whaleLimit = sym === 'btcusdt' ? 400000 : 200000;

    if (usd >= whaleLimit) {
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


    let isAbs = false;
    if (Math.abs(p - prevP) / prevP < 0.0001 && usd > whaleLimit) {
        target.absVol[side] += usd;
        if (target.absVol[side] > whaleLimit * 1.5) {
            eventTag = 'ABSORPTION';
            target.signals.abs += usd;
            isAbs = true;
            io.emit('sig_act', { sym: sym.toUpperCase(), id: 'abs', vol: target.signals.abs });
            target.absVol[side] = 0;
            setTimeout(() => target.signals.abs = 0, 10000);
        }
    }

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

 
    if (isAbs || isAlgo) {
        eventTag = eventTag || 'SCENARIO';
        target.signals.scenario += usd;
        io.emit('sig_act', { sym: sym.toUpperCase(), id: 'scenario', vol: target.signals.scenario });
        setTimeout(() => target.signals.scenario = 0, 15000);
    }

    io.emit('m_up', { sym: sym.toUpperCase(), p: target.p, usd, side, tag: eventTag });
};


let wsBinance = null;
let wsAlive = false;
let lastWsMsgTime = Date.now();
let reconnectLock = false;

function connectBinanceWS() {
    if (wsBinance) {
        try { wsBinance.terminate(); } catch {}
    }

    wsBinance = new WebSocket(
        'wss://fstream.binance.com/ws/' +
        SYMBOLS.map(s => s + '@aggTrade').join('/')
    );

    wsAlive = false;

    wsBinance.on('open', () => {
        wsAlive = true;
        lastWsMsgTime = Date.now();
        console.log('[WS] Binance connected');
    });

    wsBinance.on('message', (data) => {
        lastWsMsgTime = Date.now();
        try {
            const raw = JSON.parse(data);
            if (raw.e === 'aggTrade') {
                processTrade(
                    raw.s.toLowerCase(),
                    parseFloat(raw.p),
                    parseFloat(raw.q),
                    raw.m ? 'SELL' : 'BUY',
                    raw.T
                );
            }
        } catch (e) {
            
        }
    });

    wsBinance.on('error', () => {
        wsAlive = false;
    });

    wsBinance.on('close', () => {
        wsAlive = false;
        scheduleReconnect();
    });
}

function scheduleReconnect() {
    if (reconnectLock) return;
    reconnectLock = true;

    setTimeout(() => {
        reconnectLock = false;
        connectBinanceWS();
    }, 3000);
}


setInterval(() => {
    if (wsAlive && Date.now() - lastWsMsgTime > 15000) {
        console.warn('[WS] silent death detected → reconnect');
        try { wsBinance.terminate(); } catch {}
        wsAlive = false;
        scheduleReconnect();
    }
}, 5000);


connectBinanceWS();


process.on('SIGINT', () => {
    try { wsBinance.close(); } catch {}
    process.exit();
});



setInterval(async () => {
    for (const s of SYMBOLS) {
        try {
            const res = await axios.get('https://fapi.binance.com/fapi/v1/openInterest?symbol=' + s.toUpperCase());
            const target = State[s];
            const curOi = parseFloat(res.data.openInterest) * target.p;
            if (target.lastOi > 0 && target.atr > 0) {
                const dOiUsd = curOi - target.lastOi;
                const dP = target.p - target.lastP;
                const dynamicThreshold = target.atr * 30;
                if (Math.abs(dOiUsd) > dynamicThreshold && (dOiUsd > 0 && Math.abs(dP) > 0)) {
                    target.signals.oi += Math.abs(dOiUsd);
                    io.emit('sig_act', { sym: s.toUpperCase(), id: 'oi', vol: target.signals.oi, type: dP > 0 ? 'LONG' : 'SHORT' });
                    setTimeout(() => target.signals.oi = 0, 10000);
                }
            }
            target.lastOi = curOi; target.lastP = target.p;
        } catch (e) {}
    }
}, 5000);


app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>MMFR LANE 2 | HYBRID TERMINAL</title>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700;800&family=Inter:wght@700;900&display=swap" rel="stylesheet">
    <style>
        :root { --bg: #05060a; --panel: #0d0f17; --border: #232735; --accent: #00e5ff; --up: #00ffa3; --down: #ff3366; --warn: #ffcc00; --neutral: #5c627a; --safe: #00ffa3; --danger: #ff3366; }
        body { background: var(--bg); color: #e1e4eb; font-family: 'Inter', sans-serif; margin: 0; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
        
        .nav-bar { height: 45px; background: #000; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; padding: 0 20px; z-index: 100; }
        .mode-btn { cursor: pointer; color: var(--accent); border: 1px solid var(--accent); padding: 4px 12px; font-size: 11px; font-weight: 900; border-radius: 4px; }
        
        #master-ui, #protector-ui { flex: 1; display: none; overflow: hidden; }

        /* MASTER UI STYLE (원형 보존) */
        .m-header { height: 100px; background: #000; border-bottom: 2px solid var(--border); display: flex; align-items: center; padding: 0 40px; }
        .brief-text { font-size: 20px; font-weight: 900; color: #fff; border-left: 4px solid var(--accent); padding-left: 20px; }
        .m-main { display: grid; grid-template-columns: 1fr 400px; padding: 20px; gap: 20px; height: calc(100vh - 165px); }
        .box { background: var(--panel); border: 1px solid var(--border); border-radius: 20px; display: flex; flex-direction: column; overflow: hidden; }
        .box-h { padding: 12px 20px; font-size: 12px; font-weight: 800; color: #5c627a; border-bottom: 1px solid var(--border); }
        .coin-card { padding: 25px; display: grid; grid-template-columns: 280px 1fr; gap: 25px; }
        .c-val { font-size: 52px; font-weight: 900; font-family: 'JetBrains Mono'; margin: 5px 0; letter-spacing: -2px; }
        .signal-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
        .sig-item { background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 12px; padding: 12px; transition: 0.3s; }
        .sig-item.active { border-color: var(--accent); background: rgba(0, 229, 255, 0.15); box-shadow: 0 0 15px rgba(0, 229, 255, 0.1); }
        .s-name { font-size: 10px; font-weight: 800; color: #5c627a; }
        .feed { flex: 1; overflow-y: auto; font-family: 'JetBrains Mono'; font-size: 12px; }
        .row { padding: 8px 20px; border-bottom: 1px solid #1c1f2b; display: grid; grid-template-columns: 50px 70px 1fr 70px; align-items: center; }
        .BUY { color: var(--up); } .SELL { color: var(--down); }

        /* PROTECTOR UI STYLE */
        .p-hero { height: 180px; background: #000; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .p-action { font-size: 64px; font-weight: 900; letter-spacing: -3px; }
        .p-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; padding: 40px; }
        .p-card { background: var(--panel); border-radius: 30px; padding: 40px; border: 2px solid transparent; }
        .gauge-bg { height: 12px; background: rgba(255,255,255,0.05); border-radius: 6px; margin: 25px 0; overflow: hidden; }
        .gauge-bar { height: 100%; width: 0%; transition: 1.5s; }
        .check-list { font-size: 11px; color: var(--neutral); line-height: 1.6; border-top: 1px solid var(--border); padding-top: 15px; margin-top: 15px; }
    </style>
</head>
<body>
    <div class="nav-bar">
        <div id="toggle-btn" class="mode-btn" onclick="toggleMode()">GO TO PROTECTOR</div>
        <div id="clock" class="clock-text" style="color:var(--neutral); font-family:'JetBrains Mono'; font-size:12px;">00:00:00 KST</div>
    </div>

    <div id="master-ui" style="display:block;">
        <div class="m-header"><div id="brief-msg" class="brief-text">전 거래소 오더플로우 통합 분석 엔진 가동 중...</div></div>
        <main class="m-main">
            <div style="display:grid; grid-template-rows:1fr 1fr; gap:20px;">
                <div class="box">
                    <div class="box-h">BITCOIN / USDT - 5-CORE REAL-TIME</div>
                    <div class="coin-card">
                        <div><div style="font-size:14px; color:#5c627a; font-weight:800;">BTC PRICE</div><div id="m-btc-p" class="c-val">0.00</div><div id="btc-status" style="font-size:12px; font-weight:800; color:var(--accent);">MONITORING...</div></div>
                        <div class="signal-grid">
                            <div id="btc-liq" class="sig-item"><div class="s-name">LIQ HUNT</div><div class="s-vol" id="v-btc-liq">$0M</div></div>
                            <div id="btc-abs" class="sig-item"><div class="s-name">ABSORPTION</div><div class="s-vol" id="v-btc-abs">$0M</div></div>
                            <div id="btc-algo" class="sig-item"><div class="s-name">ALGO HINT</div><div class="s-vol" id="v-btc-algo">$0M</div></div>
                            <div id="btc-oi" class="sig-item"><div class="s-name">TRIPLE</div><div class="s-vol" id="v-btc-oi">$0M</div></div>
                            <div id="btc-scenario" class="sig-item" style="background:rgba(0,229,255,0.03)"><div class="s-name" style="color:#fff">SCENARIO</div><div class="s-vol" id="v-btc-scenario">$0M</div></div>
                        </div>
                    </div>
                </div>
                <div class="box">
                    <div class="box-h">ETHEREUM / USDT - 5-CORE REAL-TIME</div>
                    <div class="coin-card">
                        <div><div style="font-size:14px; color:#5c627a; font-weight:800;">ETH PRICE</div><div id="m-eth-p" class="c-val">0.00</div><div id="eth-status" style="font-size:12px; font-weight:800; color:var(--accent);">MONITORING...</div></div>
                        <div class="signal-grid">
                            <div id="eth-liq" class="sig-item"><div class="s-name">LIQ HUNT</div><div class="s-vol" id="v-eth-liq">$0M</div></div>
                            <div id="eth-abs" class="sig-item"><div class="s-name">ABSORPTION</div><div class="s-vol" id="v-eth-abs">$0M</div></div>
                            <div id="eth-algo" class="sig-item"><div class="s-name">ALGO HINT</div><div class="s-vol" id="v-eth-algo">$0M</div></div>
                            <div id="eth-oi" class="sig-item"><div class="s-name">TRIPLE</div><div class="s-vol" id="v-eth-oi">$0M</div></div>
                            <div id="eth-scenario" class="sig-item" style="background:rgba(0,229,255,0.03)"><div class="s-name" style="color:#fff">SCENARIO</div><div class="s-vol" id="v-eth-scenario">$0M</div></div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="box"><div class="box-h">ORDER FLOW FEED</div><div id="f" class="feed"></div></div>
        </main>
    </div>

    <div id="protector-ui">
        <div class="p-hero">
            <div id="p-global-action" class="p-action" style="color:var(--neutral);">WAITING...</div>
            <div id="p-global-msg" style="margin-top:10px; font-weight:700; color:var(--neutral);">분석 엔진 데이터 수신 대기 중</div>
        </div>
        <div class="p-grid">
            <div class="p-card">
                <div style="font-weight:800; color:var(--neutral);">BITCOIN <span id="p-btc-p">0.00</span></div>
                <div id="p-btc-action" style="font-size:42px; font-weight:900; margin:15px 0;">대기 중</div>
                <div class="gauge-bg"><div id="p-btc-gauge" class="gauge-bar"></div></div>
                <div id="p-btc-msg" style="color:var(--neutral); font-weight:700;">시장 침묵 감지: 적극적 관망 구간</div>
                <div class="check-list">
                    ◈ 박스권/OI 신뢰도 필터링 활성<br>
                    ◈ [절대규칙] 상위 1%는 맞추는 사람이 아니라 안 망하는 사람입니다.
                </div>
            </div>
            <div class="p-card">
                <div style="font-weight:800; color:var(--neutral);">ETHEREUM <span id="p-eth-p">0.00</span></div>
                <div id="p-eth-action" style="font-size:42px; font-weight:900; margin:15px 0;">대기 중</div>
                <div class="gauge-bg"><div id="p-eth-gauge" class="gauge-bar"></div></div>
                <div id="p-eth-msg" style="color:var(--neutral); font-weight:700;">시장 침묵 감지: 적극적 관망 구간</div>
                <div class="check-list">
                    ◈ 변동성(ATR) 수렴/확장 판단 완료<br>
                    ◈ "지금 안 타면 놓친다"는 감정은 리스크 확장 신호입니다.
                </div>
            </div>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let currentMode = 'MASTER';

        // 사용자 요청 체크리스트 기반 심리 필터 메시지 맵
        const MAP = {
            'OBSERVE-MODE': { color: 'var(--neutral)', action: '⛔ OBSERVE-MODE', msg: '시장 침묵 감지: 기관 매집 중 / 지금 진입은 리스크 선택입니다.', level: 10 },
            'DISTRIBUTION': { color: 'var(--danger)', action: '🟥 추격 금지', msg: '고점 물량 떠넘기기: 방향 예측 금지 / 관망만 ⭕', level: 95 },
            'LIQUIDITY SWEEP': { color: 'var(--warn)', action: '⚠️ 헌팅 완료', msg: '개인 손절 유도 완료: 개인 개입 금지 구간', level: 65 },
            'ACCUMULATION': { color: 'var(--safe)', action: '✅ 정보 대기', msg: '매집 구간: 재미없는 구간이 정답입니다. 관전 유지', level: 30 },
            'EXPANSION': { color: 'var(--warn)', action: '⚠️ 리스크 구간', msg: '이미 폭발한 뒤라면 늦었습니다. 이 구간은 프로 데스크에서도 포지션 사이즈를 줄입니다', level: 85 }
        };

        function toggleMode() {
            currentMode = currentMode === 'MASTER' ? 'PROTECTOR' : 'MASTER';
            document.getElementById('master-ui').style.display = currentMode === 'MASTER' ? 'block' : 'none';
            document.getElementById('protector-ui').style.display = currentMode === 'PROTECTOR' ? 'block' : 'none';
            document.getElementById('toggle-btn').innerText = 'GO TO ' + (currentMode === 'MASTER' ? 'PROTECTOR' : 'MASTER');
        }

        function updateClock() {
            document.getElementById('clock').innerText = new Date().toLocaleTimeString('ko-KR') + ' KST';
        }
        setInterval(updateClock, 1000);

        socket.on('m_up', d => {
            const sym = d.sym === 'BTCUSDT' ? 'btc' : 'eth';
            const mPrice = document.getElementById('m-'+sym+'-p');
            const pPrice = document.getElementById('p-'+sym+'-p');
            if(mPrice) mPrice.innerText = d.p.toLocaleString();
            if(pPrice) pPrice.innerText = d.p.toLocaleString();

            if (d.usd > 30000) {
                const e = document.createElement('div');
                e.className = 'row ' + d.side;
                e.innerHTML = '<span>'+d.sym.replace('USDT','')+'</span><span>'+d.side+'</span><span>'+(d.tag||'')+'</span><span style="text-align:right">$'+(d.usd/1000).toFixed(0)+'k</span>';
                const f = document.getElementById('f');
                f.prepend(e); if(f.childElementCount > 30) f.lastChild.remove();
            }
        });

        socket.on('status_update', d => {
            const sym = d.sym === 'BTCUSDT' ? 'btc' : 'eth';
            const info = MAP[d.status];
            
            // Protector UI (행동 중심)
            const gAction = document.getElementById('p-global-action');
            const sAction = document.getElementById('p-'+sym+'-action');
            const sMsg = document.getElementById('p-'+sym+'-msg');
            const sGauge = document.getElementById('p-'+sym+'-gauge');

            if(gAction) { gAction.innerText = info.action; gAction.style.color = info.color; }
            if(sAction) { sAction.innerText = info.action; sAction.style.color = info.color; }
            if(sMsg) sMsg.innerText = info.msg;
            if(sGauge) { sGauge.style.width = info.level + '%'; sGauge.style.backgroundColor = info.color; }

            // Master UI (정보 중심)
            const mStatus = document.getElementById(sym+'-status');
            if(mStatus) mStatus.innerText = d.status + ' ('+d.sigCount+')';
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

server.listen(PORT, () => console.log('LANE 2 v1.1 DUAL ENGINE ONLINE'));
