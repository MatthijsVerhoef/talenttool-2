import { runAgentCompletion } from "@/lib/ai/openai";
import {
  appendClientMessage,
  getClient,
  getDocumentSnippets,
  getOverseerThread,
  getSessionWindow,
  listClientDigests,
  recordOverseerMessage,
  type ClientProfile,
} from "@/lib/data/store";

const DEFAULT_COACH_MODEL = process.env.OPENAI_COACH_MODEL ?? "gpt-4o-mini";
const DEFAULT_OVERSEER_MODEL = process.env.OPENAI_OVERSEER_MODEL ?? "gpt-4o-mini";

type ChatRole = "user" | "assistant" | "system";

function normalizeRole(role: string): ChatRole {
  if (role === "assistant" || role === "system") {
    return role;
  }
  return "user";
}

export interface AgentReply {
  reply: string;
  responseId: string;
  usage?: {
    totalTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
  };
}

const COACH_ROLE_PROMPT = `
Rol & Doel
Je bent Coach Client GPT, een AI die professionele coaches ondersteunt in hun reflectie en groei. Je geeft feedback op coaches — nooit op cliënten. Je helpt coaches om bewuster, dieper en met meer afstemming te werken.

Je bent ontwikkeld door Inzicht in Zicht (IIZ), een organisatie gericht op neurodiversiteit, werkplezier en duurzame inzetbaarheid. Je leeft de kernwaarden autonomie, rust, schoonheid, diepgang en respect voor individuele verschillen.

🎯 Doel
- Geef inzicht in stijl, toon en interventies van de coach.
- Benoem wat goed werkte in het gesprek.
- Signaleer momenten van misafstemming of gemiste kansen.
- Ontdek nieuwe manieren om beter af te stemmen op neurodiverse cliënten.
- Help de coach om CliftonStrengths bewust in te zetten.

🧩 Werkwijze
Wanneer een coach een verslag, observatie of vraag deelt, reageer jij altijd in drie secties:
1. Observatie – feitelijke samenvatting zonder oordeel (doel, thema, energie, intentie).
2. Reflectie – benoem positieve punten, geef reflectieve feedback en stel 2–4 verdiepende vragen zoals “Wat maakte dat je daar versnelde?”, “Hoe denk je dat de cliënt jouw toon ervoer?”, “Wat zou er gebeuren als je iets langer vertraagt of dieper voelt?”
3. Aanbeveling – praktische suggesties voor groei, gebaseerd op CliftonStrengths, neurodiversiteit, positieve psychologie en reflectieve gespreksvoering.

💬 Stijl
- Spreek in rustige, korte zinnen vol nuance.
- Geen beoordelende taal of HR-jargon.
- Richt je op bewustwording, niet op beoordeling.
- Spreek de coach altijd aan met “je”.
- Maak geen aannames buiten de gedeelde tekst.
- Blijf trouw aan de waarden autonomie, rust, schoonheid, diepgang en respect.
`.trim();

export async function runCoachAgent(
  clientId: string,
  userMessage: string,
): Promise<AgentReply> {
  const client = await getClient(clientId);
  if (!client) {
    throw new Error(`Cliënt ${clientId} niet gevonden.`);
  }

  await appendClientMessage(clientId, "user", userMessage, undefined, "HUMAN");

  const history = (await getSessionWindow(clientId)) ?? [];
  const documentSnippets = await getDocumentSnippets(clientId);
  const messages = [
    {
      role: "system" as const,
      content: buildCoachSystemPrompt(client, documentSnippets),
    },
    ...history.map((message) => ({
      role: normalizeRole(message.role),
      content: formatMessageForAgent(message),
    })),
  ];

  const completion = await runAgentCompletion({
    model: DEFAULT_COACH_MODEL,
    messages,
  });

  await appendClientMessage(
    clientId,
    "assistant",
    completion.outputText,
    {
      responseId: completion.responseId,
      usage: completion.usage,
    },
    "AI",
  );

  return {
    reply: completion.outputText,
    responseId: completion.responseId,
    usage: completion.usage,
  };
}

export async function runOverseerAgent(
  userMessage: string,
): Promise<AgentReply> {
  await recordOverseerMessage("user", "HUMAN", userMessage);

  const clientDigests = (await listClientDigests()).join("\n\n");
  const history = (await getOverseerThread())
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: normalizeRole(message.role),
      content: formatMessageForAgent(message),
    }));

  const systemPrompt = [
    "Je bent de hoofdcoach die het overzicht bewaart over alle individuele AI-coaches.",
    "Je hebt samenvattingen van elke cliënt en zoekt naar patronen, risico's en kansen over het geheel.",
    "Lever compacte analyses met concrete vervolgstappen voor het programma.",
  ].join(" ");

  if (options?.humanReply) {
    return {
      reply: userMessage,
      responseId: "manual",
    };
  }

  const completion = await runAgentCompletion({
    model: DEFAULT_OVERSEER_MODEL,
    messages: [
      {
        role: "system",
        content: `${systemPrompt}\n\nCliëntoverzichten:\n${clientDigests}`,
      },
      ...history,
    ],
  });

  await recordOverseerMessage("assistant", "AI", completion.outputText, {
    responseId: completion.responseId,
    usage: completion.usage,
  });

  return {
    reply: completion.outputText,
    responseId: completion.responseId,
    usage: completion.usage,
  };
}

function buildCoachSystemPrompt(client: ClientProfile, documentSnippets: string[]) {
  const goals = client.goals.length ? client.goals.join("; ") : "Nog geen doelen vastgelegd";
  const docText =
    documentSnippets.length > 0
      ? `Extra context uit documenten:\n${documentSnippets.join("\n\n")}`
      : "";
  return [
    COACH_ROLE_PROMPT,
    `Cliënt: ${client.name}. Focus: ${client.focusArea}. Samenvatting: ${client.summary}. Doelen: ${goals}.`,
    docText,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatMessageForAgent(message: { source: string; role: AgentRole; content: string }) {
  const sourceLabel = message.source === "HUMAN" ? "Menselijke coach" : "AI-coach";
  return `[${sourceLabel} · rol: ${message.role}]\n${message.content}`;
}
