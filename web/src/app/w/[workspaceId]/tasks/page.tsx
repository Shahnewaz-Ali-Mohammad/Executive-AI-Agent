import { TasksPage } from "@/components/pages/tasks-page";

export const metadata = { title: "Tasks & schedules · Executive Agent" };

/** Rendered inside the client shell (see ../layout.tsx). */
export const instant = false;

export default function Page() {
  return <TasksPage />;
}
