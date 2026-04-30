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

export interface CoachHistoryProps {
  messages: AgentMessage[];
  messagesRef: React.RefObject<HTMLDivElement | null>;
  userName: string | null | undefined;
  userImage: string | null | undefined;
  canGiveFeedback: boolean;
  onFeedback: (agentType: AgentKindType, message: AgentMessage) => void;
}

export interface CoachInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  disabled: boolean;
}

export interface CoachVoiceProps {
  onTranscript: (text: string) => void;
  onError: (err: { message: string; requestId?: string }) => void;
  attachmentInputRef: React.RefObject<HTMLInputElement | null>;
  onAttachmentChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export interface CoachChatPanelProps {
  historyProps: CoachHistoryProps;
  inputProps: CoachInputProps;
  voiceProps: CoachVoiceProps;
}

export function CoachChatPanel({
  historyProps,
  inputProps,
  voiceProps,
}: CoachChatPanelProps) {
  const { messages, messagesRef, userName, userImage, canGiveFeedback, onFeedback } =
    historyProps;
  const { value, onChange, onSubmit, disabled } = inputProps;
  const { onTranscript, onError, attachmentInputRef, onAttachmentChange } =
    voiceProps;

  return (
    <>
      <div
        ref={messagesRef}
        className="flex-1 space-y-3 flex flex-col overflow-y-auto px-3 lg:px-5 pb-5 lg:py-5"
      >
        {messages.length === 0 ? (
          <div className="flex h-fit w-fit py-2 pl-5 pr-7 mt-4 bg-white items-center justify-center gap-2 rounded-3xl m-auto">
            <MessageSquare className="size-3.5" />
            <p>Start een gesprek met je coach assistent.</p>
          </div>
        ) : (
          messages.map((message) => {
            const isAi =
              message.role === "assistant" || message.role === "system";
            const isPendingResponse = isAi && isPendingAgentMessage(message);
            const senderName = isAi ? "AI-coach" : userName ?? "Jij";
            const avatarNode = isAi ? (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2ea3f2] text-white">
                <Sparkles className="size-4" />
              </div>
            ) : (
              renderUserAvatarElement(userName, userImage)
            );
            return (
              <div
                key={message.id}
                className={`flex ${isAi ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`flex max-w-[86%] lg:max-w-[75%] items-start gap-3 ${
                    isAi ? "" : "flex-row-reverse"
                  }`}
                >
                  <div className="mt-1 shrink-0">{avatarNode}</div>
                  <div
                    className={`flex-1 rounded-3xl leading-relaxed ${
                      isAi
                        ? "bg-white rounded-tl-md p-5 text-slate-900"
                        : "bg-white rounded-tr-md p-4 text-slate-900"
                    }`}
                  >
                    <p
                      className={`text-[11px] font-semibold uppercase tracking-wide ${
                        isAi ? "text-[#222222]" : "text-slate-900"
                      }`}
                    >
                      {senderName}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">
                      {cleanMessageContent(message.content)}
                    </p>
                    {isPendingResponse && (
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                        <Loader2 className="size-3 animate-spin" />
                        Antwoord wordt gevormd...
                      </div>
                    )}
                    {canGiveFeedback &&
                      message.role === "assistant" &&
                      isAi &&
                      !isPendingResponse && (
                        <div className="mt-2 text-[11px]">
                          <button
                            type="button"
                            onClick={() => onFeedback("COACH", message)}
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
        <div className="rounded-3xl relative bg-[#FFFF] border">
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
              if (disabled || !value.trim().length) {
                return;
              }
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }}
            placeholder="Schrijf een bericht..."
            className="h-30 w-full resize-none rounded-lg border border-transparent p-3 text-sm text-slate-900 focus:outline-none"
            rows={3}
          />
          <div className="mt-2 flex items-center justify-between text-xs">
            <button
              type="submit"
              disabled={disabled}
              className="inline-flex items-center gap-2  aspect-square rounded-full bg-[#2ea3f2] px-3 absolute bottom-2 right-2 text-white disabled:opacity-50"
            >
              <ArrowUp className="size-4" />
            </button>
            <VoiceRecorder
              disabled={disabled}
              languageHint="nl"
              onTranscript={onTranscript}
              onError={onError}
            />
          </div>
        </div>
        <input
          ref={attachmentInputRef}
          type="file"
          className="sr-only"
          accept=".pdf,.docx,.doc,.txt,.md,.csv,.mp3,.wav,.m4a,.aac,.ogg,.flac,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/*,audio/*"
          onChange={onAttachmentChange}
        />
      </form>
    </>
  );
}
