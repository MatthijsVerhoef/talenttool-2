"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { AgentMessage } from "@/lib/data/sessions";

type HistoryState = Record<string, AgentMessage[]>;
type ClientPendingState = Record<string, boolean>;
type ClientRequestState = Record<string, string | null>;

interface ActiveCoachRequest {
  requestId: string;
  controller: AbortController;
  userTempId: string;
  assistantTempId: string;
}

export type { HistoryState, ClientPendingState, ClientRequestState, ActiveCoachRequest };

function removeRecordKey<T>(record: Record<string, T>, key: string) {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return record;
  }
  const next = { ...record };
  delete next[key];
  return next;
}

interface UseCoachSessionOptions {
  selectedClientId: string | null;
  autoSendAfterTranscription: boolean;
  onError: (message: string | null) => void;
}

export function useCoachSession({
  selectedClientId,
  autoSendAfterTranscription,
  onError,
}: UseCoachSessionOptions) {
  const [clientHistories, setClientHistories] = useState<HistoryState>({});
  const [coachInput, setCoachInput] = useState("");
  const [coachPendingByClientId, setCoachPendingByClientId] =
    useState<ClientPendingState>({});
  const [coachLastRequestIdByClientId, setCoachLastRequestIdByClientId] =
    useState<ClientRequestState>({});
  const [queuedTranscriptByClientId, setQueuedTranscriptByClientId] = useState<
    Record<string, string>
  >({});

  const activeCoachRequestsRef = useRef<Record<string, ActiveCoachRequest>>({});
  const queuedTranscriptByClientIdRef = useRef<Record<string, string>>({});
  const coachMessagesRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    if (coachMessagesRef.current) {
      coachMessagesRef.current.scrollTo({
        top: coachMessagesRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      const activeRequests = Object.values(activeCoachRequestsRef.current);
      for (const request of activeRequests) {
        request.controller.abort();
      }
    };
  }, []);

  const clearCoachPendingState = useCallback((clientId: string) => {
    setCoachPendingByClientId((prev) => {
      if (!prev[clientId]) {
        return prev;
      }
      return { ...prev, [clientId]: false };
    });
  }, []);

  const removeCoachTempMessages = useCallback(
    (clientId: string, userTempId: string, assistantTempId: string) => {
      setClientHistories((prev) => {
        const prevHistory = prev[clientId] ?? [];
        return {
          ...prev,
          [clientId]: prevHistory.filter(
            (message) =>
              message.id !== userTempId && message.id !== assistantTempId
          ),
        };
      });
    },
    []
  );

  const queueTranscriptForClient = useCallback(
    (clientId: string, transcript: string) => {
      const existing = queuedTranscriptByClientIdRef.current[clientId];
      const nextQueue = {
        ...queuedTranscriptByClientIdRef.current,
        [clientId]: existing
          ? `${existing.trim()} ${transcript.trim()}`
          : transcript.trim(),
      };
      queuedTranscriptByClientIdRef.current = nextQueue;
      setQueuedTranscriptByClientId(nextQueue);
    },
    []
  );

  const popQueuedTranscriptForClient = useCallback((clientId: string) => {
    const queued = queuedTranscriptByClientIdRef.current[clientId];
    if (!queued) {
      return null;
    }
    const nextQueue = { ...queuedTranscriptByClientIdRef.current };
    delete nextQueue[clientId];
    queuedTranscriptByClientIdRef.current = nextQueue;
    setQueuedTranscriptByClientId(nextQueue);
    return queued;
  }, []);

  async function fetchClientHistory(clientId: string) {
    try {
      const response = await fetch(`/api/coach/${clientId}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Kan gespreksgeschiedenis niet laden.");
      const data = await response.json();
      setClientHistories((prev) => ({
        ...prev,
        [clientId]: data.history ?? [],
      }));
    } catch (fetchError) {
      console.error(fetchError);
      onError(
        (fetchError as Error).message ?? "Geschiedenis laden is mislukt."
      );
    }
  }

  async function handleCoachSubmit(
    event: React.FormEvent<HTMLFormElement> | null,
    options?: {
      clientId?: string | null;
      message?: string;
      clearInput?: boolean;
      restoreInputOnError?: boolean;
    }
  ) {
    event?.preventDefault();
    const clientId = options?.clientId ?? selectedClientId;
    const trimmedMessage = (options?.message ?? coachInput).trim();
    if (!clientId || !trimmedMessage) return;

    const shouldClearInput = options?.clearInput ?? true;
    const shouldRestoreInputOnError =
      options?.restoreInputOnError ?? shouldClearInput;
    const userTempId = `temp-user-${Date.now()}`;
    const assistantTempId = `${userTempId}-assistant`;
    const timestamp = new Date().toISOString();
    const requestId =
      typeof window !== "undefined" && window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const conversationId = "default";

    const previousRequest = activeCoachRequestsRef.current[clientId];
    if (previousRequest) {
      previousRequest.controller.abort();
      removeCoachTempMessages(
        clientId,
        previousRequest.userTempId,
        previousRequest.assistantTempId
      );
    }

    const controller = new AbortController();
    activeCoachRequestsRef.current[clientId] = {
      requestId,
      controller,
      userTempId,
      assistantTempId,
    };

    if (shouldClearInput) {
      setCoachInput("");
    }
    setCoachPendingByClientId((prev) => ({ ...prev, [clientId]: true }));
    setCoachLastRequestIdByClientId((prev) => ({
      ...prev,
      [clientId]: requestId,
    }));
    onError(null);

    setClientHistories((prev) => {
      const prevHistory = prev[clientId] ?? [];
      return {
        ...prev,
        [clientId]: [
          ...prevHistory,
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
        ],
      };
    });
    scrollToBottom();

    let streamAccepted = false;

    const runBlockingFallback = async () => {
      const fallbackResponse = await fetch(`/api/coach/${clientId}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": requestId,
          "x-client-id": clientId,
          "x-conversation-id": conversationId,
        },
        body: JSON.stringify({ message: trimmedMessage, conversationId }),
        signal: controller.signal,
      });

      const fallbackRequestId =
        fallbackResponse.headers.get("x-request-id") ?? requestId;
      const fallbackData = await fallbackResponse.json().catch(() => ({}));
      if (!fallbackResponse.ok) {
        const fallbackError =
          typeof fallbackData.error === "string"
            ? fallbackData.error
            : "Coach kon niet reageren.";
        throw new Error(`${fallbackError} (requestId: ${fallbackRequestId})`);
      }

      setClientHistories((prev) => ({
        ...prev,
        [clientId]: fallbackData.history ?? [],
      }));
      scrollToBottom();
    };

    try {
      let streamDone = false;

      const applyDeltaToAssistant = (delta: string) => {
        setClientHistories((prev) => {
          const prevHistory = prev[clientId] ?? [];
          return {
            ...prev,
            [clientId]: prevHistory.map((entry) => {
              if (entry.id !== assistantTempId) {
                return entry;
              }
              const isPlaceholder =
                entry.content === "De coach formuleert een antwoord...";
              return {
                ...entry,
                content: `${isPlaceholder ? "" : entry.content}${delta}`,
                meta: { ...(entry.meta ?? {}), pending: true },
              };
            }),
          };
        });
      };

      const finalizeStreamMessages = (
        persistedUserMessageId?: string,
        persistedAssistantMessageId?: string
      ) => {
        setClientHistories((prev) => {
          const prevHistory = prev[clientId] ?? [];
          return {
            ...prev,
            [clientId]: prevHistory.map((entry) => {
              if (entry.id === userTempId) {
                return { ...entry, id: persistedUserMessageId ?? entry.id };
              }
              if (entry.id === assistantTempId) {
                return {
                  ...entry,
                  id: persistedAssistantMessageId ?? entry.id,
                  meta: { ...(entry.meta ?? {}), pending: false },
                };
              }
              return entry;
            }),
          };
        });
      };

      const response = await fetch(`/api/coach/${clientId}/stream`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": requestId,
          "x-client-id": clientId,
          "x-conversation-id": conversationId,
        },
        body: JSON.stringify({ message: trimmedMessage, conversationId }),
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

      const handleEvent = (name: string, rawData: string) => {
        if (!rawData) {
          return;
        }
        if (name === "meta") {
          const payload = JSON.parse(rawData) as { requestId?: unknown };
          if (typeof payload.requestId === "string") {
            const streamRequestId = payload.requestId;
            setCoachLastRequestIdByClientId((prev) => ({
              ...prev,
              [clientId]: streamRequestId,
            }));
          }
          streamAccepted = true;
          return;
        }

        if (name === "delta") {
          const payload = JSON.parse(rawData) as { text?: unknown };
          if (typeof payload.text === "string" && payload.text.length > 0) {
            applyDeltaToAssistant(payload.text);
            scrollToBottom();
          }
          return;
        }

        if (name === "done") {
          const payload = JSON.parse(rawData) as {
            userMessageId?: unknown;
            assistantMessageId?: unknown;
          };
          streamDone = true;
          finalizeStreamMessages(
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
          const payload = JSON.parse(rawData) as {
            error?: unknown;
            requestId?: unknown;
          };
          const errorMessage =
            typeof payload.error === "string"
              ? payload.error
              : "Coach kon niet reageren.";
          const errorRequestId =
            typeof payload.requestId === "string"
              ? payload.requestId
              : requestId;
          throw new Error(`${errorMessage} (requestId: ${errorRequestId})`);
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
          if (line.endsWith("\r")) {
            line = line.slice(0, -1);
          }

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
        if (buffered.startsWith("event:")) {
          const trailingLines = buffered.split(/\r?\n/);
          for (const line of trailingLines) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              eventDataLines.push(line.slice(5).trimStart());
            }
          }
        }
        flushEvent();
      }

      if (!streamDone) {
        throw new Error("Stream onverwacht beëindigd.");
      }
    } catch (sendError) {
      const activeRequest = activeCoachRequestsRef.current[clientId];
      if (activeRequest?.requestId !== requestId) {
        return;
      }

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
            await runBlockingFallback();
            toast.error(
              "Streaming niet beschikbaar, standaard antwoord gebruikt."
            );
            return;
          } catch (fallbackError) {
            console.error(fallbackError);
          }
        }

        console.error(sendError);
        removeCoachTempMessages(clientId, userTempId, assistantTempId);
        if (shouldRestoreInputOnError && selectedClientId === clientId) {
          setCoachInput(trimmedMessage);
        }

        const message =
          sendError instanceof Error
            ? sendError.message
            : "Contact met de coach is mislukt.";
        const errorWithRequestId = message.includes("requestId:")
          ? message
          : `${message} (requestId: ${requestId})`;
        onError(errorWithRequestId);
      }
    } finally {
      const activeRequest = activeCoachRequestsRef.current[clientId];
      if (activeRequest?.requestId !== requestId) {
        return;
      }
      delete activeCoachRequestsRef.current[clientId];
      clearCoachPendingState(clientId);

      const queuedTranscript = popQueuedTranscriptForClient(clientId);
      if (queuedTranscript && queuedTranscript.trim().length > 0) {
        void handleCoachSubmit(null, {
          clientId,
          message: queuedTranscript,
          clearInput: false,
          restoreInputOnError: false,
        });
      }
    }
  }

  const handleVoiceTranscript = useCallback(
    (text: string) => {
      const transcript = text.trim();
      if (!transcript) {
        return;
      }

      const clientId = selectedClientId;
      if (!clientId) {
        setCoachInput((previous) => {
          if (!previous.trim()) return transcript;
          return `${previous.trimEnd()} ${transcript}`;
        });
        return;
      }

      if (!autoSendAfterTranscription) {
        setCoachInput((previous) => {
          if (!previous.trim()) return transcript;
          return `${previous.trimEnd()} ${transcript}`;
        });
        return;
      }

      if (coachPendingByClientId[clientId]) {
        queueTranscriptForClient(clientId, transcript);
        toast("Transcript in wachtrij geplaatst.");
        return;
      }

      void handleCoachSubmit(null, {
        clientId,
        message: transcript,
        clearInput: false,
        restoreInputOnError: false,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      autoSendAfterTranscription,
      coachPendingByClientId,
      queueTranscriptForClient,
      selectedClientId,
    ]
  );

  const handleVoiceError = useCallback(
    (err: { message: string; requestId?: string }) => {
      const message =
        err.requestId && !err.message.includes("requestId:")
          ? `${err.message} (requestId: ${err.requestId})`
          : err.message;
      onError(message);
      toast.error(message);
    },
    [onError]
  );

  const cleanupClientState = useCallback((clientId: string) => {
    const activeRequest = activeCoachRequestsRef.current[clientId];
    if (activeRequest) {
      activeRequest.controller.abort();
      delete activeCoachRequestsRef.current[clientId];
    }
    delete queuedTranscriptByClientIdRef.current[clientId];
    setClientHistories((prev) => removeRecordKey(prev, clientId));
    setCoachPendingByClientId((prev) => removeRecordKey(prev, clientId));
    setCoachLastRequestIdByClientId((prev) => removeRecordKey(prev, clientId));
    setQueuedTranscriptByClientId((prev) => removeRecordKey(prev, clientId));
  }, []);

  const isSelectedClientCoachPending = selectedClientId
    ? Boolean(coachPendingByClientId[selectedClientId])
    : false;

  const messages = selectedClientId
    ? (clientHistories[selectedClientId] ?? [])
    : [];

  return {
    coachMessagesRef,
    clientHistories,
    coachInput,
    setCoachInput,
    messages,
    isSelectedClientCoachPending,
    coachPendingByClientId,
    coachLastRequestIdByClientId,
    queuedTranscriptByClientId,
    handleCoachSubmit,
    handleVoiceTranscript,
    handleVoiceError,
    fetchClientHistory,
    cleanupClientState,
  };
}
