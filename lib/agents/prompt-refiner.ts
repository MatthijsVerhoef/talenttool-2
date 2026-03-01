import type { AgentKind } from "@prisma/client";

import { runAgentCompletion } from "@/lib/ai/openai";

const PROMPT_REFINER_MODEL =
  process.env.OPENAI_PROMPT_REFINER_MODEL ?? "gpt-4.1-mini";

interface FeedbackSummary {
  id: string;
  feedback: string;
  messageContent: string;
}

export async function refinePromptWithFeedback(options: {
  agentType: AgentKind;
  basePrompt: string;
  feedback: FeedbackSummary[];
  requestId?: string;
}): Promise<string> {
  const roleLabel =
    options.agentType === "COACH" ? "coach assistent" : "overzichtscoach";
  const feedbackText = options.feedback
    .map(
      (item, index) =>
        `${index + 1}. Menselijke feedback: ${item.feedback.trim()}\nAI reactie: ${
          item.messageContent
        }`,
    )
    .join("\n\n");

  const completion = await runAgentCompletion({
    model: PROMPT_REFINER_MODEL,
    temperature: 0.2,
    requestId: options.requestId,
    operation: "prompt-refine",
    messages: [
      {
        role: "system",
        content: `Je bent een prompt-engineer die instructies herschrijft voor een ${roleLabel}. Integreer het bestaand promptmateriaal met de gegeven feedback, zodat de AI betere antwoorden geeft. Houd rekening met toon en structuur. Geef alleen de definitieve prompt terug.`,
      },
      {
        role: "user",
        content: [
          `Huidige prompt:\n${options.basePrompt}`,
          `Feedback ter verbetering:\n${feedbackText}`,
          "Herschrijf de prompt zodat deze rekening houdt met de feedbackpunten. De output moet direct als systeemprompt gebruikt kunnen worden.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  return completion.outputText.trim();
}
