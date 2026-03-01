"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioWaveform, Loader2, Mic, MicIcon, Square } from "lucide-react";

import { TranscribeRequestError, transcribe } from "@/lib/client/transcribe";

type RecorderState = "idle" | "recording" | "transcribing" | "error";

export type VoiceRecorderProps = {
  disabled?: boolean;
  languageHint?: "nl" | "en";
  onTranscript: (text: string) => void;
  onError?: (err: { message: string; requestId?: string }) => void;
};

const MAX_BYTES = Number(
  process.env.NEXT_PUBLIC_TRANSCRIBE_MAX_BYTES ?? "10000000"
);
const MAX_SECONDS = Number(
  process.env.NEXT_PUBLIC_TRANSCRIBE_MAX_SECONDS ?? "60"
);

function resolveRequestId() {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getPreferredMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }
  const preferred = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const mimeType of preferred) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return undefined;
}

export function VoiceRecorder({
  disabled,
  languageHint,
  onTranscript,
  onError,
}: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [statusText, setStatusText] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const transcribeAbortRef = useRef<AbortController | null>(null);

  const isRecording = state === "recording";
  const isTranscribing = state === "transcribing";

  const buttonLabel = useMemo(() => {
    if (isRecording) {
      return "Stop opname";
    }
    if (isTranscribing) {
      return "Transcriptie bezig";
    }
    return "Start spraakopname";
  }, [isRecording, isTranscribing]);

  const clearTimer = useCallback(() => {
    if (!timerRef.current) {
      return;
    }
    clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const stopTracks = useCallback(() => {
    if (!streamRef.current) {
      return;
    }
    for (const track of streamRef.current.getTracks()) {
      track.stop();
    }
    streamRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    clearTimer();
    recorder.stop();
    setState("transcribing");
  }, [clearTimer]);

  const handleRecordError = useCallback(
    (message: string, requestId?: string) => {
      setState("error");
      setStatusText(message);
      onError?.({ message, requestId });
    },
    [onError]
  );

  const startRecording = useCallback(async () => {
    if (disabled) {
      return;
    }

    if (isTranscribing) {
      transcribeAbortRef.current?.abort();
      transcribeAbortRef.current = null;
    }

    clearTimer();
    stopTracks();
    chunksRef.current = [];
    setElapsedSeconds(0);
    setStatusText(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getPreferredMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;
      startedAtRef.current = Date.now();

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", async () => {
        clearTimer();
        stopTracks();

        const startedAt = startedAtRef.current ?? Date.now();
        startedAtRef.current = null;
        const durationSeconds = Math.ceil((Date.now() - startedAt) / 1000);
        const outputMimeType =
          recorder.mimeType || mimeType || "audio/webm;codecs=opus";
        const blob = new Blob(chunksRef.current, { type: outputMimeType });
        chunksRef.current = [];

        if (blob.size <= 0) {
          handleRecordError("Geen audio opgenomen.");
          return;
        }

        if (blob.size > MAX_BYTES) {
          handleRecordError(
            `Opname is te groot. Maximum is ${Math.floor(
              MAX_BYTES / 1_000_000
            )} MB.`
          );
          return;
        }

        if (durationSeconds > MAX_SECONDS) {
          handleRecordError(`Opname is langer dan ${MAX_SECONDS} seconden.`);
          return;
        }

        setState("transcribing");
        setStatusText("Transcriptie bezig...");

        const requestId = resolveRequestId();
        const controller = new AbortController();
        transcribeAbortRef.current = controller;

        try {
          const result = await transcribe(blob, {
            language: languageHint,
            requestId,
            signal: controller.signal,
          });
          if (controller.signal.aborted) {
            if (transcribeAbortRef.current === controller) {
              setState("idle");
              setStatusText(null);
            }
            return;
          }

          const transcript = result.text.trim();
          if (!transcript) {
            handleRecordError("Geen transcript ontvangen.", result.requestId);
            return;
          }

          onTranscript(transcript);
          setState("idle");
          setStatusText(null);
        } catch (error) {
          if (controller.signal.aborted) {
            if (transcribeAbortRef.current === controller) {
              setState("idle");
              setStatusText(null);
            }
            return;
          }
          if (error instanceof TranscribeRequestError) {
            handleRecordError(error.message, error.requestId);
            return;
          }
          handleRecordError(
            error instanceof Error ? error.message : "Transcriptie is mislukt."
          );
        } finally {
          if (transcribeAbortRef.current === controller) {
            transcribeAbortRef.current = null;
          }
        }
      });

      recorder.start(250);
      setState("recording");
      setStatusText("Recording...");
      timerRef.current = setInterval(() => {
        if (!startedAtRef.current) {
          return;
        }
        const elapsed = Math.ceil((Date.now() - startedAtRef.current) / 1000);
        setElapsedSeconds(elapsed);
        if (elapsed >= MAX_SECONDS) {
          setStatusText(`Maximale opnameduur (${MAX_SECONDS}s) bereikt.`);
          stopRecording();
        }
      }, 250);
    } catch (error) {
      clearTimer();
      stopTracks();
      handleRecordError(
        error instanceof Error ? error.message : "Microfoon openen is mislukt."
      );
    }
  }, [
    clearTimer,
    disabled,
    handleRecordError,
    isTranscribing,
    languageHint,
    onTranscript,
    stopRecording,
    stopTracks,
  ]);

  const handleClick = useCallback(() => {
    if (disabled) {
      return;
    }
    if (isRecording) {
      stopRecording();
      return;
    }
    void startRecording();
  }, [disabled, isRecording, startRecording, stopRecording]);

  useEffect(() => {
    return () => {
      clearTimer();
      transcribeAbortRef.current?.abort();
      transcribeAbortRef.current = null;
      stopTracks();
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    };
  }, [clearTimer, stopTracks]);

  return (
    <div className="absolute bottom-2 right-12 flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-label={buttonLabel}
        title={buttonLabel}
        className="inline-flex aspect-square size-10 absolute bottom-0 right-3 items-center justify-center rounded-full border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isTranscribing ? (
          <Loader2 className="size-4 animate-spin" />
        ) : isRecording ? (
          <Square className="size-4" />
        ) : (
          <MicIcon className="size-4" />
        )}
      </button>
      {/* <span className="min-w-[72px] text-[11px] text-slate-500">
        {isRecording
          ? `${elapsedSeconds}s`
          : isTranscribing
          ? "Transcribing..."
          : statusText}
      </span> */}
    </div>
  );
}
