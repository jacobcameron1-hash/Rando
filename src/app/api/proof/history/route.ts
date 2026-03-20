import fs from 'fs/promises';
import path from 'path';

const HISTORY_DIR = path.join(process.cwd(), 'data');
const HISTORY_FILE = path.join(HISTORY_DIR, 'proof-history.json');

type SavedDrawRecord = {
  drawId: string;
  snapshotAt: string;
  tokenMint: string;
  winner: {
    owner: string;
    uiAmount: number;
    winnerIndex: number;
  };
  counts: {
    totalTokenAccounts: number;
    totalHolders: number;
    holderCountAfterExclusions: number;
    eligibleCount: number;
    excludedWalletCount: number;
    pagesScanned: number;
  };
  rules: {
    decimals: number;
    minTokens: number;
    excludedWallets: string[];
  };
  proof: {
    eligibleWalletSample: {
      owner: string;
      uiAmount: number;
    }[];
    topEligibleSample: {
      owner: string;
      uiAmount: number;
    }[];
  };
};

async function ensureHistoryFile() {
  await fs.mkdir(HISTORY_DIR, { recursive: true });

  try {
    await fs.access(HISTORY_FILE);
  } catch {
    await fs.writeFile(HISTORY_FILE, '[]', 'utf8');
  }
}

async function readHistory(): Promise<SavedDrawRecord[]> {
  await ensureHistoryFile();

  try {
    const raw = await fs.readFile(HISTORY_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const history = await readHistory();

    const latestThree = history.slice(0, 3).map((item) => ({
      drawId: item.drawId,
      snapshotAt: item.snapshotAt,
      tokenMint: item.tokenMint,
      winner: item.winner,
      counts: item.counts,
    }));

    return Response.json({
      ok: true,
      history: latestThree,
    });
  } catch (err: any) {
    return Response.json({
      ok: false,
      error: err.message || 'Failed to read draw history',
    });
  }
}