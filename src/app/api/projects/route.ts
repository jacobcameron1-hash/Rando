import { NextResponse } from "next/server";

// IMPORTANT:
// Update this import to match your actual Prisma/db client location.
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const name =
      typeof body?.name === "string" ? body.name.trim() : "";
    const tokenMint =
      typeof body?.tokenMint === "string" ? body.tokenMint.trim() : "";
    const vaultAddress =
      typeof body?.vaultAddress === "string" ? body.vaultAddress.trim() : "";
    const thresholdType =
      body?.thresholdType === "percent" ? "percent" : "amount";
    const thresholdValue =
      typeof body?.thresholdValue === "number"
        ? body.thresholdValue
        : Number(body?.thresholdValue);
    const drawIntervalHours =
      typeof body?.drawIntervalHours === "number"
        ? body.drawIntervalHours
        : Number(body?.drawIntervalHours ?? 24);

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Project name is required" },
        { status: 400 }
      );
    }

    if (!tokenMint) {
      return NextResponse.json(
        { success: false, error: "Token mint is required" },
        { status: 400 }
      );
    }

    if (!vaultAddress) {
      return NextResponse.json(
        { success: false, error: "Vault address is required" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(thresholdValue) || thresholdValue < 0) {
      return NextResponse.json(
        { success: false, error: "Threshold value must be a valid number" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(drawIntervalHours) || drawIntervalHours <= 0) {
      return NextResponse.json(
        { success: false, error: "Draw interval must be greater than 0" },
        { status: 400 }
      );
    }

    const now = new Date();
    const nextDrawAt = new Date(
      now.getTime() + drawIntervalHours * 60 * 60 * 1000
    );

    // IMPORTANT:
    // Adjust the field names below to match your actual Project model.
    const project = await prisma.project.create({
      data: {
        name,
        tokenMint,
        vaultAddress,
        thresholdType,
        thresholdValue,
        drawIntervalHours,
        nextDrawAt,
        isActive: true,
      },
    });

    console.log("Created project:", {
      id: project?.id,
      project,
    });

    return NextResponse.json({
      success: true,
      projectId: project.id,
      project,
    });
  } catch (error) {
    console.error("POST /api/projects failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error while creating project",
      },
      { status: 500 }
    );
  }
}