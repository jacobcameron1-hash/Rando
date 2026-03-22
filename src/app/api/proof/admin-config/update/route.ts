import { db } from '@/db';
import { sql } from 'drizzle-orm';

const DEFAULT_ID = 'global';

async function updateConfig() {
  await db.execute(sql`
    UPDATE draw_admin_config
    SET
      initial_interval_hours = 1,
      max_interval_hours = 1,
      updated_at = now()
    WHERE id = ${DEFAULT_ID}
  `);

  return {
    ok: true,
    message: 'Admin config updated to 1 hour',
  };
}

export async function GET() {
  try {
    const result = await updateConfig();
    return Response.json(result);
  } catch (err: any) {
    return Response.json({
      ok: false,
      error: err.message,
    });
  }
}

export async function POST() {
  try {
    const result = await updateConfig();
    return Response.json(result);
  } catch (err: any) {
    return Response.json({
      ok: false,
      error: err.message,
    });
  }
}