# 🤖 Rector Oracle (OpenClaw Agent)

**An OpenClaw AI assistant for Agentic Verification. We resolve prediction markets, bounties, and complex claims onchain using automated verification runbooks.**

Built for the **BNB Chain AI Agent Hackathon** using [OpenClaw](https://github.com/bnb-chain/openclaw) + [BNB Chain MCP](https://github.com/bnb-chain/bnbchain-mcp).

---

## ⚡ What It Does (Agentic Verification)

Most Oracles (like Chainlink) only handle simple price feeds. **Rector Oracle** uses OpenClaw to handle complex, real-world claims (e.g., *"Did user @abc merge their PR to the bnb-chain repo?"* or *"Did BNB flip ETH in market cap?"*). 

| Feature | Description |
|---|---|
| **Claim Disambiguation** | `/predict [claim]` — The agent analyzes the claim, identifies requirements, and generates a **Verification Runbook**. |
| **Agentic Execution** | On the resolution date, OpenClaw executes the runbook, querying APIs (Binance, GitHub, etc.) to evaluate the truth. |
| **Onchain Attestation** | The outcome, cited evidence, and cryptographic signature are stored on **BNB Greenfield** and attested on **BSC**. |

Smart contracts can instantly consume these attestations to resolve prediction markets, release escrow bounties, or execute wills.

## 🏗 Architecture

```
User Claim → OpenClaw Agent (Rector)
                          │
     ┌────────────────────┼────────────────────┐
     ▼                    ▼                    ▼
 Disambiguate        Agentic Verify      Onchain Attest
 (GPT-4o)          (Binance API/Web)    (Greenfield + BSC)
```

## 📁 Project Structure

```
├── contracts/          ← PredictionRegistry.sol (Hardhat)
├── rector/             ← OpenClaw Gateway config
├── agent/              ← TypeScript verification pipeline (OpenAI, MCP, BullMQ)
├── frontend/           ← Next.js 14 Explorer (Inspired by Conductor.my)
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

### 4. Setup Rector / OpenClaw

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

### 6. Start Frontend Explorer

```bash
cd frontend
npm run dev            # http://localhost:3000
```

### 7. Start Agent Gateway

```bash
rector gateway --port 18789
```

## 📱 OpenClaw Bot Commands

| Command | Description |
|---|---|
| `/predict [claim]` | Submit a claim for runbook generation |
| `/analyse [token]` | AI market monitoring (Trading Tool) |
| `/mystats` | Your verification history |
| `/check [id]` | Check claim resolution status |

## 🔗 Hackathon Fit

This project addresses the **Smart Operations** and **Trading & Strategy Tools** tracks by providing an autonomous OpenClaw agent that can verify trading claims and automate smart contract operations/escrow.

## 💰 Monthly Costs

| Service | Cost |
|---|---|
| Rector + MCP + Binance API | Free |
| OpenAI GPT-4o | ~$5/mo |
| Railway (Worker + Web + DB + Redis) | ~$5/mo |
| **Total** | **~$10/mo** |

---

*Built with ⚡ for the BNB Chain AI Agent Hackathon*
