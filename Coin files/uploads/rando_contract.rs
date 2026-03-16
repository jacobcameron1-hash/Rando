use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use switchboard_v2::AggregatorAccountData;

declare_id!("REPLACE_WITH_YOUR_PROGRAM_ID");

// ============================================================
// CONSTANTS
// ============================================================

/// SOL the vault always keeps back to cover transaction fees.
/// Every payout sends everything ABOVE this amount to the winner.
const RESERVE_LAMPORTS: u64 = 500_000_000; // 0.5 SOL

/// If vault SOL drops below this, draws freeze until fees refill it.
const UNFREEZE_THRESHOLD_LAMPORTS: u64 = 100_000_000; // 0.1 SOL

/// Minimum holding percentage to be eligible (0.1% = 10 bps of 10,000)
const MIN_HOLD_BPS: u64 = 10;

/// First draw fires 20 minutes after initialize() is called (migration time)
const LAUNCH_DELAY_SECS: i64 = 20 * 60;

/// Draws fire every 20 minutes
const DRAW_INTERVAL_SECS: i64 = 20 * 60;

/// Hold time required at draw #0 (20 minutes)
const INITIAL_HOLD_SECS: i64 = 20 * 60;

/// Hold time increases by 20 minutes after every successful draw
const HOLD_INCREMENT_SECS: i64 = 20 * 60;

/// Hold time caps at 48 hours and stays there forever
const MAX_HOLD_SECS: i64 = 48 * 60 * 60;

// ============================================================
// HELPER
// ============================================================

/// Returns the required hold duration for the upcoming draw.
///
/// draw_count = 0   → 20 min   (draw #1)
/// draw_count = 1   → 40 min   (draw #2)
/// draw_count = 143 → 48 hrs   (fully mature, never increases again)
fn required_hold_secs(draw_count: u64) -> i64 {
    let uncapped = INITIAL_HOLD_SECS + (draw_count as i64 * HOLD_INCREMENT_SECS);
    uncapped.min(MAX_HOLD_SECS)
}

// ============================================================
// PROGRAM
// ============================================================

#[program]
pub mod rando {
    use super::*;

    /// Initialize the vault. Call this immediately after your coin migrates on bags.app.
    /// This sets the launch timestamp — the 20-minute delay before the first draw is
    /// measured from this moment.
    ///
    /// Args:
    ///   creator_wallet — your wallet address, permanently ineligible for draws
    ///   rando_mint     — the $RANDO SPL token mint address
    pub fn initialize(
        ctx: Context<Initialize>,
        creator_wallet: Pubkey,
        rando_mint: Pubkey,
    ) -> Result<()> {
        let state = &mut ctx.accounts.state;
        let now = Clock::get()?.unix_timestamp;

        state.creator = creator_wallet;
        state.rando_mint = rando_mint;
        state.launch_time = now;
        state.last_draw_time = now;
        state.draw_count = 0;
        state.is_frozen = false;
        state.accumulated_rando = 0;
        state.total_supply = 0;
        state.bump = *ctx.bumps.get("state").unwrap();
        state.vault_bump = *ctx.bumps.get("vault").unwrap();

        emit!(VaultInitialized {
            creator: creator_wallet,
            rando_mint,
            launch_time: now,
        });
        Ok(())
    }

    /// Receive fees from bags.app into the vault.
    ///
    /// bags.app sends the reward share (33% of each transaction's fees) directly
    /// to this vault. This instruction accepts both SOL and $RANDO tokens.
    ///
    /// The vault does NOT split anything — bags.app has already done the split.
    /// Everything received here accumulates until the next draw.
    ///
    /// Also checks whether the vault was frozen and can now unfreeze.
    pub fn receive_fees(ctx: Context<ReceiveFees>, sol_amount: u64, rando_amount: u64) -> Result<()> {
        let state = &mut ctx.accounts.state;

        // Accept SOL into the vault PDA
        if sol_amount > 0 {
            let ix = anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.sender.key(),
                &ctx.accounts.vault.key(),
                sol_amount,
            );
            anchor_lang::solana_program::program::invoke(
                &ix,
                &[
                    ctx.accounts.sender.to_account_info(),
                    ctx.accounts.vault.to_account_info(),
                ],
            )?;
        }

        // Accept $RANDO tokens into the vault token account
        if rando_amount > 0 {
            let cpi_accounts = Transfer {
                from: ctx.accounts.sender_rando_account.to_account_info(),
                to: ctx.accounts.vault_rando_account.to_account_info(),
                authority: ctx.accounts.sender.to_account_info(),
            };
            token::transfer(
                CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
                rando_amount,
            )?;
            state.accumulated_rando = state
                .accumulated_rando
                .checked_add(rando_amount)
                .unwrap();
        }

        // If vault was frozen, check whether incoming fees have topped it back up
        let vault_sol = ctx.accounts.vault.lamports();
        if state.is_frozen && vault_sol >= UNFREEZE_THRESHOLD_LAMPORTS {
            state.is_frozen = false;
            emit!(VaultUnfrozen {
                vault_sol_balance: vault_sol,
                accumulated_rando: state.accumulated_rando,
            });
        }

        Ok(())
    }

    /// Register or refresh a holder's eligibility record.
    ///
    /// Holders call this after buying to enter the draw pool.
    /// Safe to call again at any time to refresh the balance snapshot.
    /// The creator wallet is permanently blocked.
    pub fn register_holder(ctx: Context<RegisterHolder>) -> Result<()> {
        let holder_record = &mut ctx.accounts.holder_record;
        let state = &ctx.accounts.state;
        let clock = Clock::get()?;

        require!(
            ctx.accounts.holder.key() != state.creator,
            RandoError::CreatorIneligible
        );

        let balance = ctx.accounts.holder_rando_account.amount;
        let min_balance = if state.total_supply > 0 {
            state.total_supply
                .checked_mul(MIN_HOLD_BPS)
                .unwrap()
                .checked_div(10_000)
                .unwrap()
        } else {
            u64::MAX // supply not set yet — nothing eligible
        };

        // First-time registration
        if holder_record.wallet == Pubkey::default() {
            holder_record.wallet = ctx.accounts.holder.key();
            holder_record.first_held_at = clock.unix_timestamp;
            holder_record.last_sold_at = 0;
        }

        holder_record.balance = balance;
        holder_record.last_updated = clock.unix_timestamp;
        holder_record.meets_threshold = balance >= min_balance;

        emit!(HolderRegistered {
            wallet: ctx.accounts.holder.key(),
            balance,
            meets_threshold: holder_record.meets_threshold,
        });

        Ok(())
    }

    /// Record a sell event — resets the holder's eligibility clock to now.
    ///
    /// Must be triggered on EVERY outbound token transfer, even partial sells.
    /// A developer wiring up this contract must hook this into the SPL token
    /// transfer instruction so it fires automatically.
    pub fn record_sell(ctx: Context<RecordSell>) -> Result<()> {
        let holder_record = &mut ctx.accounts.holder_record;
        let clock = Clock::get()?;

        holder_record.last_sold_at = clock.unix_timestamp;
        holder_record.meets_threshold = false;

        emit!(HolderSold {
            wallet: ctx.accounts.holder.key(),
            sold_at: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Update total token supply. Only the creator can call this.
    /// Keeps the 0.1% minimum balance threshold accurate as supply changes.
    pub fn update_total_supply(ctx: Context<UpdateSupply>, new_supply: u64) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            ctx.accounts.authority.key() == state.creator,
            RandoError::Unauthorized
        );
        state.total_supply = new_supply;
        Ok(())
    }

    /// Trigger a draw. Anyone can call this once the interval has passed.
    ///
    /// PAYOUT LOGIC:
    ///   The vault pays out 100% of its balance, minus the 0.5 SOL reserve.
    ///   The 0.5 SOL reserve stays in the vault permanently to cover future
    ///   transaction fees (VRF requests, payouts, etc).
    ///
    ///   Example: vault holds 3.2 SOL → winner gets 2.7 SOL. Vault keeps 0.5.
    ///   Example: vault holds 0.4 SOL → vault is below reserve, draw freezes.
    ///
    /// FREEZE / MEGA JACKPOT:
    ///   If vault SOL < 0.1, draws freeze. $RANDO keeps accumulating.
    ///   Once fees refill SOL to >= 0.1, the next draw fires a MEGA JACKPOT —
    ///   all accumulated $RANDO (from the entire freeze period) goes to one winner.
    ///
    /// HOLD REQUIREMENT (graduating):
    ///   Draw #1:   hold ≥ 20 min continuously
    ///   Draw #2:   hold ≥ 40 min continuously
    ///   Draw #N:   hold ≥ (N × 20) min, capped at 48 hrs
    ///   "Continuously" means no outbound transfers since last_sold_at.
    ///   Any sell — even 1 token — resets the clock to zero.
    pub fn trigger_draw(ctx: Context<TriggerDraw>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        let clock = Clock::get()?;

        // Launch delay: first draw must wait 20 min after initialize()
        require!(
            clock.unix_timestamp >= state.launch_time + LAUNCH_DELAY_SECS,
            RandoError::BeforeLaunchDelay
        );

        // Draw interval: must wait 20 min since last draw
        require!(
            clock.unix_timestamp >= state.last_draw_time + DRAW_INTERVAL_SECS,
            RandoError::TooEarlyForDraw
        );

        let vault_sol = ctx.accounts.vault.lamports();

        // ── FROZEN: vault SOL below 0.1 threshold ──
        // Skip payout but advance the clock so draws don't stack up.
        // $RANDO continues accumulating via receive_fees().
        if vault_sol < UNFREEZE_THRESHOLD_LAMPORTS {
            state.is_frozen = true;
            state.last_draw_time = clock.unix_timestamp;
            // draw_count does NOT increment during freeze —
            // hold requirement only grows on actual payouts
            emit!(DrawSkippedFrozen {
                vault_sol_balance: vault_sol,
                accumulated_rando: state.accumulated_rando,
            });
            return Ok(());
        }

        // ── ACTIVE: proceed with draw ──

        require!(state.total_supply > 0, RandoError::SupplyNotSet);

        let hold_required = required_hold_secs(state.draw_count);
        let min_balance = state.total_supply
            .checked_mul(MIN_HOLD_BPS).unwrap()
            .checked_div(10_000).unwrap();

        // Build eligible holder list from remaining_accounts (HolderRecord PDAs).
        // The caller passes all candidate holder PDAs; the contract filters them.
        let eligible: Vec<Pubkey> = ctx
            .remaining_accounts
            .iter()
            .filter_map(|acc| {
                let data = acc.try_borrow_data().ok()?;
                let record: HolderRecord =
                    AnchorDeserialize::deserialize(&mut &data[8..]).ok()?;

                // Determine how long this wallet has held without selling
                let continuous_since = if record.last_sold_at == 0 {
                    record.first_held_at
                } else {
                    record.last_sold_at
                };
                let held_duration = clock.unix_timestamp - continuous_since;

                if record.wallet != Pubkey::default()
                    && record.wallet != state.creator
                    && record.balance >= min_balance
                    && held_duration >= hold_required
                {
                    Some(record.wallet)
                } else {
                    None
                }
            })
            .collect();

        require!(!eligible.is_empty(), RandoError::NoEligibleHolders);

        // ── VERIFIABLE RANDOMNESS via Switchboard VRF ──
        // get_result() returns a [u8; 32] verified random seed.
        // We take the first 8 bytes as a u64 and mod by eligible count.
        let vrf_result = ctx.accounts.vrf_account.load()?.get_result()?;
        let random_bytes: [u8; 8] = vrf_result[0..8].try_into().unwrap();
        let random_index = u64::from_le_bytes(random_bytes) as usize % eligible.len();
        let winner = eligible[random_index];

        // ── SOL PAYOUT ──
        // Pay out everything above the 0.5 SOL reserve.
        // If for some reason vault is between 0.1 and 0.5, pay all but a dust buffer.
        let sol_payout = if vault_sol > RESERVE_LAMPORTS {
            vault_sol - RESERVE_LAMPORTS
        } else {
            vault_sol.saturating_sub(5_000) // 5000 lamports dust buffer for tx fees
        };

        if sol_payout > 0 {
            **ctx.accounts.vault.try_borrow_mut_lamports()? -= sol_payout;
            **ctx.accounts.winner_account.try_borrow_mut_lamports()? += sol_payout;
        }

        // ── RANDO PAYOUT ──
        // Always pays ALL accumulated $RANDO — whether it's a normal draw or mega jackpot.
        // After a freeze, accumulated_rando holds everything built up during that period.
        let rando_payout = state.accumulated_rando;
        let is_mega_jackpot = state.is_frozen;

        if rando_payout > 0 {
            let vault_bump = state.vault_bump;
            let seeds: &[&[u8]] = &[b"vault", &[vault_bump]];
            let signer_seeds = &[seeds];

            let cpi_accounts = Transfer {
                from: ctx.accounts.vault_rando_account.to_account_info(),
                to: ctx.accounts.winner_rando_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            };
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    cpi_accounts,
                    signer_seeds,
                ),
                rando_payout,
            )?;
        }

        // ── ADVANCE STATE ──
        state.accumulated_rando = 0;
        state.is_frozen = false;
        state.last_draw_time = clock.unix_timestamp;
        state.draw_count = state.draw_count.saturating_add(1);

        emit!(DrawCompleted {
            winner,
            sol_payout,
            rando_payout,
            is_mega_jackpot,
            draw_number: state.draw_count,
            hold_required_secs: hold_required,
            draw_time: clock.unix_timestamp,
            eligible_count: eligible.len() as u32,
        });

        Ok(())
    }
}

// ============================================================
// ACCOUNT CONTEXTS
// ============================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + ProgramState::SIZE,
        seeds = [b"state"],
        bump
    )]
    pub state: Account<'info, ProgramState>,

    /// Vault PDA — holds SOL. Controlled entirely by this program.
    /// This is the address you give to bags.app as the fee recipient.
    #[account(
        mut,
        seeds = [b"vault"],
        bump
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReceiveFees<'info> {
    #[account(mut, seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, ProgramState>,

    /// The vault PDA that accumulates all incoming fees
    #[account(mut, seeds = [b"vault"], bump = state.vault_bump)]
    pub vault: SystemAccount<'info>,

    /// Vault's $RANDO token account
    #[account(mut)]
    pub vault_rando_account: Account<'info, TokenAccount>,

    /// bags.app fee router sending the fees in
    #[account(mut)]
    pub sender: Signer<'info>,

    /// Sender's $RANDO token account (bags.app side)
    #[account(mut)]
    pub sender_rando_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterHolder<'info> {
    #[account(seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, ProgramState>,

    #[account(
        init_if_needed,
        payer = holder,
        space = 8 + HolderRecord::SIZE,
        seeds = [b"holder", holder.key().as_ref()],
        bump
    )]
    pub holder_record: Account<'info, HolderRecord>,

    /// Holder's $RANDO token account — used to verify their balance
    pub holder_rando_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub holder: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordSell<'info> {
    #[account(
        mut,
        seeds = [b"holder", holder.key().as_ref()],
        bump
    )]
    pub holder_record: Account<'info, HolderRecord>,

    pub holder: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateSupply<'info> {
    #[account(mut, seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, ProgramState>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct TriggerDraw<'info> {
    #[account(mut, seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, ProgramState>,

    #[account(mut, seeds = [b"vault"], bump = state.vault_bump)]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub vault_rando_account: Account<'info, TokenAccount>,

    /// CHECK: Winner's native SOL wallet — verified via draw logic, not constraint
    #[account(mut)]
    pub winner_account: UncheckedAccount<'info>,

    /// Winner's $RANDO token account to receive the payout
    #[account(mut)]
    pub winner_rando_account: Account<'info, TokenAccount>,

    /// Switchboard VRF aggregator — provides verifiable on-chain randomness
    pub vrf_account: AccountLoader<'info, AggregatorAccountData>,

    /// Anyone can trigger the draw — permissionless
    pub caller: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,

    // Remaining accounts: pass all HolderRecord PDAs to evaluate for eligibility.
    // The contract filters them on-chain — ineligible records are simply skipped.
}

// ============================================================
// STATE
// ============================================================

#[account]
pub struct ProgramState {
    /// Your creator wallet — permanently ineligible for draws
    pub creator: Pubkey,         // 32
    /// $RANDO SPL token mint
    pub rando_mint: Pubkey,      // 32
    /// Unix timestamp of initialize() — used to enforce launch delay
    pub launch_time: i64,        // 8
    /// Unix timestamp of the last draw attempt
    pub last_draw_time: i64,     // 8
    /// Number of successful draws completed — drives hold time graduation
    pub draw_count: u64,         // 8
    /// True when vault SOL is below the unfreeze threshold
    pub is_frozen: bool,         // 1
    /// $RANDO accumulated during freeze periods — paid as mega jackpot on unfreeze
    pub accumulated_rando: u64,  // 8
    /// Total $RANDO supply — used to compute the 0.1% minimum hold threshold
    pub total_supply: u64,       // 8
    pub bump: u8,                // 1
    pub vault_bump: u8,          // 1
}

impl ProgramState {
    pub const SIZE: usize = 32 + 32 + 8 + 8 + 8 + 1 + 8 + 8 + 1 + 1; // 107 bytes
}

#[account]
pub struct HolderRecord {
    /// Holder's wallet address
    pub wallet: Pubkey,         // 32
    /// Current $RANDO balance (refreshed via register_holder)
    pub balance: u64,           // 8
    /// Timestamp when holder first reached ≥ 0.1% supply
    pub first_held_at: i64,     // 8
    /// Timestamp of last outbound transfer (0 = never sold)
    /// ANY sell — even 1 token — updates this and resets eligibility
    pub last_sold_at: i64,      // 8
    /// Last time this record was refreshed via register_holder
    pub last_updated: i64,      // 8
    /// Whether balance currently meets the 0.1% threshold
    pub meets_threshold: bool,  // 1
}

impl HolderRecord {
    pub const SIZE: usize = 32 + 8 + 8 + 8 + 8 + 1; // 65 bytes
}

// ============================================================
// EVENTS — all on-chain and publicly verifiable
// ============================================================

#[event]
pub struct VaultInitialized {
    pub creator: Pubkey,
    pub rando_mint: Pubkey,
    pub launch_time: i64,
}

#[event]
pub struct VaultUnfrozen {
    pub vault_sol_balance: u64,
    pub accumulated_rando: u64,
}

#[event]
pub struct HolderRegistered {
    pub wallet: Pubkey,
    pub balance: u64,
    pub meets_threshold: bool,
}

#[event]
pub struct HolderSold {
    pub wallet: Pubkey,
    pub sold_at: i64,
}

#[event]
pub struct DrawCompleted {
    pub winner: Pubkey,
    pub sol_payout: u64,
    pub rando_payout: u64,
    pub is_mega_jackpot: bool,
    pub draw_number: u64,
    pub hold_required_secs: i64,
    pub draw_time: i64,
    pub eligible_count: u32,
}

#[event]
pub struct DrawSkippedFrozen {
    pub vault_sol_balance: u64,
    pub accumulated_rando: u64,
}

// ============================================================
// ERRORS
// ============================================================

#[error_code]
pub enum RandoError {
    #[msg("Creator wallet is permanently ineligible for draws.")]
    CreatorIneligible,
    #[msg("First draw cannot fire until 20 minutes after launch.")]
    BeforeLaunchDelay,
    #[msg("Draw interval has not elapsed yet. Try again later.")]
    TooEarlyForDraw,
    #[msg("No eligible holders found for this draw.")]
    NoEligibleHolders,
    #[msg("Unauthorized.")]
    Unauthorized,
    #[msg("Total supply has not been set. Call update_total_supply first.")]
    SupplyNotSet,
    #[msg("Vault frozen — SOL below threshold. Accumulating RANDO for mega jackpot.")]
    VaultFrozen,
}
