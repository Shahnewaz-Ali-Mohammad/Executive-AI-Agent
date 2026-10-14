"use client";

/**
 * Tasks and scheduled reports/reminders of the open workspace, for the Tasks
 * tab. `refresh` is called after something is created from the chat and when
 * a notification arrives (a schedule's "last run" changes).
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { ScheduleDTO, TaskDTO } from "@/lib/types";

export function useAutomations(workspaceId: string) {
  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [schedules, setSchedules] = useState<ScheduleDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listTasks(workspaceId), api.listSchedules(workspaceId)])
      .then(([taskList, scheduleList]) => {
        if (cancelled) return;
        setTasks(taskList);
        setSchedules(scheduleList);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load tasks."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const refresh = useCallback(async () => {
    const [taskList, scheduleList] = await Promise.all([
      api.listTasks(workspaceId).catch(() => null),
      api.listSchedules(workspaceId).catch(() => null),
    ]);
    if (taskList) setTasks(taskList);
    if (scheduleList) setSchedules(scheduleList);
  }, [workspaceId]);

  /** Run an action; on failure show the server's message and reload the lists. */
  const act = useCallback(
    async (action: () => Promise<unknown>) => {
      setError(null);
      try {
        await action();
      } catch (err) {
        setError(err instanceof Error ? err.message : "That didn't work. Please try again.");
      }
      await refresh();
    },
    [refresh],
  );

  return {
    tasks,
    schedules,
    loading,
    error,
    clearError: () => setError(null),
    refresh,
    setTaskStatus: (id: string, status: TaskDTO["status"]) => act(() => api.setTaskStatus(id, status)),
    deleteTask: (id: string) => act(() => api.deleteTask(id)),
    setScheduleActive: (id: string, active: boolean) => act(() => api.setScheduleActive(id, active)),
    runScheduleNow: (id: string) => act(() => api.runScheduleNow(id)),
    deleteSchedule: (id: string) => act(() => api.deleteSchedule(id)),
  };
}
