export async function POST(req: Request) {
  try {
    const origin = new URL(req.url).origin;

    const drawRes = await fetch(`${origin}/api/proof/run-draw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const drawData = await drawRes.json();

    if (!drawRes.ok || !drawData?.ok) {
      return Response.json(
        {
          ok: false,
          step: 'run-draw',
          error: drawData?.error || 'Draw failed',
          drawResponse: drawData,
        },
        { status: 500 }
      );
    }

    const feeRes = await fetch(`${origin}/api/proof/set-winner-fee-recipient`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const feeData = await feeRes.json();

    if (!feeRes.ok || !feeData?.ok) {
      return Response.json(
        {
          ok: false,
          step: 'set-winner-fee-recipient',
          error: feeData?.error || 'Fee recipient update failed',
          drawResponse: drawData,
          feeRecipientResponse: feeData,
        },
        { status: 500 }
      );
    }

    return Response.json({
      ok: true,
      step: 'cycle-complete',
      message: 'Draw ran and winner was set as fee recipient.',
      drawResponse: drawData,
      feeRecipientResponse: feeData,
    });
  } catch (error: any) {
    return Response.json(
      {
        ok: false,
        error: error?.message || 'Run cycle failed',
      },
      { status: 500 }
    );
  }
}