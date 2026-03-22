# Rando

A provably fair, non-custodial rewards system for Solana token holders — built on top of Bags.

---

## Builder Note

I’m a professional orchestral musician. Before this week, I had never written code or built anything on Solana.

I suggested this feature to FinnBags — and he told me to build it myself.

So I did.

Rando was built from scratch in one week as a working proof-of-concept for automated, on-chain reward distribution using Bags. Everything in this project — APIs, Solana interactions, and protocol integration — was learned and implemented during that process.

This is what it looks like when the barrier to building is low enough for anyone to ship.

---

## What Rando Does

Rando automates holder rewards using Bags fee infrastructure — without ever taking custody of funds.

Instead of manually sending rewards, Rando:

- selects a provably fair eligible wallet
- continuously validates eligibility (anti-dump protection)
- updates Bags fee routing to the active winner

Bags handles all fee collection and payouts on-chain.

---

## ⚙️ Live Distribution Model

- **50% → Dev wallet**
- **50% → Active winner**

Rando does **not send tokens or SOL**.

It only updates the Bags fee configuration. All distribution is executed by Bags.

---

## Winner Lifecycle

Each winner remains active until:

- they accumulate enough fees to reach the payout threshold, or
- they fall below the minimum token requirement (auto-disqualified)

If disqualified:
- winner is removed
- a new eligible holder is selected
- fee routing is updated

No manual intervention required.

---

## How It Works

1. Fetch all token holders from Solana
2. Filter holders:
   - Minimum token requirement
   - Excluded wallets (dev / system)
3. Build eligible holder set
4. Select a random winner
5. Validate winner still meets requirements (anti-dump)
6. Set Bags fee routing:
   - Dev (50%)
   - Winner (50%)
7. Bags distributes fees automatically

---

## Core Features

- Deterministic draw scheduling (slot-based)
- Provably fair random selection
- On-chain holder snapshot + filtering
- Winner validation (anti-dump protection)
- Automatic disqualification + reroll
- Winner lifecycle tracking
- Duplicate draw protection
- Transparent proof + history logging
- Bags-native fee routing (no custom payout logic)
- **Non-custodial by design**

---

## 🔐 Production Safety

- Draw execution is **POST-only** (no accidental browser triggers)
- Requires **admin API key** to run draws
- No public endpoint can trigger payouts
- Bags transactions are signed server-side only

---

## API Routes

- `/api/proof/run-draw` → executes draw + updates Bags routing (POST only)
- `/api/proof/next-draw` → returns next scheduled draw
- `/api/proof/history` → returns past draws

---

## 🔐 Environment Variables


NEXT_PUBLIC_SOLANA_RPC_URL=
BAGS_API_KEY=
SOLANA_PRIVATE_KEY=
BAGS_PAYER_WALLET=
BAGS_BASE_URL=https://public-api-v2.bags.fm/api/v1

RANDO_DEV_WALLET=
RANDO_ADMIN_API_KEY=


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
- Claim + payout execution

### Phase 3 (Current)
- Winner becomes fee recipient
- Bags handles all distribution
- Manual payout logic removed
- Fully non-custodial reward system

---

## Why This Matters

Traditional reward systems require:
- manual payouts
- trust in a central wallet
- opaque selection processes

Rando removes all of that:

- No custody of funds
- No manual payouts
- Fully transparent selection
- Native integration with Bags fee system

---

## 🛣️ Next Steps

- ⏱️ Automated scheduled draws (cron)
- 💰 Live claimable fee tracking UI
- 🎯 Configurable payout thresholds
- 🎉 Real-time UI updates
- 🌐 Multi-token support

---

## Run Locally

```bash
npm install
npm run dev
Status

Hackathon proof-of-concept — built and shipped in one week.


---

## GitHub push steps

```bash
git add README.md
git commit -m "Upgrade README for hackathon"
git push origin main