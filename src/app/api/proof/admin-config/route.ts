import { NextResponse } from 'next/server';
import { getDrawAdminConfig } from '@/lib/draw-admin-config';

export async function GET() {
  try {
    const config = await getDrawAdminConfig();

    return NextResponse.json({
      ok: true,
      config,
    });
  } catch (error) {
    console.error('GET /api/proof/admin-config error', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to load admin config',
      },
      { status: 500 }
    );
  }
}