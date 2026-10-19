import { HomeRedirect } from "@/components/shell/workspace-shell";

/** "/" opens the workspace (and conversation) used last. Login is enforced by src/proxy.ts. */
export default function HomePage() {
  return <HomeRedirect />;
}
