import { getDrawAdminConfig } from '@/lib/draw-admin-config';
import { getCurrentDrawSlotFromAdmin } from '@/lib/draw-slot';
import { deleteProofHistoryBySlotId } from '@/lib/proof-history';
import {
  getProofWinnerCycle,
  resetProofWinnerCycle,
} from '@/lib/proof-winner-cycle';

const RANDO_ADMIN_API_KEY = process.env.RANDO_ADMIN_API_KEY!;
const BAGS_API_KEY = process.env.BAGS_API_KEY!;
const BAGS_BASE_URL =
  process.env.BAGS_BASE_URL || 'https://public-api-v2.bags.fm/api/v1';
const TOKEN_MINT = 'EZthQ6SUL51jJihQiFMDiZVmZiRMNjMQoTb7rNvTBAGS';

type BagsClaimablePosition = {
  baseMint?: string;
  totalClaimableLamportsUserShare?: number;
};

function isAuthorizedRequest(request: Request) {
  const headerValue = request.headers.get('x-rando-admin-key');

  if (!RANDO_ADMIN_API_KEY) {
    throw new Error('Missing RANDO_ADMIN_API_KEY environment variable');
  }

  return headerValue === RANDO_ADMIN_API_KEY;
}

function lamportsToSol(value: number) {
  return value / 1_000_000_000;
}

async function getBagsClaimableSol(wallet: string): Promise<number> {
  const url = new URL(`${BAGS_BASE_URL}/token-launch/claimable-positions`);
  url.searchParams.set('wallet', wallet);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'x-api-key': BAGS_API_KEY,
    },
    cache: 'no-store',
  });

  const json = await response.json();

  if (!response.ok || !json.success) {
    throw new Error(
      json.error || JSON.stringify(json) || 'Bags claimable-positions failed'
    );
  }

  const positions: BagsClaimablePosition[] = Array.isArray(json.response)
    ? json.response
    : [];

  const totalLamports = positions
    .filter((position) => position.baseMint === TOKEN_MINT)
    .reduce((sum, position) => {
      return sum + Number(position.totalClaimableLamportsUserShare || 0);
    }, 0);

  return lamportsToSol(totalLamports);
}

export async function GET(request: Request) {
  try {
    const config = await getDrawAdminConfig();
    const winnerCycle = await getProofWinnerCycle();
    const isAdmin = isAuthorizedRequest(request);
    const { searchParams } = new URL(request.url);
    const includeVerification = searchParams.get('verify') === '1';

    const activeWinnerWallet = winnerCycle.activeWinnerWallet || null;

    let liveBagsClaimableSol: number | null = null;

    if (activeWinnerWallet) {
      liveBagsClaimableSol = await getBagsClaimableSol(activeWinnerWallet);
    }

    let verification:
      | {
          activeWinnerWallet: string | null;
          storedAccumulatedSol: number;
          storedLastKnownClaimableSol: number;
          storedTotalClaimedSol: number;
          liveBagsClaimableSol: number | null;
          bagsMatchesStoredClaimable: boolean | null;
        }
      | undefined;

    if (includeVerification) {
      verification = {
        activeWinnerWallet,
        storedAccumulatedSol: winnerCycle.accumulatedSol,
        storedLastKnownClaimableSol: winnerCycle.lastKnownClaimableSol,
        storedTotalClaimedSol: winnerCycle.totalClaimedSol,
        liveBagsClaimableSol,
        bagsMatchesStoredClaimable:
          liveBagsClaimableSol == null
            ? null
            : Math.abs(liveBagsClaimableSol - winnerCycle.lastKnownClaimableSol) <
              0.000000001,
      };
    }

    if (isAdmin) {
      return Response.json({
        ok: true,
        config,
        winnerCycle,
        liveBagsClaimableSol,
        verification,
      });
    }

    return Response.json({
      ok: true,
      config: {
        initialIntervalHours: config.initialIntervalHours,
        minPayoutSol: config.minPayoutSol,
        minTokens: config.minTokens,
      },
      winnerCycle,
      liveBagsClaimableSol,
      verification,
    });
  } catch (error) {
    console.error('[admin-config route] GET failed:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json(
      {
        ok: false,
        error: 'Failed to load admin config',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!isAuthorizedRequest(request)) {
      return Response.json(
        {
          ok: false,
          error: 'Unauthorized',
        },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action === 'reset-winner-cycle') {
      const config = await getDrawAdminConfig();
      const winnerCycle = await resetProofWinnerCycle(config.minPayoutSol);

      return Response.json({
        ok: true,
        action: 'reset-winner-cycle',
        winnerCycle,
      });
    }

    if (action === 'reset-current-slot-lock') {
      const currentSlot = await getCurrentDrawSlotFromAdmin(new Date());

      await deleteProofHistoryBySlotId(currentSlot.slotId);

      return Response.json({
        ok: true,
        action: 'reset-current-slot-lock',
        slotId: currentSlot.slotId,
      });
    }

    return Response.json(
      {
        ok: false,
        error: 'Unsupported action',
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('[admin-config route] POST failed:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to update admin config',
      },
      { status: 500 }
    );
  }
}