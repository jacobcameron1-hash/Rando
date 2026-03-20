# Rando

A provably fair, on-chain holder lottery for Solana tokens.

## 🚀 Phase 1 Complete

Rando is a Solana-based holder lottery app that selects a random winner from token holders at scheduled intervals.

Core features implemented:

- Deterministic draw scheduling (slot system)
- Countdown UI to next draw
- Holder snapshot + filtering
- Duplicate draw protection
- Due-time enforcement
- Random winner selection
- Proof logging system

## 🔧 How it works

1. Fetch token holders from Solana
2. Filter:
   - Minimum token requirement
   - Excluded wallets (dev / fee wallets)
3. Store a snapshot
4. Randomly select a winner
5. Save proof of the draw

## 🧪 API Routes

- `/api/proof/run-draw` → executes a draw
- `/api/proof/next-draw` → returns next scheduled draw
- `/api/proof/history` → returns past draws
- `/api/proof/create-payout-tx` → prepares payout transaction

## ⚠️ Notes

- This is a proof-of-concept for hackathon use
- Payout system is not fully implemented yet
- Focus is on fairness + verifiable selection

## 🖥 Run locally

```bash
npm install
npm run dev
🌐 Live Demo

https://rando-mu.vercel.app


---

# Step (only one)
