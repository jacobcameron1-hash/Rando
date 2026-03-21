import { getProject, getRounds } from "@/lib/demo/demoState";
import { mockHolders } from "@/lib/demo/mockHolders";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const project = getProject(id);

    if (!project) {
      return Response.json(
        {
          ok: false,
          error: "Not found",
        },
        { status: 404 }
      );
    }

    const eligible =
      project.eligibilityType === "amount"
        ? []
        : mockHolders.filter(
            (holder) => holder.percentOwned >= project.minPercent
          );

    return Response.json({
      ok: true,
      project,
      rounds: getRounds(id),
      eligibleHolderCount: eligible.length,
      simulatedPrizePool: project.simulatedPrizePool,
    });
  } catch (error) {
    console.error("Failed to load project:", error);

    return Response.json(
      {
        ok: false,
        error: "Failed to load project",
      },
      { status: 500 }
    );
  }
}