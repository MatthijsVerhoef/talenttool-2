export interface AIModelOption {
  value: string;
  label: string;
}

export const AVAILABLE_AI_MODELS: AIModelOption[] = [
  { value: "gpt-5-nano", label: "GPT-5 Nano" },
  { value: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
  { value: "gpt-5-mini", label: "GPT-5 Mini" },
];

export const DEFAULT_COACH_MODEL =
  process.env.OPENAI_COACH_MODEL ?? "gpt-4o-mini";
export const DEFAULT_OVERSEER_MODEL =
  process.env.OPENAI_OVERSEER_MODEL ?? "gpt-4o-mini";
