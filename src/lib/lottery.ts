import { HolderBalance } from './holders';

export interface CandidateOrderResult {
  ordered: HolderBalance[];
  seed: number;
}

export interface LotteryResult {
  winner: string | null;
  rolledOver: boolean;
  attempts: number;
  orderedCandidates: string[];
}

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildCandidateOrder(
  candidates: HolderBalance[],
  seedInput: string,
): CandidateOrderResult {
  const seed = hashSeed(seedInput);
  const rng = mulberry32(seed);
  const ordered = [...candidates];

  for (let i = ordered.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }

  return { ordered, seed };
}
