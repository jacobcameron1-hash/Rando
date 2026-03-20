import { promises as fs } from 'fs';
import path from 'path';

export type ProofHistoryItem = {
  drawId: string;
  snapshotAt: string;
  tokenMint: string;
  slotId?: string;
  scheduledDrawAt?: string;
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
};

const HISTORY_FILE_PATH = path.join(process.cwd(), 'data', 'proof-history.json');

async function ensureHistoryFileExists() {
  const dirPath = path.dirname(HISTORY_FILE_PATH);

  await fs.mkdir(dirPath, { recursive: true });

  try {
    await fs.access(HISTORY_FILE_PATH);
  } catch {
    await fs.writeFile(HISTORY_FILE_PATH, '[]\n', 'utf8');
  }
}

export async function readProofHistory(): Promise<ProofHistoryItem[]> {
  await ensureHistoryFileExists();

  try {
    const raw = await fs.readFile(HISTORY_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed as ProofHistoryItem[];
  } catch (error) {
    console.error('readProofHistory error', error);
    return [];
  }
}

export async function writeProofHistory(
  items: ProofHistoryItem[]
): Promise<void> {
  await ensureHistoryFileExists();

  await fs.writeFile(HISTORY_FILE_PATH, JSON.stringify(items, null, 2), 'utf8');
}

export async function prependProofHistoryItem(
  item: ProofHistoryItem
): Promise<ProofHistoryItem[]> {
  const existing = await readProofHistory();
  const next = [item, ...existing];

  await writeProofHistory(next);

  return next;
}

export async function findProofHistoryBySlotId(
  slotId: string
): Promise<ProofHistoryItem | null> {
  const history = await readProofHistory();

  const match = history.find((item) => item.slotId === slotId);

  return match || null;
}

export async function hasProofHistorySlot(slotId: string): Promise<boolean> {
  const match = await findProofHistoryBySlotId(slotId);
  return Boolean(match);
}