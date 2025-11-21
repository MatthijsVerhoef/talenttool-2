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

  const response = await client.responses.create({
    model: options.model,
    temperature: options.temperature ?? 0.4,
    input: [
      {
        role: "system",
        content: options.messages
          .filter((message) => message.role === "system")
          .map((message) => message.content)
          .join("\n\n"),
      },
      ...options.messages
        .filter((message) => message.role !== "system")
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
    ].filter((entry) => typeof entry.content === "string" && entry.content.trim().length > 0),
  });

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

function extractText(response: OpenAI.Responses.Response) {
  const outputText = response.output_text;
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
      .map((item) =>
        item.content
          ?.map((contentItem) => getContentText(contentItem))
          .filter(Boolean)
          .join(" "),
      )
      .filter(Boolean)
      .join("\n")
      .trim() ?? ""
  );
}

function getContentText(contentItem: OpenAI.Responses.ResponseOutputItem["content"][number]) {
  if (!contentItem) {
    return "";
  }
  switch (contentItem.type) {
    case "output_text":
    case "input_text":
      return contentItem.text ?? "";
    case "text":
      return typeof contentItem.text === "string"
        ? contentItem.text
        : contentItem.text?.value ?? "";
    default:
      return "";
  }
}
