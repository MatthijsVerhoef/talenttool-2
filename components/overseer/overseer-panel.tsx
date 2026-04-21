"use client";

import Image from "next/image";
import { Sparkles } from "lucide-react";

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
  const { value, onChange, isLoading, onSubmit } = inputProps;

  return (
    <>
      <div
        ref={messagesRef}
        className="flex-1 space-y-3 overflow-y-auto px-5 py-5"
      >
        {messages.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-slate-500">
            Overzichtscoach (your coaching supervisor) is privé voor jouw
            account. Vraag naar trends en signalen.
          </div>
        ) : (
          messages.map((message) => {
            const isAssistant = message.role === "assistant";
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
              ? "Overzichtscoach (your coaching supervisor)"
              : userName ?? "Jij";
            const avatarNode = isAssistant ? (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-50 text-purple-600">
                <Sparkles className="size-4" />
              </div>
            ) : (
              renderUserAvatarElement(userName, userImage)
            );
            return (
              <div
                key={message.id}
                className={`flex ${
                  isAssistant ? "justify-start" : "justify-end"
                }`}
              >
                <div
                  className={`flex max-w-[90%] items-start gap-3 ${
                    isAssistant ? "" : "flex-row-reverse"
                  }`}
                >
                  <div className="mt-1 shrink-0">{avatarNode}</div>
                  <div
                    className={`flex-1 rounded-xl border px-4 py-3 ${
                      isAssistant
                        ? "border-purple-200 bg-white"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <p
                      className={`text-[10px] font-semibold uppercase tracking-wide ${
                        isAssistant ? "text-purple-600" : "text-slate-500"
                      }`}
                    >
                      {senderName}
                    </p>
                    {contextClientName && (
                      <p className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        Client: {contextClientName}
                      </p>
                    )}
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                      {cleanMessageContent(message.content)}
                    </p>
                    {isAdmin && isAssistant && (
                      <div className="mt-1 text-right text-[10px]">
                        <button
                          type="button"
                          onClick={() => onFeedback("OVERSEER", message)}
                          className="text-purple-600 underline-offset-2 hover:underline"
                        >
                          Feedback
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
      <form onSubmit={onSubmit} className="px-4 py-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
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
            className="h-24 w-full resize-none rounded-lg border border-transparent bg-slate-50 p-3 text-sm text-slate-900 focus:border-purple-200 focus:outline-none"
            rows={3}
          />
          <div className="mt-2 flex justify-end">
            <button
              type="submit"
              disabled={!value.trim() || isLoading}
              className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-4 py-1.5 text-white hover:bg-purple-500 disabled:opacity-50"
            >
              Verstuur
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
