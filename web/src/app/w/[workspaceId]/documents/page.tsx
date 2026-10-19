import { DocumentsPage } from "@/components/pages/documents-page";

export const metadata = { title: "Documents · Executive Agent" };

/** Rendered inside the client shell (see ../layout.tsx). */
export const instant = false;

export default function Page() {
  return <DocumentsPage />;
}
