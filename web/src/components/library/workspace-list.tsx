"use client";

/**
 * Workspace navigation: one private space per topic (a board meeting, a deal,
 * a key client). Search and chat never cross between workspaces.
 */
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { IconButton } from "@/components/ui/button";
import type { WorkspaceDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

interface WorkspaceListProps {
  workspaces: WorkspaceDTO[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<unknown>;
  onRename: (id: string, name: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}

export function WorkspaceList({ workspaces, activeId, onSelect, onCreate, onRename, onDelete }: WorkspaceListProps) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleDelete(workspace: WorkspaceDTO) {
    const confirmed = window.confirm(
      `Delete "${workspace.name}"? Its documents and conversations will be permanently removed.`,
    );
    if (confirmed) await onDelete(workspace.id);
  }

  return (
    <nav aria-label="Workspaces">
      <div className="flex items-center justify-between px-4 pb-1">
        <h2 className="text-xs font-medium text-slate">Workspaces</h2>
        <IconButton aria-label="New workspace" onClick={() => setCreating(true)} className="size-7">
          <Plus className="size-4" />
        </IconButton>
      </div>

      <ul className="px-2">
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
                onClick={() => onSelect(workspace.id)}
                aria-current={workspace.id === activeId ? "page" : undefined}
                className={cn(
                  "w-full truncate rounded-md py-2 pr-16 pl-3 text-left text-sm transition-colors",
                  workspace.id === activeId
                    ? "bg-paper font-medium text-ink shadow-[inset_2px_0_0_var(--ledger)]"
                    : "text-slate hover:bg-paper hover:text-ink",
                )}
              >
                {workspace.name}
              </button>
              <div className="absolute top-1/2 right-1 flex -translate-y-1/2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                <IconButton aria-label={`Rename ${workspace.name}`} onClick={() => setEditingId(workspace.id)} className="size-7">
                  <Pencil className="size-3.5" />
                </IconButton>
                <IconButton aria-label={`Delete ${workspace.name}`} onClick={() => handleDelete(workspace)} className="size-7 hover:text-alert">
                  <Trash2 className="size-3.5" />
                </IconButton>
              </div>
            </li>
          ),
        )}
        {creating && (
          <li>
            <NameForm
              initial=""
              placeholder="e.g. Board – Q3"
              onCancel={() => setCreating(false)}
              onSave={async (name) => {
                await onCreate(name);
                setCreating(false);
              }}
            />
          </li>
        )}
      </ul>
    </nav>
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
    <form onSubmit={submit} className="py-1">
      <div className="flex items-center gap-1 rounded-md border border-ledger bg-surface pl-2">
        <input
          autoFocus
          value={name}
          placeholder={placeholder}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && onCancel()}
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
