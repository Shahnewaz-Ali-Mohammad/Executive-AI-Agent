"use client";

/**
 * The question box: response-mode picker, text area, attach, voice, send/stop.
 * Enter sends; Shift+Enter adds a new line.
 */
import { ArrowUp, Mic, Paperclip, Square } from "lucide-react";
import { useCallback, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { IconButton } from "@/components/ui/button";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { getResponseMode, RESPONSE_MODES, type ResponseModeId } from "@/lib/response-modes";
import { cn } from "@/lib/utils";

interface ComposerProps {
  mode: ResponseModeId;
  onModeChange: (mode: ResponseModeId) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onAttach: () => void;
  isRunning: boolean;
  disabled?: boolean;
}

export function Composer({ mode, onModeChange, onSend, onStop, onAttach, isRunning, disabled = false }: ComposerProps) {
  const [text, setText] = useState("");
  // Text that was already in the box when dictation started, so speech is appended to it.
  const textBeforeVoice = useRef("");

  const handleTranscript = useCallback((spoken: string) => {
    setText(textBeforeVoice.current ? `${textBeforeVoice.current} ${spoken}` : spoken);
  }, []);
  const voice = useVoiceInput(handleTranscript);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (voice.state === "listening") voice.stop();
    const question = text.trim();
    if (!question || isRunning || disabled) return;
    onSend(question);
    setText("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  function toggleVoice() {
    if (voice.state === "listening") {
      voice.stop();
    } else {
      textBeforeVoice.current = text.trim();
      void voice.start();
    }
  }

  const listening = voice.state === "listening";

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-3xl px-3 pb-3 sm:px-8 sm:pb-6">
      {/* Response mode */}
      <div
        role="radiogroup"
        aria-label="Response mode"
        className="-mx-1 mb-2 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]"
      >
        {RESPONSE_MODES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={mode === option.id}
            title={option.description}
            onClick={() => onModeChange(option.id)}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-[0.8rem] transition-colors",
              mode === option.id ? "bg-ink text-surface" : "text-slate hover:bg-surface hover:text-ink",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div
        className={cn(
          "rounded-xl border bg-surface shadow-[0_1px_0_var(--rule)] transition-colors",
          listening ? "border-ledger" : "border-rule focus-within:border-ledger",
        )}
      >
        <label htmlFor="question" className="sr-only">
          Your question
        </label>
        <textarea
          id="question"
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={listening ? "Listening…" : "Ask about your documents"}
          className="field-sizing-content block max-h-48 min-h-[3rem] w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-base text-ink outline-none placeholder:text-slate/70"
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <IconButton aria-label="Add documents" onClick={onAttach} disabled={disabled}>
            <Paperclip className="size-[18px]" />
          </IconButton>
          {voice.supported && (
            <IconButton
              aria-label={listening ? "Stop dictation" : "Dictate a question"}
              aria-pressed={listening}
              onClick={toggleVoice}
              disabled={disabled || voice.state === "transcribing"}
              className={cn(listening && "bg-ledger-soft text-ledger hover:bg-ledger-soft hover:text-ledger")}
            >
              <Mic className={cn("size-[18px]", listening && "animate-pulse")} />
            </IconButton>
          )}
          <span className="ml-1 truncate text-xs text-slate">
            {voice.error ??
              (voice.state === "transcribing" ? "Transcribing…" : getResponseMode(mode).description)}
          </span>
          <span className="flex-1" />
          {isRunning ? (
            <IconButton aria-label="Stop answer" onClick={onStop} className="bg-ink text-surface hover:bg-ink hover:text-surface">
              <Square className="size-3.5 fill-current" />
            </IconButton>
          ) : (
            <IconButton
              type="submit"
              aria-label="Send question"
              disabled={disabled || !text.trim()}
              className="bg-ledger text-surface hover:bg-ledger hover:text-surface hover:opacity-90"
            >
              <ArrowUp className="size-[18px]" />
            </IconButton>
          )}
        </div>
      </div>
    </form>
  );
}
