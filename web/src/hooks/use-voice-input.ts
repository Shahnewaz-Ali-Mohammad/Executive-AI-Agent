"use client";

/**
 * Voice dictation for the chat box.
 *
 * 1. Preferred: the browser's own speech recognition (Chrome, Edge, Safari).
 *    Free, instant, and the words appear while the CEO is still speaking.
 * 2. Fallback (e.g. Firefox): record audio with MediaRecorder, then send it
 *    to /api/transcribe (OpenAI transcription) when the CEO taps the mic again.
 *
 * `onTranscript(text)` receives the full dictated text so far each time it changes.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api-client";

// The Web Speech API isn't in TypeScript's DOM types yet; describe what we use.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, SpeechRecognitionConstructor | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Browser support never changes while the page is open. */
const subscribeNever = () => () => {};

export type VoiceState = "idle" | "listening" | "transcribing";

export function useVoiceInput(onTranscript: (text: string) => void) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  // Read on the client only (false during server rendering → no hydration mismatch).
  const supported = useSyncExternalStore(
    subscribeNever,
    () => getSpeechRecognition() !== null || typeof window.MediaRecorder !== "undefined",
    () => false,
  );

  /** Path 1: live browser speech recognition. */
  const startBrowserRecognition = useCallback((Recognition: SpeechRecognitionConstructor) => {
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    let finalText = "";
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      onTranscriptRef.current((finalText + interim).trim());
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted" && event.error !== "no-speech") {
        setError(event.error === "not-allowed" ? "Microphone access was blocked." : "Voice input stopped.");
      }
    };
    recognition.onend = () => setState("idle");

    recognitionRef.current = recognition;
    recognition.start();
    setState("listening");
  }, []);

  /** Path 2: record, then transcribe on the server. */
  const startRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];

    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      setState("transcribing");
      try {
        const { text } = await api.transcribe(new Blob(chunks, { type: recorder.mimeType }));
        if (text) onTranscriptRef.current(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Transcription failed.");
      } finally {
        setState("idle");
      }
    };

    recorderRef.current = recorder;
    recorder.start();
    setState("listening");
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const Recognition = getSpeechRecognition();
      if (Recognition) startBrowserRecognition(Recognition);
      else await startRecording();
    } catch {
      setError("Couldn't start the microphone.");
      setState("idle");
    }
  }, [startBrowserRecognition, startRecording]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
  }, []);

  // Release the microphone if the component unmounts mid-recording.
  useEffect(() => stop, [stop]);

  return { state, error, supported, start, stop };
}
