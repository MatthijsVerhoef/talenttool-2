import { NextResponse } from "next/server";

import { runOverseerAgent } from "@/lib/agents/service";
import { getOverseerThread } from "@/lib/data/store";

export async function GET() {
  const thread = await getOverseerThread();
  return NextResponse.json({ thread });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = (body?.message ?? "").toString().trim();

    if (!message) {
      return NextResponse.json(
        { error: "Bericht is verplicht." },
        { status: 400 },
      );
    }

    const result = await runOverseerAgent(message);

    const thread = await getOverseerThread();

    return NextResponse.json({
      reply: result.reply,
      responseId: result.responseId,
      usage: result.usage,
      thread,
    });
  } catch (error) {
    console.error("Overseer API error", error);
    return NextResponse.json(
      { error: "Overzichtscoach is tijdelijk niet bereikbaar." },
      { status: 500 },
    );
  }
}
