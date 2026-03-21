import { createProject } from "@/lib/demo/demoState";

function requireString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }

  return value.trim();
}

function requireEligibilityType(value: unknown) {
  if (value !== "percent" && value !== "amount") {
    throw new Error("eligibilityType must be percent or amount");
  }

  return value;
}

function requirePositiveNumberString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }

  const num = Number(value);

  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`${fieldName} must be a positive number`);
  }

  return value.trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const tokenMint = requireString(body.tokenMint, "tokenMint");
    const feeRecipientWallet = requireString(
      body.feeRecipientWallet,
      "feeRecipientWallet"
    );
    const creatorWallet = requireString(body.creatorWallet, "creatorWallet");
    const eligibilityType = requireEligibilityType(body.eligibilityType);
    const eligibilityValue = requirePositiveNumberString(
      body.eligibilityValue,
      "eligibilityValue"
    );
    const baseInterval = requireString(body.baseInterval, "baseInterval");
    const incrementInterval = requireString(
      body.incrementInterval,
      "incrementInterval"
    );
    const capInterval = requireString(body.capInterval, "capInterval");

    const payload = {
      tokenMint,
      tokenAddress: tokenMint,
      tokenName:
        typeof body.tokenName === "string" && body.tokenName.trim()
          ? body.tokenName.trim()
          : "Rando Randomized Rewards",
      feeRecipientWallet,
      creatorWallet,
      eligibilityType,
      eligibilityValue,
      baseInterval,
      incrementInterval,
      capInterval,
      minPercent:
        eligibilityType === "percent" ? Number(eligibilityValue) : 0,
    };

    const project = createProject(payload);

    return Response.json({
      ok: true,
      projectId: project.id,
      project,
      setupTransactions: [],
    });
  } catch (error) {
    console.error("Failed to create rewards project:", error);

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to create rewards project",
      },
      { status: 500 }
    );
  }
}