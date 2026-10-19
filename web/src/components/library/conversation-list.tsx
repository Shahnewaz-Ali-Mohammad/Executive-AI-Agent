"use client";

/**
 * Saved conversations of the open workspace.
 *
 * Built for a list that keeps growing: newest first, grouped by when the last
 * message was sent (Today, Yesterday, Previous 7 days, then by month), with a
 * search box. Each entry shows the date and time of its last message and how
 * many messages it holds.
 */
import { Check, Pencil, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { IconButton } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { formatDateTime, formatFullDateTime, formatRecencyGroup } from "@/lib/dates";
import type { ConversationDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ConversationListProps {
  conversations: ConversationDTO[];
  activeId: string | null;
  loading: boolean;
  /** Address of a conversation. */
  hrefFor: (id: string) => string;
  /** Called when one is opened (closes the menu on phones). */
  onNavigate?: () => void;
  onRename: (id: string, title: string) => Promise<unknown>;
  /** Asks for confirmation itself. */
  onDelete: (id: string) => Promise<unknown>;
}

interface Group {
  label: string;
  items: ConversationDTO[];
}

/** Consecutive conversations (already newest first) under one date heading. */
function groupByRecency(conversations: ConversationDTO[]): Group[] {
  const groups: Group[] = [];
  for (const conversation of conversations) {
    const label = formatRecencyGroup(conversation.updatedAt);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(conversation);
    else groups.push({ label, items: [conversation] });
  }
  return groups;
}

function messageCountLabel(count: number): string {
  if (count === 0) return "No messages yet";
  return `${count} message${count === 1 ? "" : "s"}`;
}

export function ConversationList({
  conversations,
  activeId,
  loading,
  hrefFor,
  onNavigate,
  onRename,
  onDelete,
}: ConversationListProps) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = needle ? conversations.filter((c) => c.title.toLowerCase().includes(needle)) : conversations;
    return groupByRecency(matching);
  }, [conversations, query]);

  if (loading) return <p className="px-4 text-sm text-slate">Loading conversations…</p>;
  if (conversations.length === 0) {
    return (
      <p className="px-4 text-sm text-slate">
        No conversations yet. Ask a question and it&apos;s saved here automatically.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="px-3">
        <SearchField value={query} onChange={setQuery} placeholder="Search conversations" label="Search conversations" />
      </div>

      {groups.length === 0 && <p className="px-4 text-sm text-slate">No conversation titles match “{query}”.</p>}

      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h3 className="px-4 pb-1 text-[0.7rem] font-medium tracking-wide text-slate uppercase">{group.label}</h3>
          <ul className="px-2">
            {group.items.map((conversation) =>
              editingId === conversation.id ? (
                <li key={conversation.id}>
                  <TitleForm
                    initial={conversation.title}
                    onCancel={() => setEditingId(null)}
                    onSave={async (title) => {
                      await onRename(conversation.id, title);
                      setEditingId(null);
                    }}
                  />
                </li>
              ) : (
                <li key={conversation.id} className="group relative">
                  <Link
                    href={hrefFor(conversation.id)}
                    onClick={onNavigate}
                    aria-current={conversation.id === activeId ? "page" : undefined}
                    className={cn(
                      "block w-full rounded-md py-2 pr-16 pl-3 text-left transition-colors",
                      conversation.id === activeId
                        ? "bg-paper shadow-[inset_2px_0_0_var(--ledger)]"
                        : "hover:bg-paper",
                    )}
                  >
                    <span
                      className={cn(
                        "block truncate text-sm",
                        conversation.id === activeId ? "font-medium text-ink" : "text-ink/90",
                      )}
                    >
                      {conversation.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate tabular-nums">
                      <time dateTime={conversation.updatedAt} title={`Last message: ${formatFullDateTime(conversation.updatedAt)}`}>
                        {formatDateTime(conversation.updatedAt)}
                      </time>
                      {" · "}
                      {messageCountLabel(conversation.messageCount)}
                    </span>
                  </Link>
                  {/* Always visible on touch screens (no hover there). */}
                  <div className="absolute top-1/2 right-1 flex -translate-y-1/2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                    <IconButton
                      aria-label={`Rename ${conversation.title}`}
                      onClick={() => setEditingId(conversation.id)}
                      className="size-7"
                    >
                      <Pencil className="size-3.5" />
                    </IconButton>
                    <IconButton
                      aria-label={`Delete ${conversation.title}`}
                      onClick={() => void onDelete(conversation.id)}
                      className="size-7 hover:text-alert"
                    >
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </div>
                </li>
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Inline text field for renaming a conversation. */
function TitleForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (title: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return onCancel();
    try {
      await onSave(title.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  return (
    <form onSubmit={submit} className="py-1">
      <div className="flex items-center gap-1 rounded-md border border-ledger bg-surface pl-2">
        <input
          autoFocus
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && onCancel()}
          aria-label="Conversation title"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-ink outline-none"
        />
        <IconButton type="submit" aria-label="Save title" className="size-7 text-ledger">
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
