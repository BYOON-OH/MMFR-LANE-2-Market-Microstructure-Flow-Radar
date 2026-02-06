# MMFR LANE 2  
### Market Microstructure Flow Radar

> **Real-time crypto market observation engine**  
> Focused on liquidity behavior, orderflow anomalies, and derivatives-driven market dynamics.

---

## 🧠 Philosophy

> **Retail traders try to predict price.  
> Institutions control liquidity.**

MMFR LANE 2 is built to observe **what large players are doing**,  
not to guess where price *should* go.

This project prioritizes **market structure, capital flow, and behavior**  
over indicators, predictions, or signals.

> **Survival > Precision**

---

## 🎯 What This Project Is

MMFR LANE 2 is a **real-time orderflow & liquidity observation engine** designed to:

- Monitor **large order behavior**
- Detect **liquidity sweeps and absorption**
- Observe **derivatives-led market control**
- Classify the current **market state**

It answers one core question:

> **“Who is acting, and why?”**

---

## 🚫 What This Project Is NOT

- ❌ No buy / sell signals  
- ❌ No automated trading  
- ❌ No strategy optimization  
- ❌ No API keys or private credentials  

> This tool **does not trade for you**.  
> Interpretation and decision-making remain the user's responsibility.

---

## 🧩 Core Observations

MMFR LANE 2 continuously monitors:

### 🔹 Liquidity Behavior
- Stop-loss hunting
- False breakouts
- Edge-level sweep detection

### 🔹 Absorption
- Large volume with minimal price movement
- Passive defense by large participants

### 🔹 Algorithmic Execution
- TWAP / VWAP-style rhythmic execution
- Low-variance time-interval detection

### 🔹 Derivatives Control
- Open Interest expansion vs price displacement
- Futures-led market pressure

---

## 🧭 Market State Classification

The engine classifies the market into behavioral regimes:

| State | Meaning |
|------|--------|
| **OBSERVE-MODE** | No clear institutional intent |
| **ACCUMULATION** | Quiet positioning, low volatility |
| **LIQUIDITY SWEEP** | Retail stops harvested |
| **EXPANSION** | Volatility already released |
| **DISTRIBUTION** | Exit liquidity, chase forbidden |

> These are **contextual states**, not trade instructions.

---

## 🖥️ Interface Design

MMFR LANE 2 provides **two distinct views**:

### 🔷 MASTER MODE
- Raw information
- Real-time orderflow feed
- Signal-level transparency

### 🛡️ PROTECTOR MODE
- Behavior-centric interpretation
- Risk-first messaging
- Designed to reduce emotional decision-making

---

## 🏗️ Architecture

**Backend**
- Node.js
- WebSocket (Binance Futures)
- REST polling (Klines, Open Interest)

**Frontend**
- Real-time dashboard
- Socket.io event-driven updates
- Dual UI mode (MASTER / PROTECTOR)

---

## ⚠️ Disclaimer

This project is provided for **educational and research purposes only**.

- No financial advice
- No guarantee of profitability
- Trading involves risk

> If you lose money, it is not because of this code.  
> Markets are adversarial by nature.

---

## 📜 License

MIT License

Use freely.  
Modify responsibly.  
Trade at your own risk.

---

## 🧠 Final Note

> **The top 1% are not those who predict correctly,  
> but those who avoid catastrophic mistakes.**

MMFR LANE 2 exists to help you **see**,  
not to tell you what to do.

---
