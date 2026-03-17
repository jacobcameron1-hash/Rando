
import { getProject, getRounds } from "@/lib/demo/demoState";
import { mockHolders } from "@/lib/demo/mockHolders";

export async function GET(req: Request, { params }: any) {
  const project = getProject(params.id);
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });

  const eligible = mockHolders.filter(
    (h) => h.percentOwned >= project.minPercent
  );

  return Response.json({
    project,
    rounds: getRounds(params.id),
    eligibleHolderCount: eligible.length,
    simulatedPrizePool: project.simulatedPrizePool
  });
}
