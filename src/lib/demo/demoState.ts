import { mockHolders } from "./mockHolders";

type EligibilityType = "percent" | "amount";

type Project = {
  id: string;
  tokenName: string;
  tokenAddress: string;
  tokenMint: string;
  creatorWallet: string;
  feeRecipientWallet: string;
  eligibilityType: EligibilityType;
  eligibilityValue: number;
  minPercent: number;
  baseInterval: string;
  incrementInterval: string;
  capInterval: string;
  simulatedPrizePool: number;
  createdAt: number;
};

type Round = {
  id: string;
  projectId: string;
  winner: string;
  percent: number;
  tx: string;
  timestamp: number;
};

const projects = new Map<string, Project>();
const rounds = new Map<string, Round[]>();

function parsePositiveNumber(value: unknown, fallback = 0): number {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : NaN;

  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function parseEligibilityType(value: unknown): EligibilityType {
  return value === "amount" ? "amount" : "percent";
}

export function createProject(input: any) {
  const id = Date.now().toString();

  const tokenMint =
    typeof input.tokenMint === "string" && input.tokenMint.trim()
      ? input.tokenMint.trim()
      : typeof input.tokenAddress === "string"
      ? input.tokenAddress.trim()
      : "";

  const tokenAddress =
    typeof input.tokenAddress === "string" && input.tokenAddress.trim()
      ? input.tokenAddress.trim()
      : tokenMint;

  const eligibilityType = parseEligibilityType(input.eligibilityType);

  const eligibilityValue =
    eligibilityType === "percent"
      ? parsePositiveNumber(input.eligibilityValue, parsePositiveNumber(input.minPercent, 0.1))
      : parsePositiveNumber(input.eligibilityValue, 1_000_000);

  const minPercent =
    eligibilityType === "percent"
      ? eligibilityValue
      : parsePositiveNumber(input.minPercent, 0);

  const project: Project = {
    id,
    tokenName:
      typeof input.tokenName === "string" && input.tokenName.trim()
        ? input.tokenName.trim()
        : "Rando Randomized Rewards",
    tokenAddress,
    tokenMint,
    creatorWallet:
      typeof input.creatorWallet === "string" ? input.creatorWallet.trim() : "",
    feeRecipientWallet:
      typeof input.feeRecipientWallet === "string"
        ? input.feeRecipientWallet.trim()
        : "",
    eligibilityType,
    eligibilityValue,
    minPercent,
    baseInterval:
      typeof input.baseInterval === "string" && input.baseInterval.trim()
        ? input.baseInterval.trim()
        : "1m",
    incrementInterval:
      typeof input.incrementInterval === "string" && input.incrementInterval.trim()
        ? input.incrementInterval.trim()
        : "1m",
    capInterval:
      typeof input.capInterval === "string" && input.capInterval.trim()
        ? input.capInterval.trim()
        : "1h",
    simulatedPrizePool: 10,
    createdAt: Date.now(),
  };

  projects.set(id, project);
  rounds.set(id, []);
  return project;
}

export function getProject(id: string) {
  return projects.get(id);
}

export function getRounds(id: string) {
  return rounds.get(id) || [];
}

export function runDraw(id: string) {
  const project = projects.get(id);
  if (!project) return null;

  const eligible =
    project.eligibilityType === "amount"
      ? mockHolders.filter(
          (holder) => holder.tokenAmount >= project.eligibilityValue
        )
      : mockHolders.filter(
          (holder) => holder.percentOwned >= project.minPercent
        );

  if (eligible.length === 0) return null;

  const winner = eligible[Math.floor(Math.random() * eligible.length)];

  const round: Round = {
    id: Date.now().toString(),
    projectId: id,
    winner: winner.wallet,
    percent: winner.percentOwned,
    tx: "SIM-" + Date.now(),
    timestamp: Date.now(),
  };

  rounds.get(id)?.push(round);
  return { round, eligibleCount: eligible.length };
}