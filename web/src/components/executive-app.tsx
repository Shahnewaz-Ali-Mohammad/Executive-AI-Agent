"use client";

/**
 * The whole app screen. It owns the state and wires the pieces together:
 *
 *   ┌──────────────────┬──────────────────────────┬────────────────────┐
 *   │ Workspace ▾      │ Conversation        🔔   │ Right panel:       │
 *   │ + New convers.   │ answers with citations,  │ - source document  │
 *   │ [Chats|Files|    │ cards (forms, tasks,     │ - saved form       │
 *   │  Forms|Tasks]    │ schedules), date and     │ - template editor  │
 *   │ grouped lists    │ time; question + modes   │ - notification     │
 *   └──────────────────┴──────────────────────────┴────────────────────┘
 *
 * The bell shows notifications from n8n's scheduler: finished reports,
 * reminders, tasks falling due.
 *
 * On phones the library becomes a slide-in drawer and the viewer covers the
 * screen, so each part gets the full width.
 */
import { LogOut, Menu, SquarePen, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Composer } from "@/components/chat/composer";
import { ConversationList } from "@/components/library/conversation-list";
import { EmptyState } from "@/components/chat/empty-state";
import { MessageList } from "@/components/chat/message-list";
import { ChatCard } from "@/components/chat/chat-card";
import { TasksPanel } from "@/components/automation/tasks-panel";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import { FormsPanel } from "@/components/forms/forms-panel";
import { SubmissionPanel } from "@/components/forms/submission-panel";
import { TemplateEditor } from "@/components/forms/template-editor";
import { DocumentLibrary } from "@/components/library/document-library";
import { WorkspaceSwitcher } from "@/components/library/workspace-switcher";
import { IconButton } from "@/components/ui/button";
import { SourceViewer } from "@/components/viewer/source-viewer";
import { useAutomations } from "@/hooks/use-automations";
import { useConversations, type ChatSession } from "@/hooks/use-conversations";
import { useDocuments } from "@/hooks/use-documents";
import { useForms } from "@/hooks/use-forms";
import { useExecutiveChat } from "@/hooks/use-executive-chat";
import { useNotifications } from "@/hooks/use-notifications";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { api } from "@/lib/api-client";
import { FILE_INPUT_ACCEPT } from "@/lib/file-types";
import type { DocumentDTO, WorkspaceDTO } from "@/lib/types";
import { DEFAULT_RESPONSE_MODE, type ResponseModeId } from "@/lib/response-modes";
import { cn } from "@/lib/utils";

type SidebarTab = "chats" | "files" | "forms" | "tasks";

/** What the right-hand panel shows. */
type RightPanel =
  | { kind: "source"; documentId: string; page: number }
  | { kind: "submission"; submissionId: string }
  | { kind: "template"; templateId: string | null } // null = new template
  | { kind: "notification"; notificationId: string };

export function ExecutiveApp() {
  const workspaces = useWorkspaces();
  // Kept here (not per workspace) so the chosen mode survives switching workspace.
  const [mode, setMode] = useState<ResponseModeId>(DEFAULT_RESPONSE_MODE);

  if (workspaces.loading) {
    return <p className="p-8 text-sm text-slate">Loading…</p>;
  }
  if (workspaces.error || !workspaces.active) {
    return (
      <div className="p-8">
        <p className="max-w-xl text-alert">{workspaces.error ?? "No workspace available."}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-md border border-rule px-3 py-1.5 text-sm text-ink hover:border-slate"
        >
          Reload
        </button>
      </div>
    );
  }

  // `key` re-mounts the screen per workspace, so documents, chat and viewer
  // state always belong to exactly one workspace.
  return (
    <WorkspaceScreen
      key={workspaces.active.id}
      workspace={workspaces.active}
      workspaces={workspaces}
      mode={mode}
      onModeChange={setMode}
    />
  );
}

interface WorkspaceScreenProps {
  workspace: WorkspaceDTO;
  workspaces: ReturnType<typeof useWorkspaces>;
  mode: ResponseModeId;
  onModeChange: (mode: ResponseModeId) => void;
}

function WorkspaceScreen({ workspace, workspaces, mode, onModeChange }: WorkspaceScreenProps) {
  const router = useRouter();
  const workspaceId = workspace.id;
  const docs = useDocuments(workspaceId);
  const convs = useConversations(workspaceId);
  const forms = useForms(workspaceId);
  const automations = useAutomations(workspaceId);
  // New notifications usually mean a schedule ran or a task fell due: refresh the Tasks tab.
  const notifications = useNotifications(automations.refresh);

  const [panel, setPanel] = useState<RightPanel | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false); // phones only
  const [tab, setTab] = useState<SidebarTab>("chats");
  // One file picker for the whole screen: the sidebar, the empty state and the
  // paperclip in the question box all open it.
  const fileInputRef = useRef<HTMLInputElement>(null);

  function uploadFiles(files: File[]) {
    setTab("files"); // show the new files and their progress
    void docs.upload(files);
  }

  function startNewConversation() {
    setLibraryOpen(false);
    convs.startNew();
  }

  const openSource = useCallback((documentId: string, page: number) => {
    setPanel({ kind: "source", documentId, page });
    setLibraryOpen(false);
  }, []);
  const openSubmission = useCallback((submissionId: string) => {
    setPanel({ kind: "submission", submissionId });
    setLibraryOpen(false);
  }, []);
  const openTemplate = useCallback((templateId: string | null) => {
    setPanel({ kind: "template", templateId });
    setLibraryOpen(false);
  }, []);
  const openNotification = useCallback((notificationId: string) => {
    setPanel({ kind: "notification", notificationId });
    setLibraryOpen(false);
  }, []);
  const closePanel = useCallback(() => setPanel(null), []);

  /** Show the Tasks tab; on phones that means opening the drawer (and closing a full-screen panel). */
  const openTasks = useCallback(() => {
    setTab("tasks");
    void automations.refresh();
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setPanel(null);
      setLibraryOpen(true);
    }
  }, [automations]);

  async function handleLogout() {
    await api.logout().catch(() => undefined);
    router.replace("/login");
  }

  const activeConversation = convs.conversations.find((c) => c.id === convs.activeId);

  return (
    <div className="flex h-full">
      {/* ---------------- Library (sidebar / phone drawer) ---------------- */}
      {libraryOpen && (
        <div className="fixed inset-0 z-30 bg-ink/30 lg:hidden" onClick={() => setLibraryOpen(false)} aria-hidden />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[19rem] max-w-[85vw] flex-col border-r border-rule bg-surface transition-transform lg:static lg:z-auto lg:translate-x-0",
          libraryOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <span className="font-serif text-lg text-ink">Executive Agent</span>
          <IconButton aria-label="Close menu" className="lg:hidden" onClick={() => setLibraryOpen(false)}>
            <X className="size-4" />
          </IconButton>
        </div>

        <div className="space-y-2 pb-3">
          <WorkspaceSwitcher
            workspaces={workspaces.workspaces}
            activeId={workspaceId}
            onSelect={(id) => {
              setLibraryOpen(false); // phones: close the drawer even if it's the same workspace
              workspaces.select(id);
            }}
            onCreate={workspaces.create}
            onRename={workspaces.rename}
            onDelete={workspaces.remove}
          />
          <div className="px-3">
            <button
              type="button"
              onClick={startNewConversation}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-ledger px-3 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90"
            >
              <SquarePen className="size-4" aria-hidden /> New conversation
            </button>
          </div>
        </div>

        {/* Chats and Files each get the full height and scroll on their own. */}
        <div role="tablist" aria-label="Sidebar" className="flex border-b border-rule px-3">
          {(
            [
              { id: "chats", label: "Chats", count: convs.conversations.length },
              { id: "files", label: "Files", count: docs.documents.length },
              { id: "forms", label: "Forms", count: forms.submissions.length },
              { id: "tasks", label: "Tasks", count: automations.tasks.filter((t) => t.status === "open").length },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`panel-${item.id}`}
              onClick={() => setTab(item.id)}
              className={cn(
                "-mb-px flex-1 border-b-2 px-2 py-2 text-sm transition-colors",
                tab === item.id ? "border-ledger font-medium text-ink" : "border-transparent text-slate hover:text-ink",
              )}
            >
              {item.label} <span className="text-xs tabular-nums text-slate">{item.count}</span>
            </button>
          ))}
        </div>

        <div
          key={tab} // each tab starts at the top of its own list
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={`tab-${tab}`}
          className="min-h-0 flex-1 overflow-y-auto py-3"
        >
          {tab === "chats" ? (
            <ConversationList
              conversations={convs.conversations}
              activeId={convs.activeId}
              loading={convs.loading}
              onSelect={(id) => {
                setLibraryOpen(false);
                if (id !== convs.activeId) convs.open(id);
              }}
              onRename={convs.rename}
              onDelete={convs.remove}
            />
          ) : tab === "files" ? (
            <DocumentLibrary
              documents={docs.documents}
              loading={docs.loading}
              uploading={docs.uploading}
              openDocumentId={panel?.kind === "source" ? panel.documentId : null}
              onPickFiles={() => fileInputRef.current?.click()}
              onDropFiles={uploadFiles}
              onOpen={(id) => openSource(id, 1)}
              onDelete={docs.remove}
            />
          ) : tab === "tasks" ? (
            <TasksPanel
              tasks={automations.tasks}
              schedules={automations.schedules}
              scheduler={notifications.scheduler}
              loading={automations.loading}
              error={automations.error}
              onClearError={automations.clearError}
              onSetTaskStatus={automations.setTaskStatus}
              onDeleteTask={automations.deleteTask}
              onSetScheduleActive={automations.setScheduleActive}
              onRunScheduleNow={automations.runScheduleNow}
              onDeleteSchedule={automations.deleteSchedule}
            />
          ) : (
            <FormsPanel
              templates={forms.templates}
              submissions={forms.submissions}
              loading={forms.loading}
              openSubmissionId={panel?.kind === "submission" ? panel.submissionId : null}
              openTemplateId={panel?.kind === "template" ? panel.templateId : null}
              onOpenSubmission={openSubmission}
              onOpenTemplate={openTemplate}
              onNewTemplate={() => openTemplate(null)}
            />
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
            if (files.length > 0) uploadFiles(files);
          }}
        />

        <div className="border-t border-rule p-2">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-slate hover:bg-paper hover:text-ink"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      </aside>

      {/* ---------------- Conversation ---------------- */}
      {convs.session ? (
        // `key` gives each opened conversation its own fresh chat state.
        <ChatPanel
          key={convs.session.key}
          workspaceId={workspaceId}
          workspaceName={workspace.name}
          title={activeConversation?.title ?? null}
          session={convs.session}
          ensureConversation={convs.ensureConversation}
          onAnswered={convs.refresh}
          onNewConversation={startNewConversation}
          documents={docs.documents}
          documentsError={docs.error}
          onClearDocumentsError={docs.clearError}
          mode={mode}
          onModeChange={onModeChange}
          onOpenSource={openSource}
          conversationId={convs.activeId}
          onFormsSaved={forms.refresh}
          onOpenSubmission={openSubmission}
          onOpenTemplate={openTemplate}
          onAutomationsChanged={automations.refresh}
          onOpenTasks={openTasks}
          headerActions={
            <NotificationBell
              items={notifications.items}
              unreadCount={notifications.unreadCount}
              scheduler={notifications.scheduler}
              showWorkspace={workspaces.workspaces.length > 1}
              activeId={panel?.kind === "notification" ? panel.notificationId : null}
              onOpen={openNotification}
              onMarkAllRead={notifications.markAllRead}
            />
          }
          onOpenMenu={() => setLibraryOpen(true)}
          onAttach={() => fileInputRef.current?.click()}
        />
      ) : (
        <main className="flex min-w-0 flex-1 flex-col">
          <p className="p-8 text-sm text-slate">Loading conversation…</p>
        </main>
      )}

      {/* ---------------- Right panel ---------------- */}
      {panel && (
        <div className="fixed inset-0 z-50 lg:static lg:z-auto lg:w-[min(46vw,46rem)] lg:shrink-0 lg:border-l lg:border-rule">
          <RightPanelContent
            panel={panel}
            workspaceId={workspaceId}
            documents={docs.documents}
            forms={forms}
            notifications={notifications}
            onOpenSource={openSource}
            onOpenTasks={openTasks}
            onSwitchWorkspace={workspaces.select}
            onPanelChange={setPanel}
            onClose={closePanel}
            onOpenConversation={(conversationId) => {
              setTab("chats");
              if (conversationId !== convs.activeId) convs.open(conversationId);
              closePanel();
            }}
          />
        </div>
      )}
    </div>
  );
}

/** The right-hand panel: a source document, a saved form, the template editor, or a notification. */
function RightPanelContent({
  panel,
  workspaceId,
  documents,
  forms,
  notifications,
  onOpenSource,
  onOpenTasks,
  onSwitchWorkspace,
  onPanelChange,
  onClose,
  onOpenConversation,
}: {
  panel: RightPanel;
  workspaceId: string;
  documents: DocumentDTO[];
  forms: ReturnType<typeof useForms>;
  notifications: ReturnType<typeof useNotifications>;
  onOpenSource: (documentId: string, page: number) => void;
  onOpenTasks: () => void;
  onSwitchWorkspace: (workspaceId: string) => void;
  onPanelChange: (panel: RightPanel) => void;
  onClose: () => void;
  onOpenConversation: (conversationId: string) => void;
}) {
  if (panel.kind === "source") {
    return (
      <SourceViewer
        key={panel.documentId}
        document={documents.find((doc) => doc.id === panel.documentId)}
        page={panel.page}
        onPageChange={(page) => onPanelChange({ ...panel, page })}
        onClose={onClose}
      />
    );
  }

  if (panel.kind === "notification") {
    return (
      <NotificationPanel
        key={panel.notificationId}
        notificationId={panel.notificationId}
        workspaceId={workspaceId}
        documents={documents.filter((d) => d.status === "ready").map(({ id, fileName }) => ({ id, fileName }))}
        onOpenCitation={onOpenSource}
        onSwitchWorkspace={onSwitchWorkspace}
        onOpenTasks={onOpenTasks}
        onOpened={notifications.markedRead}
        onDelete={notifications.remove}
        onClose={onClose}
      />
    );
  }

  if (panel.kind === "submission") {
    const submission = forms.submissions.find((s) => s.id === panel.submissionId);
    if (!submission) {
      return <MissingItem text={forms.loading ? "Loading…" : "This saved form no longer exists."} onClose={onClose} />;
    }
    const conversationId = submission.conversationId;
    return (
      <SubmissionPanel
        key={submission.id}
        submission={submission}
        onSave={(values) => forms.updateSubmission(submission.id, values)}
        onDelete={async () => {
          await forms.deleteSubmission(submission.id);
          onClose();
        }}
        onClose={onClose}
        onOpenConversation={conversationId ? () => onOpenConversation(conversationId) : undefined}
      />
    );
  }

  const template = panel.templateId ? forms.templates.find((t) => t.id === panel.templateId) : null;
  if (panel.templateId && !template) {
    return <MissingItem text={forms.loading ? "Loading…" : "This template no longer exists."} onClose={onClose} />;
  }
  return (
    <TemplateEditor
      key={panel.templateId ?? "new"}
      template={template ?? null}
      onSave={async (input) => {
        const saved = await forms.saveTemplate(panel.templateId, input);
        if (!panel.templateId) onPanelChange({ kind: "template", templateId: saved.id }); // now editing the new one
      }}
      onDelete={
        template
          ? async () => {
              await forms.deleteTemplate(template.id);
              onClose();
            }
          : undefined
      }
      onClose={onClose}
    />
  );
}

function MissingItem({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface p-8 text-sm text-slate">
      <p>{text}</p>
      <button type="button" onClick={onClose} className="text-ledger underline-offset-2 hover:underline">
        Close
      </button>
    </div>
  );
}

interface ChatPanelProps {
  workspaceId: string;
  workspaceName: string;
  /** Title of the open conversation; null for a fresh, unsaved one. */
  title: string | null;
  session: ChatSession;
  ensureConversation: () => Promise<string>;
  onAnswered: () => void;
  onNewConversation: () => void;
  documents: DocumentDTO[];
  documentsError: string | null;
  onClearDocumentsError: () => void;
  mode: ResponseModeId;
  onModeChange: (mode: ResponseModeId) => void;
  onOpenSource: (documentId: string, page: number) => void;
  /** The saved conversation on screen (null until the first question). */
  conversationId: string | null;
  onFormsSaved: () => void;
  onOpenSubmission: (submissionId: string) => void;
  onOpenTemplate: (templateId: string) => void;
  onAutomationsChanged: () => void;
  onOpenTasks: () => void;
  /** Shown at the right of the header (the notification bell). */
  headerActions: ReactNode;
  onOpenMenu: () => void;
  onAttach: () => void;
}

/** The middle column: one conversation, its answers and the question box. */
function ChatPanel({
  workspaceId,
  workspaceName,
  title,
  session,
  ensureConversation,
  onAnswered,
  onNewConversation,
  documents,
  documentsError,
  onClearDocumentsError,
  mode,
  onModeChange,
  onOpenSource,
  conversationId,
  onFormsSaved,
  onOpenSubmission,
  onOpenTemplate,
  onAutomationsChanged,
  onOpenTasks,
  headerActions,
  onOpenMenu,
  onAttach,
}: ChatPanelProps) {
  const chat = useExecutiveChat({ workspaceId, session, ensureConversation, onAnswered });

  const readyDocuments = useMemo(
    () => documents.filter((doc) => doc.status === "ready").map(({ id, fileName }) => ({ id, fileName })),
    [documents],
  );
  const processingCount = documents.filter((doc) => doc.status === "processing").length;

  function ask(question: string, askMode: ResponseModeId = mode) {
    onModeChange(askMode);
    void chat.send(question, askMode);
  }

  const error = chat.error ?? documentsError;

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-rule px-3 py-2 lg:px-6">
        <IconButton aria-label="Open menu" className="lg:hidden" onClick={onOpenMenu}>
          <Menu className="size-5" />
        </IconButton>
        <h1 className="min-w-0 flex-1 truncate text-sm text-ink">
          <span className="font-medium">{workspaceName}</span>
          {title && <span className="text-slate"> · {title}</span>}
        </h1>
        {chat.messages.length > 0 && (
          <button
            type="button"
            onClick={onNewConversation}
            disabled={chat.isRunning}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-slate hover:bg-surface hover:text-ink disabled:opacity-40 lg:hidden"
          >
            <SquarePen className="size-3.5" aria-hidden />
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">New conversation</span>
          </button>
        )}
        {headerActions}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {chat.loadingHistory ? (
          <p className="p-8 text-sm text-slate">Loading conversation…</p>
        ) : chat.messages.length === 0 ? (
          <EmptyState
            workspaceName={workspaceName}
            readyCount={readyDocuments.length}
            processingCount={processingCount}
            onAsk={ask}
            onUploadClick={onAttach}
          />
        ) : (
          <MessageList
            messages={chat.messages}
            citations={chat.citations}
            documents={readyDocuments}
            isRunning={chat.isRunning}
            activity={chat.activity}
            onOpenCitation={onOpenSource}
            renderCard={(messageId) => {
              const card = chat.cards[messageId];
              if (!card) return null;
              return (
                <ChatCard
                  card={card}
                  messageId={messageId}
                  workspaceId={workspaceId}
                  conversationId={conversationId}
                  onUpdated={(updated) => chat.updateCard(messageId, updated)}
                  onFormsSaved={onFormsSaved}
                  onAutomationsChanged={onAutomationsChanged}
                  onOpenSubmission={onOpenSubmission}
                  onOpenTemplate={onOpenTemplate}
                  onOpenTasks={onOpenTasks}
                />
              );
            }}
          />
        )}
      </div>

      {error && (
        <div role="alert" className="mx-auto mb-2 flex w-full max-w-3xl items-start gap-3 px-3 sm:px-8">
          <p className="flex-1 rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>
          <IconButton
            aria-label="Dismiss"
            onClick={() => {
              chat.dismissError();
              onClearDocumentsError();
            }}
          >
            <X className="size-4" />
          </IconButton>
        </div>
      )}

      <Composer
        mode={mode}
        onModeChange={onModeChange}
        onSend={(text) => ask(text)}
        onStop={chat.stop}
        onAttach={onAttach}
        isRunning={chat.isRunning}
      />
    </main>
  );
}
