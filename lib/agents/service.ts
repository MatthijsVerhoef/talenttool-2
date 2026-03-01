import { AgentKind, UserRole } from "@prisma/client";

import { runAgentCompletion } from "@/lib/ai/openai";
import { applyResponseLayers } from "@/lib/agents/response-layers";
import {
  DEFAULT_COACH_ROLE_PROMPT,
  DEFAULT_OVERSEER_ROLE_PROMPT,
  DEFAULT_REPORT_ROLE_PROMPT,
} from "@/lib/agents/prompts";
import {
  getAIModelSettings,
  appendOverseerMessage,
  appendClientMessage,
  getClient,
  getCoachPrompt,
  getClientDocumentContext,
  getLatestClientReport,
  getOverseerWindow,
  getOverseerPrompt,
  getReportPrompt,
  getSessionWindow,
  listClientDigestsForCoach,
  type DocumentContextSource,
  type OverseerMessageContext,
  saveClientReport,
  type AgentRole,
  type ClientProfile,
} from "@/lib/data/store";
import { logError, logInfo, withTimer } from "@/lib/observability";

type ChatRole = "user" | "assistant" | "system";

const COACH_DOCUMENT_CONTEXT_BUDGET_CHARS = Number(
  process.env.COACH_DOCUMENT_CONTEXT_BUDGET_CHARS ??
    process.env.DOCUMENT_CONTEXT_BUDGET_CHARS ??
    "6000",
);
const REPORT_DOCUMENT_CONTEXT_BUDGET_CHARS = Number(
  process.env.REPORT_DOCUMENT_CONTEXT_BUDGET_CHARS ??
    process.env.DOCUMENT_CONTEXT_BUDGET_CHARS ??
    "8000",
);

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
  documentContextSources?: DocumentContextSource[];
  docContext?: {
    docsConsidered: number;
    chunksSelected: number;
    totalChars: number;
    sources: DocumentContextSource[];
  };
}

interface AgentRunContext {
  requestId?: string;
  userId?: string;
  role?: UserRole | string;
  conversationId?: string;
}

interface ScopedAgentRunContext extends AgentRunContext {
  userId: string;
  role: UserRole | string;
}

function summarizeDocumentContext(
  contextText: string,
  sources: DocumentContextSource[] | undefined,
) {
  const safeSources = sources ?? [];
  const documentIds = Array.from(new Set(safeSources.map((source) => source.documentId)));
  const filenames = Array.from(new Set(safeSources.map((source) => source.filename)));
  return {
    contextChars: contextText.length,
    contextChunkCount: safeSources.length,
    contextDocumentCount: documentIds.length,
    documentIds,
    filenames,
  };
}

export async function runCoachAgent(
  options: {
    clientId: string;
    userMessage: string;
  } & ScopedAgentRunContext,
): Promise<AgentReply> {
  const { clientId, userMessage, requestId, userId, role, conversationId } =
    options;

  logInfo("agent.coach.start", {
    requestId: requestId ?? null,
    userId: userId ?? null,
    clientId,
    conversationId: conversationId ?? null,
    userMessageLength: userMessage.length,
  });

  try {
    const { result, durationMs } = await withTimer(async () => {
      const client = await getClient(clientId);
      if (!client) {
        throw new Error(`Cliënt ${clientId} niet gevonden.`);
      }

      await appendClientMessage(
        userId,
        clientId,
        "user",
        userMessage,
        undefined,
        "HUMAN",
      );

      const history = (await getSessionWindow(userId, clientId)) ?? [];
      const documentContext = await getClientDocumentContext({
        userId,
        role,
        clientId,
        queryText: userMessage,
        budgetChars: COACH_DOCUMENT_CONTEXT_BUDGET_CHARS,
        requestId,
      });
      const storedPrompt = await getCoachPrompt();
      const coachPrompt = storedPrompt?.content ?? DEFAULT_COACH_ROLE_PROMPT;
      const { coachModel } = await getAIModelSettings();
      const messages = [
        {
          role: "system" as const,
          content: buildCoachSystemPrompt(
            coachPrompt,
            client,
            documentContext.contextText,
          ),
        },
        ...history.map((message) => ({
          role: normalizeRole(message.role),
          content: formatMessageForAgent(message),
        })),
      ];
      const systemPrompt = messages[0]?.content ?? "";
      const contextStats = summarizeDocumentContext(
        documentContext.contextText,
        documentContext.sources,
      );
      logInfo("agent.coach.context.attached", {
        requestId: requestId ?? null,
        userId,
        clientId,
        userMessageLength: userMessage.length,
        historyCount: history.length,
        messagesCount: messages.length,
        systemPromptChars: systemPrompt.length,
        hasContextBoundary: systemPrompt.includes("<<<CLIENT_DOCUMENT_CONTEXT>>>"),
        ...contextStats,
      });

      const completion = await runAgentCompletion({
        model: coachModel,
        messages,
        requestId,
        operation: "coach",
      });

      const layered = await applyResponseLayers({
        agentType: AgentKind.COACH,
        draftReply: completion.outputText,
        context: {
          latestUserMessage: userMessage,
          client,
          documentSnippets: documentContext.contextText
            ? [documentContext.contextText]
            : [],
        },
        requestId,
      });

      await appendClientMessage(
        userId,
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
        documentContextSources: documentContext.sources,
        docContext: {
          docsConsidered: documentContext.docsConsidered,
          chunksSelected: documentContext.sources.length,
          totalChars: documentContext.totalChars,
          sources: documentContext.sources,
        },
      };
    });

    logInfo("agent.coach.success", {
      requestId: requestId ?? null,
      userId: userId ?? null,
      clientId,
      conversationId: conversationId ?? null,
      durationMs,
      responseId: result.responseId,
      replyLength: result.reply.length,
      documentContextChunkCount: result.documentContextSources?.length ?? 0,
      totalTokens: result.usage?.totalTokens,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    });

    return result;
  } catch (error) {
    logError("agent.coach.error", {
      requestId: requestId ?? null,
      userId: userId ?? null,
      clientId,
      conversationId: conversationId ?? null,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function runOverseerAgent(
  options: {
    coachUserId: string;
    userMessage: string;
    context?: OverseerMessageContext;
  } & AgentRunContext,
): Promise<AgentReply> {
  const { coachUserId, userMessage, requestId, conversationId, context } =
    options;

  logInfo("agent.overseer.start", {
    requestId: requestId ?? null,
    userId: coachUserId,
    coachUserId,
    conversationId: conversationId ?? null,
    userMessageLength: userMessage.length,
  });

  try {
    const { result, durationMs } = await withTimer(async () => {
      await appendOverseerMessage(coachUserId, "user", userMessage, {
        ...context,
        source: "HUMAN",
      });

      const clientDigests = (await listClientDigestsForCoach(coachUserId)).join(
        "\n\n",
      );
      const history = (await getOverseerWindow(coachUserId))
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
        requestId,
        operation: "overseer",
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
        requestId,
      });

      await appendOverseerMessage(coachUserId, "assistant", layered.reply, {
        ...context,
        source: "AI",
        meta: {
          responseId: completion.responseId,
          usage: completion.usage,
          layers: layered.layers.map((layer) => ({
            id: layer.id,
            name: layer.name,
          })),
        },
      });

      return {
        reply: layered.reply,
        responseId: completion.responseId,
        usage: completion.usage,
      };
    });

    logInfo("agent.overseer.success", {
      requestId: requestId ?? null,
      userId: coachUserId,
      coachUserId,
      conversationId: conversationId ?? null,
      durationMs,
      responseId: result.responseId,
      replyLength: result.reply.length,
      totalTokens: result.usage?.totalTokens,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    });

    return result;
  } catch (error) {
    logError("agent.overseer.error", {
      requestId: requestId ?? null,
      userId: coachUserId,
      coachUserId,
      conversationId: conversationId ?? null,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function generateClientReport(
  options: {
    clientId: string;
  } & ScopedAgentRunContext,
): Promise<AgentReply> {
  const { clientId, requestId, userId, role, conversationId } = options;

  logInfo("agent.report.start", {
    requestId: requestId ?? null,
    userId: userId ?? null,
    clientId,
    conversationId: conversationId ?? null,
  });

  try {
    const { result, durationMs } = await withTimer(async () => {
      const client = await getClient(clientId);
      if (!client) {
        throw new Error(`Cliënt ${clientId} niet gevonden.`);
      }

      const history = (await getSessionWindow(userId, clientId, 80)) ?? [];
      const reportQueryText = buildReportDocumentQuery(client, history);
      const documentContext = await getClientDocumentContext({
        userId,
        role,
        clientId,
        queryText: reportQueryText,
        budgetChars: REPORT_DOCUMENT_CONTEXT_BUDGET_CHARS,
        requestId,
      });
      const previousReport = await getLatestClientReport(clientId);
      const { coachModel } = await getAIModelSettings();
      const storedReportPrompt = await getReportPrompt();
      const baseReportPrompt = storedReportPrompt?.content ?? DEFAULT_REPORT_ROLE_PROMPT;

      const goals = client.goals.length ? client.goals.join(", ") : "Geen doelen vastgelegd";
      const docSummary = documentContext.contextText
        ? buildDocumentContextSection(documentContext.contextText)
        : "";
      const versioningGuidance = previousReport
        ? "Je werkt met een bestaand rapport. Houd vast wat nog klopt, maar benadruk nieuwe inzichten en voortgang. Noteer duidelijk wat er veranderd is ten opzichte van de vorige versie."
        : "Er is nog geen eerder rapport; schrijf een eerste, warme rapportage op basis van de meest recente informatie.";

      const systemPrompt = [
        baseReportPrompt,
        versioningGuidance,
        `Cliënt: ${client.name}. Focus: ${client.focusArea}. Doelen: ${goals}.`,
        docSummary,
      ]
        .filter(Boolean)
        .join("\n\n");
      const reportContextStats = summarizeDocumentContext(
        documentContext.contextText,
        documentContext.sources,
      );
      logInfo("agent.report.context.attached", {
        requestId: requestId ?? null,
        userId,
        clientId,
        reportQueryLength: reportQueryText.length,
        historyCount: history.length,
        systemPromptChars: systemPrompt.length,
        hasContextBoundary: systemPrompt.includes("<<<CLIENT_DOCUMENT_CONTEXT>>>"),
        ...reportContextStats,
      });

      const conversation = history
        .map((message) => formatMessageForAgent(message))
        .join("\n\n");
      const previousReportDate =
        previousReport?.createdAt && !Number.isNaN(Date.parse(previousReport.createdAt))
          ? new Date(previousReport.createdAt).toLocaleDateString("nl-NL", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })
          : previousReport?.createdAt ?? "";

      const userContentSegments: string[] = [];

      if (previousReport) {
        userContentSegments.push(
          [
            `Vorige rapport (${previousReportDate || "onbekende datum"}):`,
            previousReport.content,
            "Werk dit rapport bij met de nieuwste context en benoem wat er is bijgekomen of veranderd.",
          ]
            .filter(Boolean)
            .join("\n\n"),
        );
      }

      if (conversation) {
        userContentSegments.push(conversation);
      }

      if (userContentSegments.length === 0) {
        userContentSegments.push(
          "Er zijn nog geen gesprekken gevoerd. Maak een kort rapport met een vriendelijke introductie en herinnering om doelen te stellen.",
        );
      }

      const completion = await runAgentCompletion({
        model: coachModel,
        requestId,
        operation: "report",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: userContentSegments.join("\n\n"),
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
        documentContextSources: documentContext.sources,
        docContext: {
          docsConsidered: documentContext.docsConsidered,
          chunksSelected: documentContext.sources.length,
          totalChars: documentContext.totalChars,
          sources: documentContext.sources,
        },
      };
    });

    logInfo("agent.report.success", {
      requestId: requestId ?? null,
      userId: userId ?? null,
      clientId,
      conversationId: conversationId ?? null,
      durationMs,
      responseId: result.responseId,
      replyLength: result.reply.length,
      reportId: result.reportId ?? null,
      documentContextChunkCount: result.documentContextSources?.length ?? 0,
      totalTokens: result.usage?.totalTokens,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    });

    return result;
  } catch (error) {
    logError("agent.report.error", {
      requestId: requestId ?? null,
      userId: userId ?? null,
      clientId,
      conversationId: conversationId ?? null,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function buildCoachSystemPrompt(
  basePrompt: string,
  client: ClientProfile,
  documentContextText: string,
) {
  const goals = client.goals.length ? client.goals.join("; ") : "Nog geen doelen vastgelegd";
  const docText = buildDocumentContextSection(documentContextText);
  return [
    basePrompt,
    `Cliënt: ${client.name}. Focus: ${client.focusArea}. Samenvatting: ${client.summary}. Doelen: ${goals}.`,
    "Gedragsregel: als documentcontext aanwezig is, gebruik die actief en zeg nooit dat je geen toegang hebt tot cliëntdocumenten. Als iets ontbreekt, zeg: 'Dit staat niet in de huidige documentcontext.'",
    docText,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatMessageForAgent(message: { source: string; role: AgentRole; content: string }) {
  const sourceLabel = message.source === "HUMAN" ? "Menselijke coach" : "AI-coach";
  return `[${sourceLabel} · rol: ${message.role}]\n${message.content}`;
}

function buildDocumentContextSection(contextText: string) {
  const trimmed = contextText.trim();
  if (!trimmed) {
    return "";
  }

  return [
    "CLIENT_DOCUMENT_CONTEXT",
    "Gebruik alleen deze context als ondersteunend bewijs; verzin geen ontbrekende details.",
    "<<<CLIENT_DOCUMENT_CONTEXT>>>",
    trimmed,
    "<<<END_CLIENT_DOCUMENT_CONTEXT>>>",
  ].join("\n");
}

function buildReportDocumentQuery(
  client: ClientProfile,
  history: Array<{ role: AgentRole; source: string; content: string }>,
) {
  const recentHumanMessages = history
    .filter((message) => message.source === "HUMAN")
    .slice(-8)
    .map((message) => message.content.trim())
    .filter((content) => content.length > 0);

  const queryParts = [
    client.name,
    client.focusArea,
    client.summary,
    ...client.goals,
    ...recentHumanMessages,
  ].filter((part) => part && part.trim().length > 0);

  return queryParts.join(" ");
}
