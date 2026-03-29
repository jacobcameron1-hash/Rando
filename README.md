# Rando

A provably fair, non-custodial reward system for Solana token holders.

---

## Builder Note

I’m a professional orchestral musician. Before this week, I had never written code or built anything on Solana.

I suggested this feature to FinnBags — and he told me to build it myself.

So I did.

Rando was built from scratch in one week as a working production system for automated, on-chain reward distribution.

This is what it looks like when the barrier to building is low enough for anyone to ship.

---

## What Rando Does

Rando selects a token holder and routes protocol rewards to them.

* A winner is chosen from eligible holders
* Rewards accumulate over time
* When conditions are met, payout is executed
* A new winner is selected

This runs continuously with no manual intervention.

---

## 🧠 Core Concept

> Hourly draws — rewards accumulate until payout, and the winner gets it all.

Instead of isolated draws:

* A winner is selected
* Rewards accumulate during their cycle
* The cycle continues until payout conditions are met
* Then a new winner is selected

This creates a **continuous reward system**, not one-off distributions.

---

## ⚙️ Distribution Model

* **50% → Dev wallet**
* **50% → Active winner**

Rewards are sourced from protocol activity.

Rando:

* tracks accumulation
* determines when payout should occur
* executes payout when conditions are met
* rotates the winner

---

## Winner Lifecycle

A winner remains active until:

* payout threshold is reached, or
* they fall below the minimum token requirement (auto-disqualified)

### If threshold is reached:

* payout is executed
* winner cycle completes
* a new winner is selected

### If disqualified:

* winner is removed
* a new eligible holder is selected
* accumulation continues under new winner

---

## How It Works

1. Fetch all token holders from Solana
2. Filter holders:

   * Minimum token requirement
   * Excluded wallets
   * **System-owned wallets only**
3. Build eligible holder set
4. Select a random winner (provably fair)
5. Validate eligibility (anti-dump protection)
6. Track reward accumulation
7. Evaluate cycle state:

   * continue accumulating
   * rotate winner
   * execute payout
8. Persist results + proof history

---

## ⚠️ Critical Design Detail

Rando **only selects system-owned wallets**:

```
Owner = 11111111111111111111111111111111
```

This ensures:

* winners are real user wallets
* avoids program-owned accounts (PDAs, vaults)
* prevents invalid payout targets

---

## Core Features

* Deterministic draw scheduling
* Provably fair random selection
* On-chain holder snapshot + filtering
* System wallet validation
* Winner validation (anti-dump protection)
* Automatic disqualification + reroll
* Persistent winner cycle (not per-draw reset)
* Threshold-based payout execution
* Duplicate draw protection
* DB locking (safe concurrent execution)
* Transparent proof + history logging

---

## 🔐 Production Safety

* Draw execution is **POST-only**
* Requires **admin API key**
* No public endpoint can trigger draws
* Duplicate slot protection prevents replay
* DB lease lock prevents concurrent execution
* Payout execution is server-side only
* Only valid wallets can receive rewards

---

## API Routes

* `POST /api/proof/run-draw` → run draw / cycle step
* `GET /api/proof/history` → past draws
* `GET /api/proof/next-draw` → next scheduled draw
* `GET /api/proof/admin-config` → config (protected)

---

## 🔐 Environment Variables

```
NEXT_PUBLIC_SOLANA_RPC_URL=
BAGS_API_KEY=
SOLANA_PRIVATE_KEY=
BAGS_BASE_URL=https://public-api-v2.bags.fm/api/v1

RANDO_DEV_WALLET=
RANDO_ADMIN_API_KEY=

ALLOW_UNSAFE_DRAW_TESTS=0
```

⚠️ Important:

* Set `ALLOW_UNSAFE_DRAW_TESTS=1` locally only
* Keep it `0` in production
* Never expose `SOLANA_PRIVATE_KEY`

---

## Architecture

* **Frontend:** Next.js
* **Backend:** API routes
* **Database:** Neon + Drizzle
* **Locking:** DB lease system
* **Execution model:** stateless-safe
* **Randomness:** deterministic + reproducible

---

## Why This Matters

Traditional reward systems require:

* manual payouts
* custody of funds
* trust in a central operator

Rando replaces that with:

* automated execution
* no custody
* transparent selection
* continuous reward accumulation

---

## 🛣️ Next Steps

* ⏱️ Cron reliability / scheduling stabilization
* 💰 Live reward tracking UI
* 🎯 Configurable payout thresholds
* 🔁 Real-time UI updates
* 🌐 Multi-token support
* 🧪 Public “try your token” flow

---
