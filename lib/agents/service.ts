import { runAgentCompletion } from "@/lib/ai/openai";
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
