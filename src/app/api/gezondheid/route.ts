import { NextResponse } from "next/server";
import { controleerGezondheid } from "@/lib/gezondheid";

// Gezondheid van deze installatie als JSON (voor tools en scripts). Voor
// mensen: de pagina /status. Bewust zonder login, en zonder waarden of geheimen.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gezondheid = await controleerGezondheid();
  return NextResponse.json(gezondheid, {
    status: gezondheid.gezond ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
