"use client";

import Image from "next/image";
import { AlertTriangle, ArrowUp, Loader2, MessageSquare, Sparkles } from "lucide-react";

import { VoiceRecorder } from "@/components/chat/voice-recorder";

import type { AgentMessage } from "@/lib/data/sessions";
import type { AgentKindType } from "@/components/admin/prompt-center-panel";

function getInitials(name?: string | null) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) ?? "" : "";
  return (first + last).toUpperCase();
}

function cleanMessageContent(content: string) {
  return content
    .replace(/\[AI-[^\]]*\]\s*/gi, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^\s*[-*]\s*/gm, "• ")
    .trim();
}

function renderUserAvatarElement(name?: string | null, image?: string | null) {
  if (image) {
    return (
      <Image
        src={image}
        alt={name ?? "Coach"}
        width={36}
        height={36}
        className="h-9 w-9 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2ea3f2] text-white">
      <span className="text-xs font-semibold">{getInitials(name) || "J"}</span>
    </div>
  );
}

function isPendingAgentMessage(message: AgentMessage) {
  if (!message.meta || typeof message.meta !== "object") {
    return false;
  }
  return Boolean((message.meta as { pending?: boolean }).pending);
}

export interface OverseerThreadProps {
  messages: AgentMessage[];
  messagesRef: React.RefObject<HTMLDivElement | null>;
  clientNameById: Record<string, string>;
  userName: string | null | undefined;
  userImage: string | null | undefined;
  isAdmin: boolean;
  onFeedback: (agentType: AgentKindType, message: AgentMessage) => void;
}

export interface OverseerInputProps {
  value: string;
  onChange: (value: string) => void;
  isLoading: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onTranscript: (text: string) => void;
  onVoiceError: (err: { message: string; requestId?: string }) => void;
}

export interface OverseerPanelProps {
  threadProps: OverseerThreadProps;
  inputProps: OverseerInputProps;
}

export function OverseerPanel({ threadProps, inputProps }: OverseerPanelProps) {
  const {
    messages,
    messagesRef,
    clientNameById,
    userName,
    userImage,
    isAdmin,
    onFeedback,
  } = threadProps;
  const { value, onChange, isLoading, onSubmit, onTranscript, onVoiceError } =
    inputProps;

  return (
    <>
      <div
        ref={messagesRef}
        className="flex-1 space-y-3 flex flex-col overflow-y-auto px-3 lg:px-5 pb-5 lg:py-5"
      >
        {messages.length === 0 ? (
          <div className="flex h-fit w-fit py-2 pl-5 pr-7 mt-4 bg-white items-center justify-center gap-2 rounded-3xl m-auto">
            <MessageSquare className="size-3.5" />
            <p>Vraag naar trends en signalen over je cliënten.</p>
          </div>
        ) : (
          messages.map((message) => {
            const isAssistant = message.role === "assistant";
            const isPendingResponse =
              isAssistant && isPendingAgentMessage(message);
            const context =
              message.meta &&
              typeof message.meta === "object" &&
              "context" in message.meta &&
              typeof (message.meta as { context?: unknown }).context ===
                "object" &&
              (message.meta as { context?: unknown }).context !== null
                ? (
                    message.meta as {
                      context?: { clientId?: unknown };
                    }
                  ).context ?? null
                : null;
            const contextClientId =
              context && typeof context.clientId === "string"
                ? context.clientId
                : null;
            const contextClientName = contextClientId
              ? clientNameById[contextClientId] ?? contextClientId
              : null;
            const senderName = isAssistant
              ? "Overzichtscoach"
              : userName ?? "Jij";
            const avatarNode = isAssistant ? (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                <Sparkles className="size-4" />
              </div>
            ) : (
              renderUserAvatarElement(userName, userImage)
            );
            return (
              <div
                key={message.id}
                className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`flex max-w-[86%] lg:max-w-[75%] items-start gap-3 ${
                    isAssistant ? "" : "flex-row-reverse"
                  }`}
                >
                  <div className="mt-1 shrink-0">{avatarNode}</div>
                  <div
                    className={`flex-1 rounded-3xl leading-relaxed ${
                      isAssistant
                        ? "bg-white rounded-tl-md p-5 text-slate-900"
                        : "bg-white rounded-tr-md p-4 text-slate-900"
                    }`}
                  >
                    <p
                      className={`text-[11px] font-semibold uppercase tracking-wide ${
                        isAssistant ? "text-purple-600" : "text-slate-900"
                      }`}
                    >
                      {senderName}
                    </p>
                    {contextClientName && (
                      <p className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        Cliënt: {contextClientName}
                      </p>
                    )}
                    <p className="mt-1 whitespace-pre-wrap">
                      {cleanMessageContent(message.content)}
                    </p>
                    {isPendingResponse && (
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                        <Loader2 className="size-3 animate-spin" />
                        Antwoord wordt gevormd...
                      </div>
                    )}
                    {isAdmin && isAssistant && !isPendingResponse && (
                      <div className="mt-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => onFeedback("OVERSEER", message)}
                          className="inline-flex items-center gap-1 text-red-500 underline-offset-2 hover:underline"
                        >
                          <AlertTriangle className="size-3" />
                          Geef feedback op AI
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form onSubmit={onSubmit} className="px-3 md:px-4 pb-4">
        <div className="rounded-3xl relative bg-white border">
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey) {
                return;
              }
              if ((event.nativeEvent as KeyboardEvent).isComposing) {
                return;
              }
              if (isLoading || !value.trim().length) {
                return;
              }
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }}
            placeholder="Vraag naar trends, risico's..."
            disabled={isLoading}
            className="h-30 w-full resize-none rounded-lg border border-transparent p-3 text-sm text-slate-900 focus:outline-none"
            rows={3}
          />
          <button
            type="submit"
            disabled={isLoading || !value.trim()}
            className="inline-flex items-center gap-2 aspect-square rounded-full bg-purple-600 px-3 absolute bottom-2 right-2 text-white disabled:opacity-50"
          >
            <ArrowUp className="size-4" />
          </button>
          <VoiceRecorder
            disabled={isLoading}
            languageHint="nl"
            onTranscript={onTranscript}
            onError={onVoiceError}
          />
        </div>
      </form>
    </>
  );
}
