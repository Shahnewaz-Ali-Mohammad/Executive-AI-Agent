"use client";

/**
 * App-wide feedback:
 *   - confirm({ title, message, confirmLabel, danger }) → Promise<boolean>
 *     A proper dialog (not the browser's confirm box), for deletions.
 *   - toast("Task created")  → a short message at the bottom of the screen.
 */
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

type ToastTone = "success" | "info" | "error";

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface Feedback {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  toast: (message: string, tone?: ToastTone) => void;
}

const FeedbackContext = createContext<Feedback | null>(null);

export function useFeedback(): Feedback {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error("useFeedback must be used inside <FeedbackProvider>.");
  return value;
}

const TOAST_MS = 3500;

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );

  const toast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = ++nextId.current;
    setToasts((list) => [...list.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), TOAST_MS);
  }, []);

  const [value] = useState<Feedback>(() => ({ confirm, toast }));

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {pending && (
        <ConfirmDialog
          options={pending}
          onAnswer={(ok) => {
            pending.resolve(ok);
            setPending(null);
          }}
        />
      )}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {toasts.map((t) => {
          const Icon = t.tone === "error" ? TriangleAlert : t.tone === "info" ? Info : CheckCircle2;
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex max-w-md items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm text-paper shadow-lg"
            >
              <Icon className={cn("size-4 shrink-0", t.tone === "error" ? "text-alert-soft" : "text-ledger-soft")} aria-hidden />
              <span>{t.message}</span>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
                className="-mr-1 ml-1 rounded p-0.5 opacity-70 hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </FeedbackContext.Provider>
  );
}

function ConfirmDialog({ options, onAnswer }: { options: ConfirmOptions; onAnswer: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onAnswer(false);
      }}
      onClick={(event) => event.target === ref.current && onAnswer(false)}
      aria-labelledby="confirm-title"
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-rule bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40"
    >
      <div className="flex items-start gap-3 p-5">
        <div className="min-w-0 flex-1">
          <h2 id="confirm-title" className="text-base font-medium">
            {options.title}
          </h2>
          {options.message && <div className="mt-1.5 text-sm text-slate">{options.message}</div>}
        </div>
        <IconButton aria-label="Close" onClick={() => onAnswer(false)} className="-mt-1 -mr-2 size-8">
          <X className="size-4" />
        </IconButton>
      </div>
      <div className="flex justify-end gap-2 border-t border-rule px-5 py-3">
        <Button variant="quiet" onClick={() => onAnswer(false)}>
          Cancel
        </Button>
        <Button
          autoFocus
          disabled={busy}
          onClick={() => {
            setBusy(true);
            onAnswer(true);
          }}
          className={cn(options.danger && "bg-alert hover:opacity-90")}
        >
          {options.confirmLabel ?? "Confirm"}
        </Button>
      </div>
    </dialog>
  );
}
