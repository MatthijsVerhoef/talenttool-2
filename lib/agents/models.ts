export interface AIModelOption {
  value: string;
  label: string;
}

const BASE_AI_MODELS: AIModelOption[] = [
  { value: "gpt-5-nano", label: "GPT-5 Nano" },
  { value: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
  { value: "gpt-5-mini", label: "GPT-5 Mini" },
];

const FALLBACK_COACH_MODEL = process.env.OPENAI_COACH_MODEL ?? "gpt-4o-mini";
const FALLBACK_OVERSEER_MODEL = process.env.OPENAI_OVERSEER_MODEL ?? "gpt-4o-mini";

function ensureModelOption(list: AIModelOption[], value: string) {
  if (!value || list.some((option) => option.value === value)) {
    return;
  }
  list.push({
    value,
    label: value,
  });
}

const computedModels = [...BASE_AI_MODELS];
ensureModelOption(computedModels, FALLBACK_COACH_MODEL);
ensureModelOption(computedModels, FALLBACK_OVERSEER_MODEL);

export const AVAILABLE_AI_MODELS: AIModelOption[] = computedModels;

export const DEFAULT_COACH_MODEL = FALLBACK_COACH_MODEL;
export const DEFAULT_OVERSEER_MODEL = FALLBACK_OVERSEER_MODEL;
