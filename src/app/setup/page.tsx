"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SetupFormData = {
  name: string;
  tokenMint: string;
  vaultAddress: string;
  thresholdType: "amount" | "percent";
  thresholdValue: string;
  drawIntervalHours: string;
};

export default function SetupPage() {
  const router = useRouter();

  const [formData, setFormData] = useState<SetupFormData>({
    name: "",
    tokenMint: "",
    vaultAddress: "",
    thresholdType: "amount",
    thresholdValue: "",
    drawIntervalHours: "24",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function updateField<K extends keyof SetupFormData>(
    key: K,
    value: SetupFormData[K]
  ) {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const payload = {
        name: formData.name.trim(),
        tokenMint: formData.tokenMint.trim(),
        vaultAddress: formData.vaultAddress.trim(),
        thresholdType: formData.thresholdType,
        thresholdValue:
          formData.thresholdValue === ""
            ? null
            : Number(formData.thresholdValue),
        drawIntervalHours:
          formData.drawIntervalHours === ""
            ? 24
            : Number(formData.drawIntervalHours),
      };

      console.log("Submitting setup payload:", payload);

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      console.log("Setup API response:", data);

      if (!res.ok) {
        throw new Error(
          data?.error || data?.message || "Failed to create project"
        );
      }

      const projectId = data?.projectId ?? data?.project?.id;
      console.log("Resolved projectId:", projectId);

      if (!projectId || typeof projectId !== "string") {
        throw new Error("Project created but no valid projectId was returned");
      }

      setSuccessMessage("Rando is live");
      router.push(`/dashboard/${projectId}`);
    } catch (err) {
      console.error("Setup failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong during setup"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Create a Rando Lottery
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          Set up a holder lottery, point it at the wallet already receiving fees
          from Bags, and launch your project.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="mb-2 block text-sm font-medium">
            Project Name
          </label>
          <input
            value={formData.name}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder="My Token Lottery"
            className="w-full rounded-xl border px-4 py-3 outline-none"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Token Mint</label>
          <input
            value={formData.tokenMint}
            onChange={(e) => updateField("tokenMint", e.target.value)}
            placeholder="Token mint address"
            className="w-full rounded-xl border px-4 py-3 outline-none"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Prize Pool Wallet (from Bags)
          </label>
          <input
            value={formData.vaultAddress}
            onChange={(e) => updateField("vaultAddress", e.target.value)}
            placeholder="Paste wallet from Bags fee sharing"
            className="w-full rounded-xl border px-4 py-3 outline-none"
            required
          />
          <p className="mt-2 text-sm text-gray-600">
            This should be a wallet already receiving fees from Bags. Rando will
            use it as the prize pool for the lottery.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Threshold Type
          </label>
          <select
            value={formData.thresholdType}
            onChange={(e) =>
              updateField(
                "thresholdType",
                e.target.value as "amount" | "percent"
              )
            }
            className="w-full rounded-xl border px-4 py-3 outline-none"
          >
            <option value="amount">Amount</option>
            <option value="percent">Percent</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Threshold Value
          </label>
          <input
            value={formData.thresholdValue}
            onChange={(e) => updateField("thresholdValue", e.target.value)}
            placeholder="1000"
            className="w-full rounded-xl border px-4 py-3 outline-none"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Draw Interval (hours)
          </label>
          <input
            value={formData.drawIntervalHours}
            onChange={(e) => updateField("drawIntervalHours", e.target.value)}
            placeholder="24"
            className="w-full rounded-xl border px-4 py-3 outline-none"
            required
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {successMessage && !error && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            ✅ {successMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-black px-4 py-3 text-white transition disabled:opacity-50"
        >
          {isSubmitting ? "Launching..." : "Launch Rando"}
        </button>
      </form>
    </main>
  );
}