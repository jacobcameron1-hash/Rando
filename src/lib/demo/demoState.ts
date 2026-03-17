
import { mockHolders } from "./mockHolders";

type Project = {
  id: string;
  tokenName: string;
  tokenAddress: string;
  minPercent: number;
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

export function createProject(input: any) {
  const id = Date.now().toString();
  const project: Project = {
    id,
    tokenName: input.tokenName,
    tokenAddress: input.tokenAddress,
    minPercent: input.minPercent,
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

  const eligible = mockHolders.filter(
    (h) => h.percentOwned >= project.minPercent
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
