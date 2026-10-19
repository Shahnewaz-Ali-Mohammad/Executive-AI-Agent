"use client";

/**
 * The frame around every page of a workspace:
 *
 *   ┌────────────┬──────────────────────────────────┬────────────────────┐
 *   │ Menu       │ Workspace / Page            🔔   │ Right panel        │
 *   │ workspace  ├──────────────────────────────────┤ (source, form,     │
 *   │ sections   │ the page: chat, Documents,       │  notification,     │
 *   │ convers.   │ Forms, Tasks, Notifications …    │  new task …)       │
 *   └────────────┴──────────────────────────────────┴────────────────────┘
 *        phones: the menu slides in, a tab bar sits at the bottom,
 *                and the right panel covers the screen.
 *
 * It loads the workspace's data once and keeps it while the CEO moves between
 * pages. The chat stays mounted (hidden on other pages), so an answer keeps
 * streaming while you look at a document or a task. Which page, which
 * conversation and which panel are all in the address, so Back, Forward,
 * reload and links work everywhere.
 */
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChatView } from "@/components/chat/chat-view";
import { FeedbackProvider, useFeedback } from "@/components/ui/feedback";
import { useAutomations } from "@/hooks/use-automations";
import { useConversations } from "@/hooks/use-conversations";
import { useDocuments } from "@/hooks/use-documents";
import { useKeyFacts } from "@/hooks/use-key-facts";
import { useForms } from "@/hooks/use-forms";
import { useNotifications } from "@/hooks/use-notifications";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { FILE_INPUT_ACCEPT } from "@/lib/file-types";
import { DEFAULT_RESPONSE_MODE, type ResponseModeId } from "@/lib/response-modes";
import { lastVisited, panelFromSearch, panelSearch, routes, viewFromPath, workspaceHome, type Panel } from "@/lib/routes";
import type { WorkspaceDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MobileNav } from "./mobile-nav";
import { RightPanel } from "./right-panel";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { WorkspaceContext, type WorkspaceContextValue } from "./workspace-context";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  return (
    <FeedbackProvider>
      {/* `key`: a different workspace starts with fresh state, never mixing two. */}
      <WorkspaceGate key={workspaceId} workspaceId={workspaceId}>
        {children}
      </WorkspaceGate>
    </FeedbackProvider>
  );
}

/** Loads the workspace list; handles "loading", errors and unknown workspaces. */
function WorkspaceGate({ workspaceId, children }: { workspaceId: string; children: ReactNode }) {
  const workspaces = useWorkspaces();
  const workspace = workspaces.workspaces.find((w) => w.id === workspaceId);

  if (workspaces.loading) return <FullScreen>Loading…</FullScreen>;
  if (workspaces.error) {
    return (
      <FullScreen>
        <p className="max-w-xl text-alert">{workspaces.error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-md border border-rule px-3 py-1.5 text-sm text-ink hover:border-slate"
        >
          Try again
        </button>
      </FullScreen>
    );
  }
  if (!workspace) {
    const first = workspaces.workspaces[0];
    return (
      <FullScreen>
        <h1 className="font-serif text-2xl text-ink">Workspace not found</h1>
        <p className="mt-2 text-sm text-slate">It may have been deleted, or the link is wrong.</p>
        {first && (
          <a
            href={routes.workspace(first.id)}
            onClick={() => lastVisited.setWorkspace(first.id)}
            className="mt-6 inline-block rounded-md bg-ledger px-4 py-2 text-sm font-medium text-surface hover:opacity-90"
          >
            Go to {first.name}
          </a>
        )}
      </FullScreen>
    );
  }
  return (
    <WorkspaceScreen workspace={workspace} workspaces={workspaces}>
      {children}
    </WorkspaceScreen>
  );
}

/** The answer mode last chosen, kept when switching workspace. */
let lastMode: ResponseModeId = DEFAULT_RESPONSE_MODE;

function WorkspaceScreen({
  workspace,
  workspaces,
  children,
}: {
  workspace: WorkspaceDTO;
  workspaces: ReturnType<typeof useWorkspaces>;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams<{ workspaceId: string; conversationId?: string }>();
  const { toast } = useFeedback();
  const workspaceId = workspace.id;

  const view = viewFromPath(pathname);
  const panel = useMemo(() => panelFromSearch(new URLSearchParams(searchParams.toString())), [searchParams]);

  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // A fresh chat was just saved: show its address (without reloading the chat).
  const handleCreated = useCallback(
    (id: string) => {
      if (viewRef.current === "chat") router.replace(routes.chat(workspaceId, id), { scroll: false });
    },
    [router, workspaceId],
  );
  const documents = useDocuments(workspaceId);
  const keyFacts = useKeyFacts(workspaceId, documents.documents);
  const conversations = useConversations(workspaceId, {
    addressConversationId: params.conversationId ?? null,
    followAddress: view === "chat",
    onCreated: handleCreated,
  });
  const forms = useForms(workspaceId);
  const automations = useAutomations(workspaceId);
  // New notifications usually mean a schedule ran or a task fell due.
  const notifications = useNotifications(automations.refresh);

  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState({ key: 0, text: "" });
  const [mode, setModeState] = useState<ResponseModeId>(() => lastMode);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    lastVisited.setWorkspace(workspaceId);
  }, [workspaceId]);

  // A new chat that was saved while another page was open: give it its address on return.
  const savedFreshChat =
    view === "chat" && !params.conversationId && conversations.session?.conversationId === null
      ? conversations.activeId
      : null;
  useEffect(() => {
    if (savedFreshChat) router.replace(routes.chat(workspaceId, savedFreshChat), { scroll: false });
  }, [savedFreshChat, router, workspaceId]);

  const setMode = useCallback((next: ResponseModeId) => {
    lastMode = next;
    setModeState(next);
  }, []);

  const openPanel = useCallback(
    (next: Panel) => {
      setMenuOpen(false);
      router.push(`${pathname}${panelSearch(next)}`, { scroll: false });
    },
    [router, pathname],
  );
  const replacePanel = useCallback(
    (next: Panel) => router.replace(`${pathname}${panelSearch(next)}`, { scroll: false }),
    [router, pathname],
  );
  const closePanel = useCallback(() => router.replace(pathname, { scroll: false }), [router, pathname]);

  // Escape closes the panel.
  useEffect(() => {
    if (!panel) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, closePanel]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const count = await documents.upload(files);
      if (count > 0) {
        toast(`${count} file${count > 1 ? "s" : ""} added · reading them now`);
        if (viewRef.current !== "documents" && viewRef.current !== "chat") router.push(routes.documents(workspaceId));
      }
    },
    [documents, toast, router, workspaceId],
  );

  const newConversation = useCallback(
    (text?: string) => {
      setMenuOpen(false);
      setDraft((current) => ({ key: current.key + 1, text: text ?? "" }));
      if (view === "chat" && !params.conversationId) conversations.startFresh();
      else router.push(routes.workspace(workspaceId));
    },
    [view, params.conversationId, conversations, router, workspaceId],
  );

  const value: WorkspaceContextValue = {
    workspace,
    workspaceId,
    view,
    workspaces,
    documents,
    keyFacts,
    conversations,
    forms,
    automations,
    notifications,
    panel,
    openPanel,
    replacePanel,
    closePanel,
    pickFiles: () => fileInputRef.current?.click(),
    uploadFiles: (files) => void uploadFiles(files),
    newConversation,
    mode,
    setMode,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      <div className="flex h-full">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onOpenMenu={() => setMenuOpen(true)} />
          <main className="relative min-h-0 flex-1">
            {/* The chat stays mounted on every page so answers keep streaming. */}
            {conversations.session && (
              <div className={cn("h-full", view !== "chat" && "hidden")} aria-hidden={view !== "chat"}>
                <ChatView
                  key={conversations.session.key}
                  session={conversations.session}
                  draft={draft}
                  onDraft={(text) => setDraft((current) => ({ key: current.key + 1, text }))}
                />
              </div>
            )}
            {view === "chat" && !conversations.session && <p className="p-8 text-sm text-slate">Loading…</p>}
            {view !== "chat" && <div className="h-full overflow-y-auto">{children}</div>}
          </main>
          <MobileNav />
        </div>

        {panel && (
          <div className="fixed inset-0 z-50 lg:static lg:z-auto lg:w-[min(46vw,46rem)] lg:shrink-0 lg:border-l lg:border-rule">
            <RightPanel panel={panel} />
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={FILE_INPUT_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = ""; // allow picking the same file again
          void uploadFiles(files);
        }}
      />
    </WorkspaceContext.Provider>
  );
}

function FullScreen({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center p-8 text-center text-sm text-slate">{children}</div>;
}

/** "/" → the workspace (and conversation) used last, or the first one. */
export function HomeRedirect() {
  const router = useRouter();
  const workspaces = useWorkspaces();

  useEffect(() => {
    if (workspaces.loading || workspaces.workspaces.length === 0) return;
    const last = lastVisited.workspace();
    const target = workspaces.workspaces.find((w) => w.id === last) ?? workspaces.workspaces[0];
    router.replace(workspaceHome(target.id));
  }, [workspaces.loading, workspaces.workspaces, router]);

  if (workspaces.error) {
    return (
      <FullScreen>
        <p className="max-w-xl text-alert">{workspaces.error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-md border border-rule px-3 py-1.5 text-sm text-ink hover:border-slate"
        >
          Try again
        </button>
      </FullScreen>
    );
  }
  return <FullScreen>Loading…</FullScreen>;
}
