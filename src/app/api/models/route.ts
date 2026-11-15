/**
 * GET /api/models — the current Claude models for the Dash app's model
 * list (src/lib/modelList.ts). Public: no sign-in, nothing per user.
 */
import { NextResponse } from "next/server";
import { MODEL_LIST } from "@/lib/modelList";

export async function GET() {
  return NextResponse.json(MODEL_LIST, {
    headers: {
      // The app checks about once a day; an hour's cache is plenty fresh.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
