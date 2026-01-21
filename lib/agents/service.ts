import { AgentKind } from "@prisma/client";

import { runAgentCompletion } from "@/lib/ai/openai";
import { applyResponseLayers } from "@/lib/agents/response-layers";
import { DEFAULT_COACH_ROLE_PROMPT, DEFAULT_OVERSEER_ROLE_PROMPT } from "@/lib/agents/prompts";
import {
  getAIModelSettings,
  appendClientMessage,
  getClient,
  getCoachPrompt,
  getDocumentSnippets,
  getOverseerPrompt,
  getOverseerThread,
  getSessionWindow,
  listClientDigests,
  recordOverseerMessage,
  saveClientReport,
  type AgentRole,
  type ClientProfile,
} from "@/lib/data/store";

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
  reportId?: string;
  createdAt?: string;
}

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
  const storedPrompt = await getCoachPrompt();
  const coachPrompt = storedPrompt?.content ?? DEFAULT_COACH_ROLE_PROMPT;
  const { coachModel } = await getAIModelSettings();
  const messages = [
    {
      role: "system" as const,
      content: buildCoachSystemPrompt(coachPrompt, client, documentSnippets),
    },
    ...history.map((message) => ({
      role: normalizeRole(message.role),
      content: formatMessageForAgent(message),
    })),
  ];

  const completion = await runAgentCompletion({
    model: coachModel,
    messages,
  });

  const layered = await applyResponseLayers({
    agentType: AgentKind.COACH,
    draftReply: completion.outputText,
    context: {
      latestUserMessage: userMessage,
      client,
      documentSnippets,
    },
  });

  await appendClientMessage(
    clientId,
    "assistant",
    layered.reply,
    {
      responseId: completion.responseId,
      usage: completion.usage,
      layers: layered.layers.map((layer) => ({ id: layer.id, name: layer.name })),
    },
    "AI",
  );

  return {
    reply: layered.reply,
    responseId: completion.responseId,
    usage: completion.usage,
  };
}

export async function runOverseerAgent(userMessage: string): Promise<AgentReply> {
  await recordOverseerMessage("user", "HUMAN", userMessage);

  const clientDigests = (await listClientDigests()).join("\n\n");
  const history = (await getOverseerThread())
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: normalizeRole(message.role),
      content: formatMessageForAgent(message),
    }));

  const storedPrompt = await getOverseerPrompt();
  const systemPrompt = storedPrompt?.content ?? DEFAULT_OVERSEER_ROLE_PROMPT;
  const { overseerModel } = await getAIModelSettings();

  const completion = await runAgentCompletion({
    model: overseerModel,
    messages: [
      {
        role: "system",
        content: `${systemPrompt}\n\nCliëntoverzichten:\n${clientDigests}`,
      },
      ...history,
    ],
  });

  const layered = await applyResponseLayers({
    agentType: AgentKind.OVERSEER,
    draftReply: completion.outputText,
    context: {
      latestUserMessage: userMessage,
      additionalContext: clientDigests,
    },
  });

  await recordOverseerMessage("assistant", "AI", layered.reply, {
    responseId: completion.responseId,
    usage: completion.usage,
    layers: layered.layers.map((layer) => ({ id: layer.id, name: layer.name })),
  });

  return {
    reply: layered.reply,
    responseId: completion.responseId,
    usage: completion.usage,
  };
}

export async function generateClientReport(clientId: string): Promise<AgentReply> {
  const client = await getClient(clientId);
  if (!client) {
    throw new Error(`Cliënt ${clientId} niet gevonden.`);
  }

  const history = (await getSessionWindow(clientId, 80)) ?? [];
  const documentSnippets = await getDocumentSnippets(clientId);
  const { coachModel } = await getAIModelSettings();

  const goals = client.goals.length ? client.goals.join(", ") : "Geen doelen vastgelegd";
  const docSummary = documentSnippets.length
    ? `Samenvatting documenten:\n${documentSnippets.join("\n\n")}`
    : "";

  const systemPrompt = [
    "Je bent een executive coach die heldere rapportages opstelt.",
    `Cliënt: ${client.name}. Focus: ${client.focusArea}. Doelen: ${goals}.`,
    docSummary,
    "Schrijf een kort rapport (max 180 woorden) in het Nederlands met de onderdelen: Overzicht, Voortgang en Aanbevolen volgende stap. Gebruik gewone zinnen zonder markdown of opsommingen en spreek de coach aan in de jij-vorm.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const conversation = history
    .map((message) => formatMessageForAgent(message))
    .join("\n\n");

  const completion = await runAgentCompletion({
    model: coachModel,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          conversation ||
          "Er zijn nog geen gesprekken gevoerd. Maak een kort rapport met een vriendelijke introductie en herinnering om doelen te stellen.",
      },
    ],
  });

  const savedReport = await saveClientReport(clientId, completion.outputText);

  return {
    reply: savedReport.content,
    responseId: completion.responseId,
    usage: completion.usage,
    reportId: savedReport.id,
    createdAt: savedReport.createdAt,
  };
}

function buildCoachSystemPrompt(
  basePrompt: string,
  client: ClientProfile,
  documentSnippets: string[],
) {
  const goals = client.goals.length ? client.goals.join("; ") : "Nog geen doelen vastgelegd";
  const docText =
    documentSnippets.length > 0
      ? `Extra context uit documenten:\n${documentSnippets.join("\n\n")}`
      : "";
  return [
    basePrompt,
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
