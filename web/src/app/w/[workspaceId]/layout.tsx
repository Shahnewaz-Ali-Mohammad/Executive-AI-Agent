import { Suspense } from "react";
import { WorkspaceShell } from "@/components/shell/workspace-shell";

/**
 * Every page of a workspace shares one shell (menu, top bar, chat, right
 * panel), which stays mounted while moving between them, so moving between
 * pages is instant on the client. The shell reads the address in the browser
 * (which page, which panel) and loads its data there, so it isn't part of
 * the server-prerendered shell: opt it out of that validation.
 */
export const instant = false;

export default function WorkspaceLayout({ children }: LayoutProps<"/w/[workspaceId]">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-slate">Loading…</p>}>
      <WorkspaceShell>{children}</WorkspaceShell>
    </Suspense>
  );
}
