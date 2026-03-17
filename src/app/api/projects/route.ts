
import { createProject } from "@/lib/demo/demoState";

export async function POST(req: Request) {
  const body = await req.json();
  const project = createProject(body);
  return Response.json(project);
}
