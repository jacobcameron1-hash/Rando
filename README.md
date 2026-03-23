# Rando

A provably fair, non-custodial reward system for Solana token holders — powered by Bags.

---

## Builder Note

I’m a professional orchestral musician. Before this week, I had never written code or built anything on Solana.

I suggested this feature to FinnBags — and he told me to build it myself.

So I did.

Rando was built from scratch in one week as a working production system for automated, on-chain reward distribution using Bags.

This is what it looks like when the barrier to building is low enough for anyone to ship.

---

## What Rando Does

Rando turns token holders into rotating fee recipients — automatically.

Instead of manually sending rewards, Rando:

- selects a provably fair eligible wallet
- continuously validates eligibility (anti-dump protection)
- assigns that wallet to receive protocol fees via Bags

Bags handles all fee collection and distribution on-chain.

---

## 🧠 Core Concept

> One holder earns the protocol’s fees at a time.

Unlike traditional “draw every cycle” systems:

- A winner is selected once
- That winner remains active
- They accumulate fees continuously
- They are only replaced if:
  - payout threshold is reached, or
  - they become ineligible

This creates a **continuous reward stream**, not a one-off payout.

---

## ⚙️ Live Distribution Model

- **50% → Dev wallet**
- **50% → Active winner**

Rando does **not send SOL or tokens**.

It only updates the Bags fee configuration. All distribution is executed by Bags.

---

## Winner Lifecycle

A winner remains active until:

- they accumulate enough fees to reach the payout threshold, or
- they fall below the minimum token requirement (auto-disqualified)

If disqualified:

- winner is removed
- a new eligible holder is selected
- fee routing is updated

This runs continuously with no manual intervention.

---

## How It Works

1. Fetch all token holders from Solana
2. Filter holders:
   - Minimum token requirement
   - Excluded wallets
   - **System-owned wallets only (critical for Bags compatibility)**
3. Build eligible holder set
4. Select a random winner
5. Validate winner still meets requirements (anti-dump)
6. Start or continue winner cycle
7. Update Bags fee routing:
   - Dev (50%)
   - Winner (50%)
8. Bags distributes fees automatically

---

## ⚠️ Critical Design Detail

Rando **only selects system-owned wallets**:


Owner = 11111111111111111111111111111111


This ensures:

- winners are real user wallets
- Bags can use them as valid fee claimers
- program-owned accounts (PDAs, vaults) are excluded

This distinction is required for safe production operation.

---

## Core Features

- Deterministic draw scheduling (slot-based)
- Provably fair random selection
- On-chain holder snapshot + filtering
- **System wallet validation (Bags compatibility)**
- Winner validation (anti-dump protection)
- Automatic disqualification + reroll
- Winner lifecycle tracking (persistent cycle)
- Duplicate slot protection (DB-level)
- Draw locking via DB lease (Neon-safe)
- Transparent proof + history logging
- Bags-native fee routing (no custom payout logic)
- Fully **non-custodial by design**

---

## 🔐 Production Safety

- Draw execution is **POST-only**
- Requires **admin API key**
- Unsafe test flags disabled in production
- No public endpoint can trigger draws
- Duplicate slot protection prevents replay
- DB lease lock prevents concurrent execution
- Bags transactions are signed server-side only
- Only system-owned wallets can become winners

---

## API Routes

- `POST /api/proof/run-draw` → execute draw + update routing
- `GET /api/proof/history` → past draws
- `GET /api/proof/next-draw` → next scheduled draw
- `GET /api/proof/admin-config` → admin config (protected)

---

## 🔐 Environment Variables


NEXT_PUBLIC_SOLANA_RPC_URL=
BAGS_API_KEY=
SOLANA_PRIVATE_KEY=
BAGS_BASE_URL=https://public-api-v2.bags.fm/api/v1

RANDO_DEV_WALLET=
RANDO_ADMIN_API_KEY=

ALLOW_UNSAFE_DRAW_TESTS=0


⚠️ Important:

- Set `ALLOW_UNSAFE_DRAW_TESTS=1` locally only
- Keep it `0` in Vercel production/preview
- Never expose `SOLANA_PRIVATE_KEY`

---

## Architecture Notes

- **Frontend:** Next.js App Router
- **Backend:** API routes (server-side execution)
- **Database:** Neon (HTTP) + Drizzle ORM
- **Locking:** DB row lease (not advisory locks)
- **Randomness:** deterministic + reproducible
- **Execution model:** stateless-safe

---

## Phases

### Phase 1
- Draw scheduling
- Holder snapshot + filtering
- Random selection
- Proof logging

### Phase 2
- Bags integration
- Fee routing configuration

### Phase 3 (Live)
- Winner becomes fee recipient
- Persistent winner cycle (not per-draw reset)
- Bags handles all distribution
- Manual payout logic removed
- Fully non-custodial reward system

---

## Why This Matters

Traditional reward systems require:

- manual payouts
- custody of funds
- trust in a central wallet
- opaque selection processes

Rando replaces that with:

- No custody
- No manual payouts
- Continuous reward accumulation
- Fully transparent selection
- Native on-chain distribution via Bags

---

## 🛣️ Next Steps

- ⏱️ Automated scheduled draws (cron stabilization)
- 💰 Live earned fee tracking UI
- 🎯 Configurable payout thresholds
- 🔁 Real-time UI updates
- 🌐 Multi-token support
- 🧪 Public “Try your token” flow

---

