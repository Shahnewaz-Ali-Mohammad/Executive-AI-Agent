"use client";

/**
 * Workspace picker at the top of the menu: the open workspace's name, and
 * a dropdown to switch, create, rename or delete workspaces. A dropdown (not
 * a list) so the menu stays the same height however many workspaces exist.
 */
import { Check, ChevronsUpDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { IconButton } from "@/components/ui/button";
import type { WorkspaceDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

interface WorkspaceSwitcherProps {
  workspaces: WorkspaceDTO[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<unknown>;
  onRename: (id: string, name: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}

export function WorkspaceSwitcher({ workspaces, activeId, onSelect, onCreate, onRename, onDelete }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = workspaces.find((w) => w.id === activeId);

  // Close when clicking outside or pressing Escape.
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setCreating(false);
    setEditingId(null);
  }

  async function handleDelete(workspace: WorkspaceDTO) {
    close();
    await onDelete(workspace.id); // asks for confirmation
  }

  return (
    <div ref={rootRef} className="relative px-3">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex w-full items-center gap-2 rounded-md border border-rule bg-paper px-3 py-2 text-left transition-colors hover:border-slate"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[0.7rem] text-slate">Workspace</span>
          <span className="block truncate text-sm font-medium text-ink">{active?.name ?? "—"}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-slate" aria-hidden />
      </button>

      {open && (
        <div className="absolute inset-x-3 top-full z-20 mt-1 rounded-lg border border-rule bg-surface p-1 shadow-lg">
          <ul className="max-h-72 overflow-y-auto" aria-label="Workspaces">
            {workspaces.map((workspace) =>
              editingId === workspace.id ? (
                <li key={workspace.id}>
                  <NameForm
                    initial={workspace.name}
                    onCancel={() => setEditingId(null)}
                    onSave={async (name) => {
                      await onRename(workspace.id, name);
                      setEditingId(null);
                    }}
                  />
                </li>
              ) : (
                <li key={workspace.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(workspace.id);
                      close();
                    }}
                    aria-current={workspace.id === activeId ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md py-2 pr-16 pl-2 text-left text-sm transition-colors hover:bg-paper",
                      workspace.id === activeId ? "font-medium text-ink" : "text-slate hover:text-ink",
                    )}
                  >
                    <Check
                      className={cn("size-3.5 shrink-0 text-ledger", workspace.id !== activeId && "invisible")}
                      aria-hidden
                    />
                    <span className="truncate">{workspace.name}</span>
                  </button>
                  <div className="absolute top-1/2 right-1 flex -translate-y-1/2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                    <IconButton aria-label={`Rename ${workspace.name}`} onClick={() => setEditingId(workspace.id)} className="size-7">
                      <Pencil className="size-3.5" />
                    </IconButton>
                    <IconButton
                      aria-label={`Delete ${workspace.name}`}
                      onClick={() => handleDelete(workspace)}
                      className="size-7 hover:text-alert"
                    >
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </div>
                </li>
              ),
            )}
          </ul>
          <div className="mt-1 border-t border-rule pt-1">
            {creating ? (
              <NameForm
                initial=""
                placeholder="e.g. Board – Q3"
                onCancel={() => setCreating(false)}
                onSave={async (name) => {
                  await onCreate(name);
                  close();
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-slate hover:bg-paper hover:text-ink"
              >
                <Plus className="size-3.5" aria-hidden /> New workspace
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Inline text field for naming a workspace. */
function NameForm({
  initial,
  placeholder,
  onSave,
  onCancel,
}: {
  initial: string;
  placeholder?: string;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return onCancel();
    try {
      await onSave(name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  return (
    <form onSubmit={submit} className="p-1">
      <div className="flex items-center gap-1 rounded-md border border-ledger bg-surface pl-2">
        <input
          autoFocus
          value={name}
          placeholder={placeholder}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              onCancel();
            }
          }}
          aria-label="Workspace name"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-ink outline-none"
        />
        <IconButton type="submit" aria-label="Save name" className="size-7 text-ledger">
          <Check className="size-4" />
        </IconButton>
        <IconButton aria-label="Cancel" onClick={onCancel} className="size-7">
          <X className="size-4" />
        </IconButton>
      </div>
      {error && <p className="mt-1 px-1 text-xs text-alert">{error}</p>}
    </form>
  );
}
