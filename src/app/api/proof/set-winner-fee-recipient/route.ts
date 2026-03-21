import fs from 'fs/promises';
import path from 'path';

const HISTORY_DIR = path.join(process.cwd(), 'data');
const HISTORY_FILE = path.join(HISTORY_DIR, 'proof-history.json');

const BAGS_BASE_URL =
  process.env.BAGS_BASE_URL || 'https://public-api-v2.bags.fm/api/v1';
const BAGS_API_KEY = process.env.BAGS_API_KEY || '';
const BAGS_ENABLE_WRITE = process.env.BAGS_ENABLE_WRITE === 'true';

const BAGS_TOKEN_MINT = process.env.BAGS_TOKEN_MINT || '';
const BAGS_PAYER_WALLET = process.env.BAGS_PAYER_WALLET || '';
const WINNER_BPS = Number(process.env.RANDO_WINNER_BPS || '10000');

type SavedDrawRecord = {
  drawId: string;
  snapshotAt: string;
  tokenMint: string;
  winner: {
    owner: string;
    uiAmount: number;
    winnerIndex: number;
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
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildBagsPayload(record: SavedDrawRecord) {
  return {
    baseMint: BAGS_TOKEN_MINT || record.tokenMint,
    payer: BAGS_PAYER_WALLET,
    basisPointsArray: [WINNER_BPS],
    claimersArray: [record.winner.owner],
  };
}

async function sendToBags(payload: unknown) {
  const res = await fetch(`${BAGS_BASE_URL}/fee-share/admin/update-config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': BAGS_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();

  return {
    ok: res.ok,
    status: res.status,
    raw: text,
  };
}

export async function POST() {
  try {
    const history = await readHistory();
    const latest = history[0];

    if (!latest) {
      return Response.json({
        ok: false,
        error: 'No saved draw history found. Run a draw first.',
      });
    }

    if (!latest.winner?.owner) {
      return Response.json({
        ok: false,
        error: 'Latest draw does not contain a winner wallet.',
      });
    }

    if (!BAGS_PAYER_WALLET) {
      return Response.json({
        ok: false,
        error: 'Missing BAGS_PAYER_WALLET.',
      });
    }

    if (!Number.isFinite(WINNER_BPS) || WINNER_BPS <= 0 || WINNER_BPS > 10000) {
      return Response.json({
        ok: false,
        error: 'RANDO_WINNER_BPS must be between 1 and 10000.',
      });
    }

    const payload = buildBagsPayload(latest);

    if (!BAGS_ENABLE_WRITE) {
      return Response.json({
        ok: true,
        mode: 'preview',
        winner: {
          drawId: latest.drawId,
          snapshotAt: latest.snapshotAt,
          tokenMint: latest.tokenMint,
          owner: latest.winner.owner,
          uiAmount: latest.winner.uiAmount,
        },
        payload,
      });
    }

    if (!BAGS_API_KEY) {
      return Response.json({
        ok: false,
        error: 'Missing BAGS_API_KEY.',
      });
    }

    const result = await sendToBags(payload);

    return Response.json({
      ok: result.ok,
      mode: 'live',
      winner: {
        drawId: latest.drawId,
        snapshotAt: latest.snapshotAt,
        tokenMint: latest.tokenMint,
        owner: latest.winner.owner,
        uiAmount: latest.winner.uiAmount,
      },
      payload,
      bagsRawResponse: result.raw,
      status: result.status,
    });
  } catch (err: any) {
    return Response.json({
      ok: false,
      error: err?.message || 'Failed to set winner as fee recipient',
    });
  }
}