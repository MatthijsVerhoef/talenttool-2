import type { AgentKind } from "@prisma/client";

import { runAgentCompletion } from "@/lib/ai/openai";
import type { ClientProfile } from "@/lib/data/store";
import { listActiveResponseLayers } from "@/lib/data/store";
import { logError, logInfo } from "@/lib/observability";

const RESPONSE_LAYER_TIMEOUT_MS = Number(
  process.env.OPENAI_LAYER_TIMEOUT_MS ?? "15000",
);

export interface ResponseLayerContext {
  latestUserMessage?: string;
  client?: ClientProfile | null;
  documentSnippets?: string[];
  additionalContext?: string;
}

export interface AppliedLayerSummary {
  id: string;
  name: string;
}

export async function applyResponseLayers(options: {
  agentType: AgentKind;
  draftReply: string;
  context?: ResponseLayerContext;
  requestId?: string;
}): Promise<{ reply: string; layers: AppliedLayerSummary[] }> {
  const layers = await listActiveResponseLayers(options.agentType);
  if (!layers.length || !options.draftReply.trim()) {
    return {
      reply: options.draftReply,
      layers: [],
    };
  }

  let currentReply = options.draftReply;
  const summaries: AppliedLayerSummary[] = [];

  for (const layer of layers) {
    const { systemPrompt, userPrompt } = buildLayerPrompts(
      layer.name,
      layer.description,
      layer.instructions,
      options.context,
      currentReply,
    );

    logInfo("agent.response-layer.start", {
      requestId: options.requestId ?? null,
      layerId: layer.id,
      layerName: layer.name,
      model: layer.model,
      timeoutMs: RESPONSE_LAYER_TIMEOUT_MS,
    });

    try {
      const completion = await runAgentCompletion({
        model: layer.model,
        temperature: layer.temperature,
        requestId: options.requestId,
        operation: `response-layer:${layer.id}`,
        timeoutMs: RESPONSE_LAYER_TIMEOUT_MS,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const cleaned = completion.outputText.trim();
      if (cleaned.length) {
        currentReply = cleaned;
      }
      summaries.push({ id: layer.id, name: layer.name });
      logInfo("agent.response-layer.success", {
        requestId: options.requestId ?? null,
        layerId: layer.id,
        layerName: layer.name,
        responseId: completion.responseId,
        outputLength: cleaned.length,
      });
    } catch (error) {
      logError("agent.response-layer.error", {
        requestId: options.requestId ?? null,
        layerId: layer.id,
        layerName: layer.name,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  return {
    reply: currentReply,
    layers: summaries,
  };
}

function buildLayerPrompts(
  name: string,
  description: string,
  instructions: string,
  context: ResponseLayerContext | undefined,
  draftReply: string,
) {
  const clientBlock =
    context?.client && context.client.name
      ? [
          `Cliëntnaam: ${context.client.name}`,
          context.client.focusArea ? `Focusgebied: ${context.client.focusArea}` : "",
          context.client.summary ? `Samenvatting: ${context.client.summary}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";

  const docBlock =
    context?.documentSnippets && context.documentSnippets.length
      ? `Relevante fragmenten:\n${context.documentSnippets.join("\n\n")}`
      : "";

  const latestQuestion = context?.latestUserMessage
    ? `Laatste vraag van de gebruiker:\n${context.latestUserMessage}`
    : "";

  const extra = context?.additionalContext
    ? `Aanvullende context:\n${context.additionalContext}`
    : "";

  const userPrompt = [
    "Conceptantwoord van de AI:",
    draftReply,
    latestQuestion,
    clientBlock,
    docBlock,
    extra,
    "Lever het definitieve antwoord dat naar de gebruiker moet worden gestuurd. Als het antwoord al voldoet, geef het ongewijzigd terug.",
  ]
    .filter((block) => block && block.trim().length > 0)
    .join("\n\n");

  const systemPrompt = [
    `Je bent een responslaag genaamd "${name}".`,
    `Doel van de laag: ${description}`,
    "Je ontvangt een conceptantwoord van een AI-coach. Pas het antwoord toe op basis van de onderstaande aanwijzingen en waarborg dat het antwoord altijd behulpzaam, feitelijk en eerlijk blijft.",
    `Instructies:\n${instructions}`,
    "Beoordeel en herschrijf indien nodig. Als het antwoord onvoldoende informatie bevat, voeg waarschuwingen of verduidelijkingen toe in plaats van te hallucineren.",
    "Antwoord altijd in dezelfde taal als het conceptantwoord (meestal Nederlands) en geef alleen het verbeterde antwoord terug.",
  ].join("\n\n");

  return { systemPrompt, userPrompt };
}
