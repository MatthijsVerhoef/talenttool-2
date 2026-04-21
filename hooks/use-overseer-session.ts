"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AgentMessage } from "@/lib/data/sessions";

function scrollToBottom(ref: React.RefObject<HTMLDivElement | null>) {
  if (ref.current) {
    ref.current.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }
}

interface ActiveOverseerRequest {
  requestId: string;
  controller: AbortController;
  userTempId: string;
  assistantTempId: string;
}

interface UseOverseerSessionOptions {
  selectedClientId: string | null;
  canUseSupervisorChannel: boolean;
  onError: (message: string | null) => void;
}

export function useOverseerSession({
  selectedClientId,
  canUseSupervisorChannel,
  onError,
}: UseOverseerSessionOptions) {
  const [overseerThread, setOverseerThread] = useState<AgentMessage[]>([]);
  const [overseerInput, setOverseerInput] = useState("");
  const [isOverseerLoading, setOverseerLoading] = useState(false);
  const overseerMessagesRef = useRef<HTMLDivElement | null>(null);
  const activeRequestRef = useRef<ActiveOverseerRequest | null>(null);

  // ── Fetchers ─────────────────────────────────────────────────────────────

  const fetchOverseerThread = useCallback(async () => {
    if (!canUseSupervisorChannel) {
      setOverseerThread([]);
      return;
    }
    try {
      const response = await fetch("/api/overseer");
      if (!response.ok) throw new Error("Kan overview-gesprek niet laden.");
      const data = await response.json();
      setOverseerThread(data.thread ?? []);
    } catch (fetchError) {
      console.error(fetchError);
    }
  }, [canUseSupervisorChannel]);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (canUseSupervisorChannel) {
      void fetchOverseerThread();
    } else {
      setOverseerThread([]);
    }
  }, [fetchOverseerThread, canUseSupervisorChannel]);

  useEffect(() => {
    return () => {
      activeRequestRef.current?.controller.abort();
    };
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleOverseerSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overseerInput.trim() || isOverseerLoading) return;

    const trimmedMessage = overseerInput.trim();
    const requestId =
      typeof window !== "undefined" && window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const userTempId = `temp-overseer-user-${Date.now()}`;
    const assistantTempId = `${userTempId}-assistant`;
    const timestamp = new Date().toISOString();

    // Abort any in-flight request
    if (activeRequestRef.current) {
      activeRequestRef.current.controller.abort();
      const { userTempId: prevUser, assistantTempId: prevAssistant } =
        activeRequestRef.current;
      setOverseerThread((prev) =>
        prev.filter((m) => m.id !== prevUser && m.id !== prevAssistant)
      );
    }

    const controller = new AbortController();
    activeRequestRef.current = {
      requestId,
      controller,
      userTempId,
      assistantTempId,
    };

    setOverseerInput("");
    setOverseerLoading(true);
    onError(null);

    setOverseerThread((prev) => [
      ...prev,
      {
        id: userTempId,
        role: "user",
        source: "HUMAN",
        content: trimmedMessage,
        createdAt: timestamp,
        meta: null,
      },
      {
        id: assistantTempId,
        role: "assistant",
        source: "AI",
        content: "",
        createdAt: timestamp,
        meta: { pending: true },
      },
    ]);
    scrollToBottom(overseerMessagesRef);

    const removeTempMessages = () => {
      setOverseerThread((prev) =>
        prev.filter((m) => m.id !== userTempId && m.id !== assistantTempId)
      );
    };

    const applyDelta = (delta: string) => {
      setOverseerThread((prev) =>
        prev.map((m) => {
          if (m.id !== assistantTempId) return m;
          const isPlaceholder = m.content === "";
          return {
            ...m,
            content: isPlaceholder ? delta : m.content + delta,
            meta: { pending: true },
          };
        })
      );
      scrollToBottom(overseerMessagesRef);
    };

    const finalizeMessages = (
      userMessageId?: string,
      assistantMessageId?: string
    ) => {
      setOverseerThread((prev) =>
        prev.map((m) => {
          if (m.id === userTempId)
            return { ...m, id: userMessageId ?? m.id };
          if (m.id === assistantTempId)
            return {
              ...m,
              id: assistantMessageId ?? m.id,
              meta: { pending: false },
            };
          return m;
        })
      );
    };

    let streamAccepted = false;

    const runFallback = async () => {
      removeTempMessages();
      const fallbackResponse = await fetch("/api/overseer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": requestId,
        },
        body: JSON.stringify({
          message: trimmedMessage,
          clientId: selectedClientId ?? undefined,
        }),
        signal: controller.signal,
      });
      const responseRequestId =
        fallbackResponse.headers.get("x-request-id") ?? requestId;
      const data = await fallbackResponse.json().catch(() => ({}));
      if (!fallbackResponse.ok) {
        const errorMessage =
          typeof data.error === "string"
            ? data.error
            : "Overzichtscoach (your coaching supervisor) kon niet reageren.";
        throw new Error(`${errorMessage} (requestId: ${responseRequestId})`);
      }
      setOverseerThread(data.thread ?? []);
      scrollToBottom(overseerMessagesRef);
    };

    try {
      const response = await fetch("/api/overseer/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": requestId,
        },
        body: JSON.stringify({
          message: trimmedMessage,
          clientId: selectedClientId ?? undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("STREAM_UNAVAILABLE");
      }

      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      let buffered = "";
      let eventName = "message";
      let eventDataLines: string[] = [];
      let streamDone = false;

      const handleEvent = (name: string, rawData: string) => {
        if (!rawData) return;

        if (name === "meta") {
          streamAccepted = true;
          return;
        }

        if (name === "delta") {
          const payload = JSON.parse(rawData) as { text?: unknown };
          if (typeof payload.text === "string" && payload.text.length > 0) {
            applyDelta(payload.text);
          }
          return;
        }

        if (name === "done") {
          const payload = JSON.parse(rawData) as {
            userMessageId?: unknown;
            assistantMessageId?: unknown;
          };
          streamDone = true;
          finalizeMessages(
            typeof payload.userMessageId === "string"
              ? payload.userMessageId
              : undefined,
            typeof payload.assistantMessageId === "string"
              ? payload.assistantMessageId
              : undefined
          );
          return;
        }

        if (name === "error") {
          const payload = JSON.parse(rawData) as { error?: unknown };
          const errorMessage =
            typeof payload.error === "string"
              ? payload.error
              : "Overzichtscoach kon niet reageren.";
          throw new Error(errorMessage);
        }
      };

      const flushEvent = () => {
        if (eventDataLines.length === 0) {
          eventName = "message";
          return;
        }
        const rawData = eventDataLines.join("\n");
        eventDataLines = [];
        const currentEvent = eventName;
        eventName = "message";
        handleEvent(currentEvent, rawData);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffered += decoder.decode();
          break;
        }
        buffered += decoder.decode(value, { stream: true });

        let lineBreakIndex = buffered.indexOf("\n");
        while (lineBreakIndex >= 0) {
          let line = buffered.slice(0, lineBreakIndex);
          buffered = buffered.slice(lineBreakIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);

          if (line.length === 0) {
            flushEvent();
          } else if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            eventDataLines.push(line.slice(5).trimStart());
          }

          lineBreakIndex = buffered.indexOf("\n");
        }

        if (streamDone) {
          await reader.cancel();
          break;
        }
      }

      if (buffered.trim().length > 0) {
        const trailingLines = buffered.split(/\r?\n/);
        for (const line of trailingLines) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            eventDataLines.push(line.slice(5).trimStart());
          }
        }
        flushEvent();
      }

      if (!streamDone) {
        throw new Error("Stream onverwacht beëindigd.");
      }
    } catch (sendError) {
      const active = activeRequestRef.current;
      if (active?.requestId !== requestId) return;

      const isAbortError =
        sendError instanceof Error &&
        (sendError.name === "AbortError" || sendError.message === "Aborted");

      if (!isAbortError) {
        const shouldFallback =
          !streamAccepted &&
          sendError instanceof Error &&
          (sendError.message === "STREAM_UNAVAILABLE" ||
            sendError.name === "TypeError" ||
            sendError.name === "SyntaxError" ||
            sendError.message === "Stream onverwacht beëindigd.");

        if (shouldFallback) {
          try {
            await runFallback();
            return;
          } catch (fallbackError) {
            console.error(fallbackError);
          }
        }

        removeTempMessages();
        console.error(sendError);
        onError(
          sendError instanceof Error
            ? sendError.message
            : "Contact met overzichtscoach is mislukt."
        );
      } else {
        removeTempMessages();
      }
    } finally {
      const active = activeRequestRef.current;
      if (active?.requestId === requestId) {
        activeRequestRef.current = null;
        setOverseerLoading(false);
      }
    }
  }

  function handleOverseerVoiceTranscript(text: string) {
    const transcript = text.trim();
    if (!transcript) return;
    setOverseerInput((prev) => {
      if (!prev.trim()) return transcript;
      return `${prev.trimEnd()} ${transcript}`;
    });
  }

  function handleOverseerVoiceError(err: {
    message: string;
    requestId?: string;
  }) {
    const message =
      err.requestId && !err.message.includes("requestId:")
        ? `${err.message} (requestId: ${err.requestId})`
        : err.message;
    onError(message);
  }

  return {
    overseerThread,
    overseerInput,
    setOverseerInput,
    isOverseerLoading,
    overseerMessagesRef,
    fetchOverseerThread,
    handleOverseerSubmit,
    handleOverseerVoiceTranscript,
    handleOverseerVoiceError,
  };
}
