# Rando

A provably fair, on-chain randomized rewards system for Solana token holders.

## 🚀 Phase 1 Complete

Rando is a Solana-based system that selects a random eligible wallet from token holders at scheduled intervals.

Core features implemented:

- Deterministic draw scheduling (slot system)
- Countdown UI to next draw
- Holder snapshot + filtering
- Duplicate draw protection
- Due-time enforcement
- Random selection of eligible wallet
- Proof logging system

## 🔧 How it works

1. Fetch token holders from Solana
2. Filter:
   - Minimum token requirement
   - Excluded wallets (dev / fee wallets)
3. Store a snapshot
4. Randomly select an eligible wallet
5. Save proof of the selection

## 🧪 API Routes

- `/api/proof/run-draw` → executes a selection
- `/api/proof/next-draw` → returns next scheduled selection
- `/api/proof/history` → returns past selections
- `/api/proof/create-payout-tx` → prepares payout transaction

## ⚠️ Notes

- This is a proof-of-concept for hackathon use
- Payout system is not fully implemented yet
- Focus is on fairness + verifiable selection

## 🖥 Run locally

```bash
npm install
npm run dev

## Phase 2 Complete ✅

Rando now supports:
- On-chain holder snapshot + fair winner selection
- Automated Bags fee configuration
- Vault-based fee collection
- Fee claiming + payout execution (SOL transfers)

This marks the first fully automated end-to-end draw + payout system.