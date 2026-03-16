# RANDO Bot — Setup Guide

## What this does
Runs continuously on a server. Every draw interval it:
1. Picks a random eligible $RANDO holder (≥ 0.25% supply, held ≥ 1 hr without selling)
2. Sends 33% of the dev wallet's SOL to the winner
3. Sends 33% to your ops wallet
4. Uses the remaining 33% to buy back $RANDO via Jupiter

Draw intervals: 20 min → 40 min → 60 min → … → 6 hrs (caps there permanently)

---

## Step 1 — Get a DigitalOcean Droplet

1. Go to https://digitalocean.com and create an account
2. Create a new Droplet:
   - Image: **Ubuntu 24.04**
   - Size: **$6/month Basic** (plenty of power for this)
   - Region: anything close to you
3. Once created, click your droplet and copy the **IP address**

---

## Step 2 — Connect to your server

On your Windows machine, open PowerShell and run:
```
ssh root@YOUR_DROPLET_IP
```
Type `yes` when asked, then enter your password.

---

## Step 3 — Install Python on the server

Once you're logged into the server, run these commands one at a time:
```
apt update
apt install python3 python3-pip -y
```

---

## Step 4 — Upload the bot files

On your **local** Windows machine (not the server), open a new PowerShell window and run:
```
scp rando_bot.py requirements.txt config.example.json root@YOUR_DROPLET_IP:/root/
```

---

## Step 5 — Configure the bot

Back in the server SSH window:
```
cp config.example.json config.json
nano config.json
```

The ops_wallet and creator_wallet are already filled in. You only need to update two fields:
- `dev_wallet_private_key` — your dev wallet's private key in base58 format (from Phantom: Settings → Security → Export Private Key). Do this now, before launch.
- `rando_mint` — your $RANDO token mint address from bags.app. Fill this in at launch.

Leave `rpc_endpoint` as-is for now.

Save with Ctrl+X → Y → Enter

---

## Step 6 — Install dependencies

```
pip3 install -r requirements.txt
```

---

## Step 7 — Run the bot

To test it first (runs in your terminal, stops when you close SSH):
```
python3 rando_bot.py
```

To run it permanently in the background (keeps running after you close SSH):
```
nohup python3 rando_bot.py > rando_bot.log 2>&1 &
```

To check if it's running:
```
ps aux | grep rando_bot
```

To watch the live log:
```
tail -f rando_bot.log
```

To stop it:
```
pkill -f rando_bot.py
```

---

## Important notes

- **Keep your dev wallet funded** — the bot keeps 0.1 SOL in reserve for tx fees; the wallet needs SOL beyond that to distribute
- **Private key security** — your `config.json` contains your private key. Don't share it or copy it anywhere else
- **Upgrading your RPC** — when you're ready, sign up at https://helius.dev (free tier available), get your endpoint URL, and replace the `rpc_endpoint` value in `config.json`. No other changes needed.

---

## Files

| File | Purpose |
|------|---------|
| `rando_bot.py` | Main bot script |
| `config.json` | Your settings (never share this) |
| `state.json` | Auto-created — tracks draw count and next draw time |
| `rando_bot.log` | Auto-created — full log of every draw |
