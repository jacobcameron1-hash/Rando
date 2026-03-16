#!/usr/bin/env python3
"""
RANDO Bot — Automated fee distribution script

Every draw interval, distributes SOL from the dev wallet:
  - 33% → random eligible holder
  - 33% → operational wallet
  - 33% → Jupiter buyback of $RANDO

Eligibility rules:
  - Must hold >= 0.25% of total token supply
  - Must not have sold/transferred tokens in the last hour
  - Creator wallet is permanently excluded

Draw interval:
  - Starts at 20 minutes
  - Increases by 20 minutes after each draw
  - Caps at 6 hours permanently
"""

import json
import time
import random
import logging
import os
import sys
import base64
import requests
import base58
from typing import Optional

from solana.rpc.api import Client
from solana.rpc.types import TxOpts
from solana.rpc.commitment import Confirmed
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.system_program import transfer as sol_transfer, TransferParams
from solders.transaction import Transaction, VersionedTransaction
from solders.message import Message
from solders.instruction import Instruction, AccountMeta


# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("rando_bot.log"),
    ],
)
log = logging.getLogger(__name__)


# ── Constants ─────────────────────────────────────────────────────────────────

CONFIG_FILE          = "config.json"
STATE_FILE           = "state.json"

MIN_HOLD_BPS         = 25           # 0.25% = 25 bps out of 10,000
# Hold requirement = draw interval (they always match)
# Draw #1: hold 20 min / interval 20 min
# Draw #2: hold 40 min / interval 40 min … caps at 6 hours
INITIAL_INTERVAL     = 20 * 60      # 20 minutes — first draw fires 20 min after launch
INTERVAL_INCREMENT   = 20 * 60      # add 20 minutes each draw
MAX_INTERVAL         = 6 * 60 * 60  # cap at 6 hours

TX_RESERVE_LAMPORTS  = 100_000_000  # keep 0.1 SOL in dev wallet to cover tx fees
MIN_DRAW_LAMPORTS    = 500_000_000  # 0.5 SOL — don't run a draw unless wallet has at least this much
SLIPPAGE_BPS         = 100          # 1% slippage on Jupiter swaps

SOL_MINT             = "So11111111111111111111111111111111111111112"
JUPITER_QUOTE_URL    = "https://quote-api.jup.ag/v6/quote"
JUPITER_SWAP_URL     = "https://quote-api.jup.ag/v6/swap"


# ── Config & State ────────────────────────────────────────────────────────────

def load_config() -> dict:
    if not os.path.exists(CONFIG_FILE):
        log.error(f"'{CONFIG_FILE}' not found. Copy config.example.json to config.json and fill it in.")
        sys.exit(1)
    with open(CONFIG_FILE) as f:
        return json.load(f)


def load_state() -> dict:
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    # First run — first draw fires after the initial interval
    return {
        "draw_count": 0,
        "next_draw_time": time.time() + INITIAL_INTERVAL,
    }


def save_state(state: dict):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


# ── Draw interval logic ───────────────────────────────────────────────────────

def draw_interval(draw_count: int) -> int:
    """
    Returns the wait time in seconds before the NEXT draw.
    draw_count is the number of draws already completed.

      draw_count=0 → 20 min (first draw)
      draw_count=1 → 40 min
      draw_count=17 → 360 min = 6 hrs (max, stays here forever)
    """
    interval = INITIAL_INTERVAL + (draw_count * INTERVAL_INCREMENT)
    return min(interval, MAX_INTERVAL)


# ── Solana helpers ────────────────────────────────────────────────────────────

def get_all_holders(client: Client, mint: str) -> list[dict]:
    """
    Returns [{wallet, balance, token_account}] for all holders with balance > 0.
    Uses getProgramAccounts via the token program to fetch all mint token accounts.
    """
    resp = client.get_token_accounts_by_mint(
        Pubkey.from_string(mint),
        encoding="jsonParsed",
    )
    holders = []
    for acct in resp.value:
        info   = acct.account.data.parsed["info"]
        owner  = info["owner"]
        amount = int(info["tokenAmount"]["amount"])
        if amount > 0:
            holders.append({
                "wallet":        owner,
                "balance":       amount,
                "token_account": str(acct.pubkey),
            })
    return holders


def get_token_supply(client: Client, mint: str) -> int:
    resp = client.get_token_supply(Pubkey.from_string(mint))
    return int(resp.value.amount)


def get_hold_start(client: Client, token_account: str) -> Optional[int]:
    """
    Scans the last 100 transactions for the token account.
    Returns the Unix timestamp of the most recent OUTBOUND transfer.
    If no outbound transfer is found, returns the timestamp of the OLDEST
    transaction we can see (a proxy for when they first received tokens).

    The caller uses this to determine:
      - If last_sell found: eligible only if (now - last_sell) >= MIN_HOLD_SECONDS
      - If no sell found:   eligible only if (now - first_seen) >= MIN_HOLD_SECONDS
    """
    sigs_resp = client.get_signatures_for_address(
        Pubkey.from_string(token_account),
        limit=100,
    )
    if not sigs_resp.value:
        return None

    last_sell_time  = None
    oldest_tx_time  = None

    for sig_info in sigs_resp.value:
        if sig_info.err:
            continue

        block_time = sig_info.block_time
        if block_time is None:
            continue

        # Track oldest transaction we've seen
        if oldest_tx_time is None or block_time < oldest_tx_time:
            oldest_tx_time = block_time

        # Check if this tx reduced the token account balance (outbound transfer)
        tx_resp = client.get_transaction(
            sig_info.signature,
            encoding="jsonParsed",
            max_supported_transaction_version=0,
        )
        if not tx_resp.value:
            continue

        meta = tx_resp.value.transaction.meta
        if not meta:
            continue

        pre_map  = {b.account_index: int(b.ui_token_amount.amount)
                    for b in (meta.pre_token_balances  or [])}
        post_map = {b.account_index: int(b.ui_token_amount.amount)
                    for b in (meta.post_token_balances or [])}

        acct_keys = [str(k) for k in
                     tx_resp.value.transaction.transaction.message.account_keys]

        if token_account not in acct_keys:
            continue

        idx  = acct_keys.index(token_account)
        pre  = pre_map.get(idx, 0)
        post = post_map.get(idx, 0)

        if post < pre:
            # Balance went down → outbound transfer (sell or send)
            # Signatures are returned newest-first, so first one we find is most recent
            if last_sell_time is None:
                last_sell_time = block_time

    if last_sell_time is not None:
        return last_sell_time   # Caller checks (now - last_sell_time) >= current draw interval

    # Never sold in last 100 txs — return oldest tx we saw as proxy for "held since"
    return oldest_tx_time


def get_eligible_holders(client: Client, mint: str, creator_wallet: str, min_hold_secs: int) -> list[str]:
    """
    Returns wallet addresses that pass all eligibility checks.
    min_hold_secs is the current draw interval — hold requirement always matches.
    """
    holders      = get_all_holders(client, mint)
    total_supply = get_token_supply(client, mint)
    min_balance  = (total_supply * MIN_HOLD_BPS) // 10_000
    now          = int(time.time())

    log.info(f"Total holders: {len(holders)} | Total supply: {total_supply} | Min balance: {min_balance} | Min hold: {min_hold_secs//60} min")

    eligible = []
    for h in holders:
        wallet        = h["wallet"]
        balance       = h["balance"]
        token_account = h["token_account"]

        # 1. Skip creator
        if wallet == creator_wallet:
            continue

        # 2. Must hold >= 0.25% of supply
        if balance < min_balance:
            log.debug(f"  {wallet[:8]}… balance {balance} < min {min_balance} — skip")
            continue

        # 3. Must have held for >= current interval without selling
        hold_since = get_hold_start(client, token_account)
        if hold_since is None:
            log.debug(f"  {wallet[:8]}… no tx history — skip")
            continue

        held_for = now - hold_since
        if held_for < min_hold_secs:
            log.debug(f"  {wallet[:8]}… only held {held_for//60} min (need {min_hold_secs//60}) — skip")
            continue

        log.debug(f"  {wallet[:8]}… eligible (held {held_for//3600:.1f} hrs, balance {balance})")
        eligible.append(wallet)

    return eligible


# ── Transaction helpers ───────────────────────────────────────────────────────

def send_sol(client: Client, keypair: Keypair, to: str, lamports: int) -> str:
    """Send SOL. Returns transaction signature string."""
    blockhash = client.get_latest_blockhash().value.blockhash
    ix = sol_transfer(TransferParams(
        from_pubkey=keypair.pubkey(),
        to_pubkey=Pubkey.from_string(to),
        lamports=lamports,
    ))
    msg = Message.new_with_blockhash([ix], keypair.pubkey(), blockhash)
    tx  = Transaction([keypair], msg, blockhash)
    result = client.send_transaction(tx, opts=TxOpts(skip_preflight=False, preflight_commitment=Confirmed))
    return str(result.value)


def jupiter_buyback(client: Client, keypair: Keypair, rando_mint: str, lamports: int) -> Optional[str]:
    """
    Swaps SOL → $RANDO via Jupiter aggregator.
    Returns transaction signature, or None on failure.
    """
    try:
        # Step 1: Get a quote
        quote_resp = requests.get(JUPITER_QUOTE_URL, params={
            "inputMint":    SOL_MINT,
            "outputMint":   rando_mint,
            "amount":       str(lamports),
            "slippageBps":  str(SLIPPAGE_BPS),
        }, timeout=15)
        quote_resp.raise_for_status()
        quote = quote_resp.json()

        log.info(f"Jupiter quote: {lamports/1e9:.4f} SOL → "
                 f"{int(quote['outAmount'])/1e9:.4f} RANDO "
                 f"(price impact: {quote.get('priceImpactPct', '?')}%)")

        # Step 2: Get swap transaction from Jupiter
        swap_resp = requests.post(JUPITER_SWAP_URL, json={
            "quoteResponse":      quote,
            "userPublicKey":      str(keypair.pubkey()),
            "wrapAndUnwrapSol":   True,
        }, timeout=15)
        swap_resp.raise_for_status()
        swap_tx_b64 = swap_resp.json()["swapTransaction"]

        # Step 3: Deserialize, sign, and send
        tx_bytes  = base64.b64decode(swap_tx_b64)
        vtx       = VersionedTransaction.from_bytes(tx_bytes)
        signed    = VersionedTransaction(vtx.message, [keypair])

        result = client.send_raw_transaction(
            bytes(signed),
            opts=TxOpts(skip_preflight=False, preflight_commitment=Confirmed),
        )
        return str(result.value)

    except requests.RequestException as e:
        log.error(f"Jupiter API error: {e}")
    except Exception as e:
        log.error(f"Jupiter buyback failed: {e}", exc_info=True)
    return None


# ── Main draw ─────────────────────────────────────────────────────────────────

def run_draw(config: dict, state: dict):
    client  = Client(config["rpc_endpoint"])
    keypair = Keypair.from_bytes(base58.b58decode(config["dev_wallet_private_key"]))

    draw_number = state["draw_count"] + 1
    log.info(f"{'='*60}")
    log.info(f"  DRAW #{draw_number}")
    log.info(f"{'='*60}")

    # ── Check vault balance ──────────────────────────────────────
    vault_lamports   = client.get_balance(keypair.pubkey()).value
    distributable    = vault_lamports - TX_RESERVE_LAMPORTS

    if vault_lamports < MIN_DRAW_LAMPORTS:
        log.warning(f"Vault balance {vault_lamports/1e9:.4f} SOL is below 0.5 SOL minimum. Skipping draw.")
        return

    if distributable <= 0:
        log.warning(f"Vault too low ({vault_lamports} lamports). Skipping draw.")
        return

    log.info(f"Vault: {vault_lamports/1e9:.6f} SOL | Distributable: {distributable/1e9:.6f} SOL")

    # ── Find eligible holders ────────────────────────────────────
    current_interval = draw_interval(state["draw_count"])
    eligible = get_eligible_holders(client, config["rando_mint"], config["creator_wallet"], current_interval)

    if not eligible:
        log.warning("No eligible holders. Skipping draw (interval still advances).")
        _advance_state(state)
        return

    log.info(f"Eligible holders: {len(eligible)}")

    # ── Pick winner ──────────────────────────────────────────────
    winner = random.choice(eligible)
    log.info(f"Winner: {winner}")

    # ── Calculate splits (integer lamports) ─────────────────────
    winner_share  = distributable // 3
    ops_share     = distributable // 3
    buyback_share = distributable - winner_share - ops_share  # remainder avoids rounding loss

    log.info(f"Winner:  {winner_share/1e9:.6f} SOL")
    log.info(f"Ops:     {ops_share/1e9:.6f} SOL")
    log.info(f"Buyback: {buyback_share/1e9:.6f} SOL")

    # ── Send to winner ───────────────────────────────────────────
    try:
        sig = send_sol(client, keypair, winner, winner_share)
        log.info(f"Winner tx: {sig}")
    except Exception as e:
        log.error(f"Winner payment FAILED: {e}")

    # ── Send to ops wallet ───────────────────────────────────────
    try:
        sig = send_sol(client, keypair, config["ops_wallet"], ops_share)
        log.info(f"Ops tx: {sig}")
    except Exception as e:
        log.error(f"Ops payment FAILED: {e}")

    # ── Jupiter buyback ──────────────────────────────────────────
    try:
        sig = jupiter_buyback(client, keypair, config["rando_mint"], buyback_share)
        if sig:
            log.info(f"Buyback tx: {sig}")
        else:
            log.warning("Buyback returned no signature — check logs above.")
    except Exception as e:
        log.error(f"Buyback FAILED: {e}")

    # ── Advance state ────────────────────────────────────────────
    _advance_state(state)
    log.info(f"Draw #{draw_number} complete. Next draw in "
             f"{draw_interval(state['draw_count'])//60} minutes.")


def _advance_state(state: dict):
    state["draw_count"] += 1
    interval = draw_interval(state["draw_count"])
    state["next_draw_time"] = time.time() + interval
    save_state(state)


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    config = load_config()
    state  = load_state()

    keypair    = Keypair.from_bytes(base58.b58decode(config["dev_wallet_private_key"]))
    dev_wallet = str(keypair.pubkey())

    log.info("RANDO Bot starting up.")
    log.info(f"Dev wallet : {dev_wallet}")
    log.info(f"Ops wallet : {config['ops_wallet']}")
    log.info(f"Token mint : {config['rando_mint']}")
    log.info(f"RPC        : {config['rpc_endpoint']}")
    log.info(f"Draw count : {state['draw_count']} completed")

    next_draw = state["next_draw_time"]
    wait_mins = max(0, (next_draw - time.time()) / 60)
    log.info(f"Next draw in {wait_mins:.1f} minutes.")

    while True:
        now = time.time()
        if now >= state["next_draw_time"]:
            try:
                run_draw(config, state)
            except Exception as e:
                log.error(f"Unhandled error in run_draw: {e}", exc_info=True)
                # Still advance the timer so we don't hammer on errors
                _advance_state(state)
        else:
            sleep_secs = min(30, state["next_draw_time"] - now)
            time.sleep(sleep_secs)


if __name__ == "__main__":
    main()
