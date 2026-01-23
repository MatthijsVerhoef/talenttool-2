import fs from "node:fs";

import OpenAI from "openai";

type ChatRole = "user" | "assistant" | "system";

let client: OpenAI | null = null;

function createClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY environment variable. Add it to your .env.local file.",
    );
  }
  return new OpenAI({ apiKey });
}

export function getOpenAIClient(): OpenAI {
  if (!client) {
    client = createClient();
  }
  return client;
}

export interface RunAgentOptions {
  model: string;
  messages: { role: ChatRole; content: string }[];
  temperature?: number;
}

export interface AgentRunResult {
  outputText: string;
  responseId: string;
  usage?: {
    totalTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
  };
}

export async function runAgentCompletion(
  options: RunAgentOptions,
): Promise<AgentRunResult> {
  const client = getOpenAIClient();

  const systemContent = options.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .filter((content) => content.trim().length > 0)
    .join("\n\n");

  const conversation: OpenAI.Responses.ResponseInput = [
    ...(systemContent.length
      ? [
          {
            role: "system" as const,
            content: systemContent,
          },
        ]
      : []),
    ...options.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role,
        content: message.content,
      })),
  ].filter((entry) => typeof entry.content === "string" && entry.content.trim().length > 0);

  const requestPayload: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
    model: options.model,
    input: conversation,
  };
  if (typeof options.temperature === "number") {
    requestPayload.temperature = options.temperature;
  }

  const response = await client.responses.create(requestPayload);

  const outputText = extractText(response);

  return {
    outputText,
    responseId: response.id,
    usage: {
      totalTokens: response.usage?.total_tokens,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    },
  };
}

export async function transcribeAudio(
  filePath: string,
  mimeType?: string,
): Promise<{ text: string; duration?: number }> {
  const client = getOpenAIClient();
  const response = await client.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe",
    response_format: "verbose_json",
  });

  return {
    text: response.text ?? "",
    duration: typeof response.duration === "number" ? response.duration : undefined,
  };
}

function extractText(response: OpenAI.Responses.Response) {
  const outputText = response.output_text as string | string[] | undefined;
  if (typeof outputText === "string") {
    return outputText.trim();
  }
  if (Array.isArray(outputText) && outputText.length > 0) {
    return outputText.join("\n").trim();
  }

  if (!response.output) {
    return "";
  }

  return (
    response.output
      .map((item) => {
        if (!("content" in item)) {
          return "";
        }
        return (
          item.content
            ?.map((contentItem) => getContentText(contentItem))
            .filter(Boolean)
            .join(" ") ?? ""
        );
      })
      .filter(Boolean)
      .join("\n")
      .trim() ?? ""
  );
}

function getContentText(contentItem: unknown) {
  if (!contentItem) {
    return "";
  }
  const item = contentItem as { type?: string; text?: unknown };
  switch (item.type) {
    case "output_text":
    case "input_text":
      return typeof item.text === "string" ? item.text : "";
    case "text":
      if (typeof item.text === "string") {
        return item.text;
      }
      return (item.text as { value?: string })?.value ?? "";
    default:
      return "";
  }
}
