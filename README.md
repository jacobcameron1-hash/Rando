# Rando

Automated holder lotteries for bags.fm tokens. Trading fees accumulate into a prize pool and a randomly selected eligible holder wins on a configurable progressive timer.

## Features

- Self-serve setup wizard
- Configurable eligibility thresholds
- Progressive draw intervals
- Fully automated fee claiming and prize distribution
- Admin lock (irreversible)

## Stack

- Next.js 14 App Router
- Drizzle ORM + Neon Postgres
- Solana wallet adapter (Phantom, Solflare, Backpack)
- bags.fm Fee Share V2 SDK
- Vercel Cron Jobs
