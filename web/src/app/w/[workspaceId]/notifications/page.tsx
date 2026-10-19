import { NotificationsPage } from "@/components/pages/notifications-page";

export const metadata = { title: "Notifications · Executive Agent" };

/** Rendered inside the client shell (see ../layout.tsx). */
export const instant = false;

export default function Page() {
  return <NotificationsPage />;
}
