"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MicIcon, Square } from "lucide-react";

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

// Boost quiet speech so the waveform is visibly moving.
// Tune between ~1.8 (less clipping) and ~3.5 (more lively) if needed.
const AMPLIFICATION = 2;

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

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VoiceRecorder({
  disabled,
  languageHint,
  onTranscript,
  onError,
}: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const transcribeAbortRef = useRef<AbortController | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  const isRecording = state === "recording";
  const isTranscribing = state === "transcribing";
  const isActive = isRecording || isTranscribing;

  const buttonLabel = useMemo(() => {
    if (isRecording) return "Stop opname";
    if (isTranscribing) return "Transcriptie bezig";
    return "Start spraakopname";
  }, [isRecording, isTranscribing]);

  // ── Waveform ──────────────────────────────────────────────────────────────

  const drawWaveform = useCallback(() => {
    if (!isDrawingRef.current) return;

    const canvas = canvasRef.current;
    const analyser = analyserRef.current;

    // Canvas not mounted yet (state hasn't flushed) — try again next frame
    if (!canvas || !analyser) {
      animFrameRef.current = requestAnimationFrame(drawWaveform);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Sync bitmap to displayed size × devicePixelRatio so lines stay sharp
    // on high-DPI displays and aren't stretched by the flex container.
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const targetW = Math.floor(rect.width * dpr);
    const targetH = Math.floor(rect.height * dpr);
    if (targetW > 0 && targetH > 0) {
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    }

    const w = canvas.width;
    const h = canvas.height;

    // Time-domain data: actual audio waveform samples (128 = silence)
    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    ctx.clearRect(0, 0, w, h);

    // Subtle centre baseline
    ctx.beginPath();
    ctx.strokeStyle = "rgba(46, 163, 242, 0.2)";
    ctx.lineWidth = 1 * dpr;
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Actual waveform line
    ctx.beginPath();
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = "#2ea3f2";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const sliceWidth = w / bufferLength;
    const mid = h / 2;

    for (let i = 0; i < bufferLength; i++) {
      // Center around 128, amplify, clamp, then map to canvas height
      const normalized = (dataArray[i] - 128) / 128; // -1..1
      const amplified = Math.max(-1, Math.min(1, normalized * AMPLIFICATION));
      const y = mid + amplified * mid;
      const x = i * sliceWidth;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    animFrameRef.current = requestAnimationFrame(drawWaveform);
  }, []);

  const stopWaveform = useCallback(() => {
    isDrawingRef.current = false;
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const startWaveform = useCallback(
    (stream: MediaStream) => {
      try {
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;
        audioContext.createMediaStreamSource(stream).connect(analyser);
        isDrawingRef.current = true;
        drawWaveform();
      } catch {
        // AudioContext not available — skip waveform silently
      }
    },
    [drawWaveform]
  );

  // ── Recording helpers ─────────────────────────────────────────────────────

  const clearTimer = useCallback(() => {
    if (!timerRef.current) return;
    clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const stopTracks = useCallback(() => {
    if (!streamRef.current) return;
    for (const track of streamRef.current.getTracks()) {
      track.stop();
    }
    streamRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    clearTimer();
    recorder.stop();
    setState("transcribing");
  }, [clearTimer]);

  const handleRecordError = useCallback(
    (message: string, requestId?: string) => {
      stopWaveform();
      setState("error");
      onError?.({ message, requestId });
    },
    [onError, stopWaveform]
  );

  const startRecording = useCallback(async () => {
    if (disabled) return;

    if (isTranscribing) {
      transcribeAbortRef.current?.abort();
      transcribeAbortRef.current = null;
    }

    clearTimer();
    stopTracks();
    stopWaveform();
    chunksRef.current = [];
    setElapsedSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      startWaveform(stream);

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
        stopWaveform();

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
        } catch (error) {
          if (controller.signal.aborted) {
            if (transcribeAbortRef.current === controller) {
              setState("idle");
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
      timerRef.current = setInterval(() => {
        if (!startedAtRef.current) return;
        const elapsed = Math.ceil((Date.now() - startedAtRef.current) / 1000);
        setElapsedSeconds(elapsed);
        if (elapsed >= MAX_SECONDS) {
          stopRecording();
        }
      }, 250);
    } catch (error) {
      clearTimer();
      stopTracks();
      stopWaveform();
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
    startWaveform,
    stopRecording,
    stopTracks,
    stopWaveform,
  ]);

  const handleClick = useCallback(() => {
    if (disabled) return;
    if (isRecording) {
      stopRecording();
      return;
    }
    void startRecording();
  }, [disabled, isRecording, startRecording, stopRecording]);

  useEffect(() => {
    return () => {
      clearTimer();
      stopWaveform();
      transcribeAbortRef.current?.abort();
      transcribeAbortRef.current = null;
      stopTracks();
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    };
  }, [clearTimer, stopTracks, stopWaveform]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Recording / transcribing overlay pill */}
      {isActive && (
        <div className="absolute bottom-2 left-3 right-24 flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 h-10">
          {isTranscribing ? (
            <>
              <Loader2 className="size-3.5 shrink-0 animate-spin text-[#2ea3f2]" />
              <span className="truncate text-xs text-slate-500">
                Transcriptie bezig...
              </span>
            </>
          ) : (
            <>
              {/* Pulsing red dot */}
              <span className="relative flex size-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-red-500" />
              </span>
              <canvas ref={canvasRef} className="min-w-0 flex-1 h-6" />
              <span className="shrink-0 tabular-nums text-xs text-slate-400">
                {formatTime(elapsedSeconds)}
              </span>
            </>
          )}
        </div>
      )}

      {/* Mic / stop button */}
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isTranscribing}
        aria-label={buttonLabel}
        title={buttonLabel}
        className={[
          "inline-flex mr-2 aspect-square size-10 absolute bottom-2 right-12 items-center justify-center rounded-full p-2 transition",
          isRecording
            ? "bg-red-500 border border-red-400 text-white hover:bg-red-600"
            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
        ].join(" ")}
      >
        {isRecording ? (
          <Square className="size-3.5 fill-white" />
        ) : isTranscribing ? (
          <Loader2 className="size-4 animate-spin text-slate-400" />
        ) : (
          <MicIcon className="size-4" />
        )}
      </button>
    </>
  );
}
