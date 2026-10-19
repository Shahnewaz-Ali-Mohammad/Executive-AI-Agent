import { StatusPage } from "@/components/pages/status-page";

export const metadata = { title: "System status · Executive Agent" };

/** Rendered inside the client shell (see ../layout.tsx). */
export const instant = false;

export default function Page() {
  return <StatusPage />;
}
