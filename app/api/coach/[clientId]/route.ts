import { NextResponse } from "next/server";

import { runCoachAgent } from "@/lib/agents/service";
import { getSessionWindow } from "@/lib/data/store";

interface Params {
  params: Promise<{
    clientId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const { clientId } = await params;
  const history = await getSessionWindow(clientId, 50);
  if (!history) {
    return NextResponse.json({ error: "Cliënt niet gevonden." }, { status: 404 });
  }

  return NextResponse.json({ clientId, history });
}

export async function POST(request: Request, { params }: Params) {
  const { clientId } = await params;

  try {
    const body = await request.json();
    const message = (body?.message ?? "").toString().trim();

    if (!message) {
      return NextResponse.json(
        { error: "Bericht is verplicht." },
        { status: 400 },
      );
    }

    const result = await runCoachAgent(clientId, message);

    const history = (await getSessionWindow(clientId)) ?? [];

    return NextResponse.json({
      clientId,
      reply: result.reply,
      responseId: result.responseId,
      usage: result.usage,
      history,
    });
  } catch (error) {
    console.error("Coach API error", error);
    return NextResponse.json(
      { error: "Coach is tijdelijk niet bereikbaar." },
      { status: 500 },
    );
  }
}
