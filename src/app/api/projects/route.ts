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
    console.error("Failed to create rewards project:", error);

    return Response.json(
      { error: "Failed to create rewards project" },
      { status: 500 }
    );
  }
}