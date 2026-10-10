import { ExecutiveApp } from "@/components/executive-app";

/** The app itself (login is enforced by src/proxy.ts before this renders). */
export default function HomePage() {
  return <ExecutiveApp />;
}
