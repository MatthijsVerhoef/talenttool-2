import type { ClientProfile } from "@/lib/data/clients";
import type { AgentRole } from "@/lib/data/sessions";

export type ChatRole = "user" | "assistant" | "system";

export function normalizeRole(role: string): ChatRole {
  if (role === "assistant" || role === "system") {
    return role;
  }
  return "user";
}

export function formatMessageForAgent(message: {
  source: string;
  role: AgentRole;
  content: string;
}) {
  const sourceLabel =
    message.source === "HUMAN" ? "Menselijke coach" : "AI-coach";
  return `[${sourceLabel} · rol: ${message.role}]\n${message.content}`;
}

export function buildDocumentContextSection(contextText: string) {
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

export function buildCoachSystemPrompt(
  basePrompt: string,
  client: ClientProfile,
  documentContextText: string
) {
  const goals =
    client.goals.length > 0
      ? client.goals.join("; ")
      : "Nog geen doelen vastgelegd";
  const docText = buildDocumentContextSection(documentContextText);
  const primaryPrompt = [
    "PROMPT_CENTER_COACH_PROMPT (LEIDEND)",
    "<<<PROMPT_CENTER_COACH_PROMPT>>>",
    basePrompt,
    "<<<END_PROMPT_CENTER_COACH_PROMPT>>>",
  ].join("\n");

  return [
    primaryPrompt,
    `Coachee: ${client.name}. Focus: ${client.focusArea}. Samenvatting: ${client.summary}. Doelen: ${goals}.`,
    "Aanvullende systeemcontext (niet leidend): gebruik documentcontext als extra bron naast chatgeschiedenis en algemene coachkennis. Als documentcontext ontbreekt of onvolledig is, geef alsnog een bruikbaar inhoudelijk antwoord en stel hooguit een korte vervolgvraag om ontbrekende details op te halen.",
    docText,
  ]
    .filter(Boolean)
    .join("\n\n");
}
