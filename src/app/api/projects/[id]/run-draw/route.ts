
import { runDraw } from "@/lib/demo/demoState";

export async function POST(req: Request, { params }: any) {
  const result = runDraw(params.id);
  if (!result) {
    return Response.json({ error: "No eligible holders" }, { status: 400 });
  }
  return Response.json(result);
}
