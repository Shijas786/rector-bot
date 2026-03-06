# 🤖 Rector Predictor

**An AI assistant that analyses Binance markets, sends smart alerts, and verifies predictions onchain — so your accuracy is proven forever.**

Built for the **BNB Chain AI Agent Hackathon** using [Rector](https://rector.ai) + [BNB Chain MCP](https://github.com/bnb-chain/bnbchain-mcp).

---

## ⚡ What It Does

| Feature | Description |
|---|---|
| **AI Market Analysis** | `/analyse BNB` — real-time Binance data + GPT-4o insights |
| **Prediction Verification** | `/predict BNB hits $1000` — recorded & verified onchain BSC |

## 🏗 Architecture

```
Telegram → Rector → Agent Pipeline
                         │
    ┌────────────────────┼────────────────────┐
    ▼                                         ▼
  Analyse                                  Predict
  Binance API                              GPT-4o → Greenfield → BSC
  + GPT-4o                                 + BullMQ auto-resolve
```

## 📁 Project Structure

```
├── contracts/          ← PredictionRegistry.sol (Hardhat)
├── rector/             ← Gateway config + SOUL.md
├── agent/              ← TypeScript pipeline (OpenAI, MCP, BullMQ)
├── frontend/           ← Next.js 14 explorer (5 pages)
└── .env.example        ← Environment variables
```

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 18
- PostgreSQL
- Redis
- BNB testnet wallet with test BNB

### 1. Clone & Install

```bash
# Install contract dependencies
cd contracts && npm install

# Install agent dependencies
cd ../agent && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your keys
```

### 3. Deploy Contract

```bash
cd contracts
npx hardhat run scripts/deploy.ts --network bscTestnet
# Copy the address to .env → PREDICTION_REGISTRY_ADDRESS
```

### 4. Setup Rector

```bash
npm install -g rector@latest
rector onboard --install-daemon
rector channels login
npx skills add bnb-chain/bnbchain-skills
```

### 5. Start Agent

```bash
cd agent
npm run prisma:push   # Create database tables
npm run dev            # Start agent
```

### 6. Start Frontend

```bash
cd frontend
npm run dev            # http://localhost:3000
```

### 7. Start Rector Gateway

```bash
rector gateway --port 18789
```

## 📱 Bot Commands

| Command | Description |
|---|---|
| `/analyse [token]` | AI market analysis |
| `/predict [claim]` | Submit a prediction |
| `/mystats` | Your prediction history |
| `/check [id]` | Check prediction status |
| `/help` | All commands |

## 🔗 Links

- [Rector](https://rector.ai) — Agent framework
- [BNB Chain MCP](https://github.com/bnb-chain/bnbchain-mcp) — BSC tools
- [BSC Testnet Faucet](https://testnet.bnbchain.org/faucet-smart) — Get test BNB
- [ERC-8004 Registry](https://www.8004scan.io/) — Agent identity

## 💰 Monthly Costs

| Service | Cost |
|---|---|
| Rector + MCP + Binance API | Free |
| OpenAI GPT-4o | ~$5/mo |
| Railway (Worker + Web + DB + Redis) | ~$5/mo |
| **Total** | **~$10/mo** |

---

*Built with ⚡ for the BNB Chain AI Agent Hackathon*
