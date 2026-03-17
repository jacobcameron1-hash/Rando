# Rando Project — Session Handoff
_Last updated: 2026-03-16_

---

## 1. CLAUDE-MEM CONNECTION

**Before doing anything else**, connect to persistent memory:

1. The persistent DB is at: `/sessions/<SESSION_NAME>/mnt/Claude/.claude-mem/claude-mem.db`
2. The home DB (what the worker actually uses) is at: `~/.claude-mem/claude-mem.db`
3. On every new session, the VM resets. **Copy the persistent DB to home at session start:**

```python
import sqlite3
src = '/sessions/<SESSION_NAME>/mnt/Claude/.claude-mem/claude-mem.db'
dst = '/root/.claude-mem/claude-mem.db'  # or ~/.claude-mem/ — check $HOME

# Remove any stale WAL/SHM first
import os
for f in [dst, dst+'-wal', dst+'-shm']:
    try: os.remove(f)
    except: pass

src_conn = sqlite3.connect(src)
dst_conn = sqlite3.connect(dst)
src_conn.backup(dst_conn)
src_conn.close(); dst_conn.close()
```

> **CRITICAL**: Use `sqlite3.backup()` — NOT `shutil.copy()`. The mounted folder uses FUSE
> (OneDrive via virtiofs) and direct file copies get corrupted. The backup API handles this.

4. After copying, **restart the claude-mem worker**:
```bash
pkill -9 -f worker-service.cjs 2>/dev/null; sleep 1; rm -f ~/.claude-mem/worker.pid
nohup /sessions/<SESSION_NAME>/.bun/bin/bun \
  /sessions/<SESSION_NAME>/mnt/.local-plugins/cache/thedotmack/claude-mem/10.5.5/scripts/worker-service.cjs \
  --daemon > /tmp/worker.log 2>&1 &
sleep 6 && curl -s http://127.0.0.1:37777/health
```

5. **Set up sync-back loop** (so observations survive session end):
```bash
cat << 'SYNC' > ~/.claude-mem/sync-loop.sh
#!/bin/bash
while true; do
  sleep 300
  python3 -c "
import sqlite3, os
src = os.path.expanduser('~/.claude-mem/claude-mem.db')
dst = '/sessions/<SESSION_NAME>/mnt/Claude/.claude-mem/claude-mem.db'
src_c = sqlite3.connect(src); dst_c = sqlite3.connect(dst)
src_c.backup(dst_c); src_c.close(); dst_c.close()
" 2>/dev/null
done
SYNC
chmod +x ~/.claude-mem/sync-loop.sh
nohup bash ~/.claude-mem/sync-loop.sh > /tmp/sync-loop.log 2>&1 &
```

> Replace `<SESSION_NAME>` with the current session name (check `$HOME` — it will be `/sessions/<name>`).

6. **Search memory to restore context:**
```
Use mcp__plugin_claude-mem_mcp-search__search with query: "Rando project"
```

---

## 2. MOUNTED FOLDERS

| Path | Contents |
|------|----------|
| `/sessions/<S>/mnt/Rando/` | The Rando git repo (Next.js app + coin site + bot) |
| `/sessions/<S>/mnt/Claude/` | Claude parent folder on user's OneDrive |
| `/sessions/<S>/mnt/Claude/Rando/` | Additional Rando assets (this file, etc.) |
| `/sessions/<S>/mnt/Claude/.claude-mem/` | Persistent claude-mem DB |

_Where `<S>` = current session name from `$HOME`_

---

## 3. PROJECT OVERVIEW

**Rando** is a Solana memecoin ($RANDO) with an automated holder lottery system.

| Component | URL | Deploy method |
|-----------|-----|---------------|
| Next.js app | https://rando-mu.vercel.app | Git push → Vercel auto-deploys |
| Coin website | https://randocoin.netlify.app | Drag-and-drop `coin-site/index.html` to Netlify |
| Bot | (not yet deployed) | DigitalOcean droplet, see `bot/SETUP.md` |

**GitHub repo**: `jacobcameron1-hash/Rando` (private)
**Local path**: `C:\Users\jacob\OneDrive\Desktop\Claude\Rando`
**Vercel plan**: Hobby (cron max once/day)

---

## 4. KEY FILE PATHS (in repo)

```
Rando/
├── src/app/
│   ├── page.tsx                        # Landing page
│   ├── setup/page.tsx                  # Setup wizard (Step 1-4)
│   ├── dashboard/[id]/page.tsx         # Project dashboard (payout summary, embed widget, share)
│   ├── timer/[id]/
│   │   ├── page.tsx                    # Shareable timer page (OG meta tags for X)
│   │   └── TimerClient.tsx             # Client-side countdown component
│   ├── api/
│   │   ├── og/route.tsx                # Dynamic OG image (1200×630) for /timer pages
│   │   ├── projects/[id]/route.ts      # Main project state API
│   │   └── cron/check-draws/route.ts   # Cron job — fires draws
│   ├── globals.css                     # Theme: coral #D93A28, gold #C89800
│   └── layout.tsx
├── coin-site/
│   └── index.html                      # Static coin website (deploy via Netlify drag-drop)
├── bot/
│   ├── rando_bot.py                    # Python lottery bot
│   ├── SETUP.md                        # DigitalOcean deployment guide
│   ├── config.example.json
│   └── requirements.txt
├── vercel.json                         # Cron: "0 0 * * *" (daily, Hobby compatible)
└── .env.local                          # NOT committed — see Vercel dashboard for vars
```

---

## 5. CHANGES MADE — VERCEL APP (rando-mu.vercel.app)

### Session 1 (earlier — fervent-zen-tesla)
- **Branding**: `globals.css` — coral `#D93A28`, gold `#C89800`, Space Mono + Playfair Display
- **Setup wizard**: `setup/page.tsx` — Step 4 now shows config summary table (`SummaryRow` component)
- **Cross-links**: App links to coin site; coin site links to app
- **PercentInput component**: custom React input with variable step sizes (below 1% = 0.1 steps, 1-2% = 0.25 steps, above 2% = 0.5 steps)
- **formatInterval**: smart unit display (90min → 1.5h, etc.)
- **Wallet adapter**: removed Backpack (not in current package), kept Phantom + Solflare

### Session 2 (this session — bold-festive-lovelace)
- **`dashboard/[id]/page.tsx`**: Added `PayoutSummary` component, embed widget with copyable script, "Share on 𝕏" button
- **`src/app/timer/[id]/page.tsx`**: NEW — shareable timer page with OG/Twitter card meta tags
- **`src/app/timer/[id]/TimerClient.tsx`**: NEW — live countdown client component
- **`src/app/api/og/route.tsx`**: NEW — edge-runtime OG image endpoint (1200×630 branded image)
- **`vercel.json`**: Cron changed `0 0 * * *` → `* * * * *` → back to `0 0 * * *` (Hobby plan only supports daily)
- **`.gitignore`**: Added `Coin files/`, `.claude/`, `*.credentials.json`

### Git commit history (most recent first)
```
d4caecf  Revert cron to daily schedule (Hobby plan compatible)   ← CURRENT HEAD
74ded75  Fix cron schedule to hourly (Hobby plan compatible)      ← intermediate (bad)
4d97fd8  Remove accidentally committed Coin files directory
529c407  Update .gitignore
376c3bb  Add timer sync, OG image, shareable timer page, embed widget, and bot
458456c  Fix sliders and percent input
9e9392c  Smart stepping for intervals and percent input
ab4882d  Smart interval formatting on sliders
5f2f350  Fix wallet adapter
455dab3  Update cron and readme
5a17af5  Trigger deploy
fc0975b  Initial commit
```

> **NOTE**: Commits `376c3bb` through `74ded75` all had `"* * * * *"` cron, which **silently
> blocked every Vercel build** on the Hobby plan. `d4caecf` fixes this. The timer routes
> (`/timer/[id]` and `/api/og`) have **never successfully deployed** yet.
> After pushing `d4caecf`, verify at: https://rando-mu.vercel.app/timer/test

---

## 6. CHANGES MADE — COIN WEBSITE (randocoin.netlify.app)

File: `coin-site/index.html` — deployed by dragging to Netlify (no git).

### Changes made:
- **Timer sync**: Added `PROJECT_API_URL` constant + `fetchProjectState()` function that pulls live draw state from the Next.js app API (`/api/projects/[id]`). Coin site is now a consumer of the app's authoritative timer, not an independent clock.
- **TX reserve**: Added `TX_RESERVE_SOL = 0.1`. Pot display subtracts 0.1 SOL before showing.
- **`applyProjectState(state)`**: Updates countdown, interval display, pot balance, winners feed, and "How It Works" step text dynamically from API data.
- **Step IDs**: Added `id="step-hold"` and `id="step-draw"` to How It Works elements.
- **Cross-links**: "Launch Rando for your token →" CTA links to https://rando-mu.vercel.app

### Placeholders still needing real values:
```
REPLACE_WITH_CONTRACT_ADDRESS     (line ~865, inside <span id="ca-text">)
REPLACE_WITH_BAGS_BUY_URL         (hero buy button + footer nav)
REPLACE_WITH_DEXSCREENER_URL      (footer nav)
REPLACE_WITH_PROJECT_ID           (in PROJECT_API_URL constant)
```
Also set `LIVE_MODE = true` once token is live.

---

## 7. BOT (not yet deployed)

- File: `bot/rando_bot.py`
- Guide: `bot/SETUP.md` — full DigitalOcean droplet setup instructions
- `TX_RESERVE_LAMPORTS = 100_000_000` (0.1 SOL)
- Needs: contract address, project ID, `.env` file with keys from Vercel dashboard

---

## 8. PENDING TASKS

1. **Verify timer routes deploy** — after pushing `d4caecf`, check https://rando-mu.vercel.app/timer/test goes live
2. **Launch token** — get contract address, bags buy URL, Dexscreener URL
3. **Fill coin-site placeholders** — 4 values above, then drag-drop updated index.html to Netlify
4. **Set LIVE_MODE = true** in coin-site/index.html
5. **Deploy bot** — follow `bot/SETUP.md` on a DigitalOcean droplet
6. **Verify Vercel Pro** when ready for production (enables per-minute cron draws)

---

## 9. IMPORTANT NOTES

- **Git commits**: OneDrive locks `.git/index.lock`. Cannot commit from Linux VM reliably. Use **GitHub Desktop** on Windows. Delete `index.lock` first if it exists.
- **node_modules on FUSE**: Can't run `npm install` in the mounted Rando folder — FUSE errors. Don't try to build locally from the VM.
- **Vercel plan**: Hobby. Cron must stay at `"0 0 * * *"`. Upgrade to Pro for per-minute draws in production.
- **bags.fm**: No IP allowlisting required. BAGS_PARTNER_KEY is for token creation revenue sharing, NOT used in fee-share update calls.
- **DB migration**: Run directly in Neon SQL Editor (not via CLI).
