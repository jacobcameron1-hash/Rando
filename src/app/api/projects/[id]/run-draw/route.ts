import { getProject, runDraw } from "@/lib/demo/demoState";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const project = getProject(id);

    if (!project) {
      return Response.json(
        {
          ok: false,
          error: "Project not found",
        },
        { status: 404 }
      );
    }

    const result = runDraw(id);

    if (!result) {
      return Response.json(
        {
          ok: false,
          error: "No eligible holders",
        },
        { status: 400 }
      );
    }

    return Response.json({
      ok: true,
      projectId: id,
      project: {
        id: project.id,
        tokenMint: project.tokenMint,
        feeRecipientWallet: project.feeRecipientWallet,
        eligibilityType: project.eligibilityType,
        eligibilityValue: project.eligibilityValue,
      },
      draw: result,
    });
  } catch (error) {
    console.error("Failed to run project draw:", error);

    return Response.json(
      {
        ok: false,
        error: "Failed to run project draw",
      },
      { status: 500 }
    );
  }
}