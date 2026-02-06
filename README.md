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

mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm


# MMFR LANE 2  
### Market Microstructure Flow Radar

> **실시간 암호화폐 시장 관측 엔진**  
> 유동성, 오더플로우, 파생상품 주도의 시장 행동을 분석합니다.

---

## 🧠 프로젝트 철학

> **개인은 가격을 예측하려 하고  
> 기관은 유동성을 통제합니다.**

MMFR LANE 2는  
“가격이 어디로 갈까?”를 묻지 않습니다.

이 프로젝트의 목적은 단 하나입니다.

> **지금 시장에서 누가, 어떤 행동을 하고 있는가**

정확도보다 **생존**,  
속도보다 **맥락**을 우선합니다.

---

## 🎯 이 프로젝트는 무엇인가

MMFR LANE 2는 다음을 관측하기 위한  
**실시간 오더플로우 & 유동성 분석 엔진**입니다.

- 고래 및 대형 자금의 주문 흐름
- 손절 유도(유동성 사냥) 패턴
- 가격 방어 및 물량 흡수
- 파생상품(Open Interest) 기반 시장 압력
- 시장 국면(State) 분류

> 이 도구는 **매매를 대신하지 않습니다.**  
> 판단은 항상 사용자 몫입니다.

---

## 🚫 이 프로젝트가 아닌 것

- ❌ 매수/매도 신호 제공 ❌  
- ❌ 자동매매 ❌  
- ❌ 수익 보장 ❌  
- ❌ API 키 / 계정 연동 ❌  

> MMFR LANE 2는 **관측 도구**이지  
> “정답을 알려주는 도구”가 아닙니다.

---

## 🧩 핵심 관측 요소

### 🔹 유동성 사냥 (Liquidity Sweep)
- 전고/전저에서 발생하는 대형 체결
- 개인 손절 물량 회수 구간 포착

### 🔹 물량 흡수 (Absorption)
- 대량 거래에도 가격이 움직이지 않는 구간
- 기관의 방어적 포지셔닝

### 🔹 알고리즘 매매 흔적
- 일정한 리듬의 반복 주문
- TWAP / VWAP 스타일 실행 패턴

### 🔹 파생상품 주도 흐름
- Open Interest 증가 vs 가격 변위
- 현물보다 선물이 시장을 끌고 가는 구간

---

## 🧭 시장 상태 분류

MMFR LANE 2는 시장을 다음과 같이 **행동 기반 국면**으로 분류합니다.

| 상태 | 의미 |
|----|----|
| **OBSERVE-MODE** | 명확한 의도 없음 |
| **ACCUMULATION** | 조용한 매집 |
| **LIQUIDITY SWEEP** | 손절 회수 완료 |
| **EXPANSION** | 변동성 이미 분출 |
| **DISTRIBUTION** | 추격 금지 구간 |

> 이는 **진입 신호가 아니라 환경 설명**입니다.

---

## 🖥️ 인터페이스 구조

### 🔷 MASTER MODE
- 원시 데이터 중심
- 오더플로우 실시간 피드
- 정보 투명성 극대화

### 🛡️ PROTECTOR MODE
- 행동 중심 해석
- 감정적 진입 방지
- “하지 말아야 할 이유”를 보여주는 UI

---

## 🏗️ 기술 스택

**Backend**
- Node.js
- WebSocket (Binance Futures)
- REST API (Klines, Open Interest)

**Frontend**
- Socket.io 기반 실시간 UI
- 듀얼 모드 인터페이스
- 상태(State) 기반 시각화

---

## ⚠️ 면책 조항

본 프로젝트는 **연구 및 학습 목적**으로 제공됩니다.

- 투자 조언 아님
- 수익 보장 없음
- 모든 거래 책임은 사용자 본인에게 있음

> 손실의 원인은 코드가 아니라  
> 시장의 구조적 특성입니다.

---

## 📜 라이선스

MIT License

- 자유롭게 사용 가능
- 수정 및 확장 허용
- 책임은 사용자에게 있음

---

## 🧠 마지막으로

> **상위 1%는 맞추는 사람이 아니라  
> 끝까지 살아남는 사람입니다.**

MMFR LANE 2는  
당신이 **판단할 수 있도록 돕는 도구**입니다.

---
