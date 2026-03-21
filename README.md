# Rando

A provably fair, on-chain randomized rewards system for Solana token holders — powered by Bags.

---

## Builder Note

I’m a professional orchestral musician. Before this week, I had never written code or built anything on Solana.

I suggested this feature to FinnBags — and he told me to build it myself.

So I did.

Rando was built from scratch over the past week as a proof-of-concept for automated, on-chain reward distribution using Bags. Everything in this project — APIs, Solana interactions, and protocol integration — was learned and implemented during that process.

This is what it looks like when the barrier to building is low enough for anyone to ship.

---

## What Rando Does

Rando allows token projects to automatically distribute a portion of their Bags-generated fees to randomly selected eligible holders.

Instead of manually sending rewards, Rando:

* selects a random eligible wallet
* updates Bags fee routing
* lets Bags handle payout distribution on-chain

No custody. No manual payouts. Fully transparent.

---

## ⚙️ Current Live Behavior

- **50% → Dev wallet**
- **50% → Current winner**

Each draw:

* selects a new eligible holder
* replaces the previous winner
* updates Bags fee configuration on-chain
* routes all future fees to the new winner automatically

---

## How It Works

1. Fetch all token holders from Solana
2. Filter holders:

   * Minimum token requirement
   * Excluded wallets (dev / fee wallets)
3. Generate a snapshot of eligible wallets
4. Randomly select a winner
5. Validate winner still meets requirements (anti-dump protection)
6. Update Bags fee configuration:

   * Dev (50%)
   * Winner (50%)
7. Bags distributes rewards automatically through its fee system

---

## Core Features

* Deterministic draw scheduling (slot system)
* Provably fair random selection
* On-chain holder snapshot + filtering
* Duplicate draw protection
* Winner validation (anti-dump)
* Transparent proof + history tracking
* Bags fee routing integration
* No manual payout logic (Bags-managed distribution)

---

## API Routes

* `/api/proof/run-draw` → executes a draw and updates fee routing
* `/api/proof/next-draw` → returns next scheduled draw
* `/api/proof/history` → returns past draws

---

## 🔐 Environment Variables


NEXT_PUBLIC_SOLANA_RPC_URL=
BAGS_API_KEY=
SOLANA_PRIVATE_KEY=
BAGS_PAYER_WALLET=
BAGS_BASE_URL=https://public-api-v2.bags.fm/api/v1

RANDO_DEV_WALLET=


---

## Phases

### Phase 1

* Draw scheduling system
* Holder snapshot + filtering
* Random winner selection
* Proof logging

### Phase 2

* Bags integration
* Vault-based fee routing
* Claim + payout execution (manual flow)

### Phase 3 (Current)

* Winner becomes fee recipient directly
* Bags handles reward distribution
* Manual payout logic removed
* Fully trust-minimized reward flow

---

## Why This Matters

Traditional reward systems require:

* manual payouts
* trust in a central wallet
* opaque selection processes

Rando removes all of that.

* Selection is transparent
* Distribution is handled by Bags
* No funds are held or manually sent by the app

---

## 🛣️ Next Steps

* ⏱️ Automated scheduled draws (cron)
* 💰 Claimable fee tracking (dashboard)
* 🎯 Minimum payout threshold logic
* 🎉 Live UI updates + animations
* 🌐 Multi-token support

---

## Run Locally

```bash
npm install
npm run dev
Status

Hackathon proof-of-concept — built and shipped in one week.


---

## 🚀 Next step — push to GitHub

Run this:

```bash
git add .
git commit -m "Rando: working 50/50 Bags winner rotation + updated README"
git push