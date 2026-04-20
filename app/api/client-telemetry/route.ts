import { NextResponse } from "next/server";

type ClientTelemetryPayload = {
  type?: string;
  timestamp?: number;
  [key: string]: unknown;
};

function normalizePayload(input: unknown): ClientTelemetryPayload {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input as ClientTelemetryPayload;
}

export async function POST(request: Request) {
  try {
    const payload = normalizePayload(await request.json());
    const eventType = String(payload.type || "unknown").trim() || "unknown";
    const timestamp = Number(payload.timestamp || Date.now());

    console[eventType.includes("error") ? "error" : "info"]("[client-telemetry]", {
      type: eventType,
      timestamp,
      payload,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[client-telemetry] parse failed", error);
    return NextResponse.json({ ok: false, message: "invalid payload" }, { status: 400 });
  }
}
