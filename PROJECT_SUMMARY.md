# Rando — Project Summary

Rando is a Solana-based holder lottery that fairly selects a random winner from token holders at scheduled intervals.

## Problem

Token communities want fair, transparent ways to reward holders — but most giveaways are manual, opaque, or biased.

## Solution

Rando provides:

- Deterministic draw timing
- On-chain holder snapshots
- Rule-based filtering
- Verifiable winner selection
- Proof logging for transparency

## Current Status

Phase 1 complete:

- Draw scheduling system
- Countdown UI
- Holder filtering
- Duplicate protection
- Proof logging

## Next Steps

- Automated payout system
- Revenue/fee logic
- On-chain verification layer
- Public trust dashboard

## Tech Stack

- Next.js
- Solana RPC (Helius)
- TypeScript
- Vercel

## Key Endpoint

`/api/proof/run-draw`

This executes a full draw:
- fetch holders
- filter eligibility
- pick winner
- store proof