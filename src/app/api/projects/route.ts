import { createProject } from "@/lib/demo/demoState";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const project = createProject(body);

    return Response.json({
      projectId: project.id,
      project,
      setupTransactions: [],
    });
  } catch (error) {
    console.error("Failed to create project:", error);

    return Response.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}