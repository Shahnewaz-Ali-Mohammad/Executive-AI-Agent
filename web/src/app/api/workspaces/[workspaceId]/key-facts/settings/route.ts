/**
 * PUT /api/workspaces/:workspaceId/key-facts/settings
 *     body: { reminderEmail?: string | null, weeklySummary?: boolean }
 * reminderEmail: where key-date reminders are emailed (they always appear under the bell).
 * weeklySummary: a report every Monday at 08:00 of the dates in the next 30 days (a normal schedule).
 */
import { z } from "zod";
import { createSchedule, deleteSchedule } from "@/lib/data/schedules";
import { getFactSettings, saveFactSettings, WEEKLY_SUMMARY_PROMPT } from "@/lib/data/facts";
import { requireWorkspace } from "@/lib/data/workspaces";
import { handleRouteError, HttpError } from "@/lib/http";

type Context = RouteContext<"/api/workspaces/[workspaceId]/key-facts/settings">;

const bodySchema = z.object({
  reminderEmail: z
    .union([z.string().trim().email("Not a valid email address.").max(200), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null)),
  weeklySummary: z.boolean().optional(),
  timeZone: z.string().max(64).optional(),
});

export async function PUT(request: Request, ctx: Context) {
  try {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid settings.");
    const { reminderEmail, weeklySummary, timeZone } = parsed.data;
    const current = await getFactSettings(workspaceId);
    const change: Parameters<typeof saveFactSettings>[1] = {};
    if (reminderEmail !== undefined) change.reminderEmail = reminderEmail;

    if (weeklySummary === true && !current.weeklySummaryScheduleId) {
      const schedule = await createSchedule({
        workspaceId,
        schedule: {
          scheduleKind: "report",
          title: "Key dates this month",
          prompt: WEEKLY_SUMMARY_PROMPT,
          mode: "brief",
          recurrence: { frequency: "weekly", time: "08:00", weekdays: [1] },
          timeZone,
          notifyEmail: reminderEmail !== undefined ? reminderEmail : current.reminderEmail,
        },
      });
      change.weeklySummaryScheduleId = schedule.id;
    } else if (weeklySummary === false && current.weeklySummaryScheduleId) {
      await deleteSchedule(current.weeklySummaryScheduleId).catch(() => undefined);
      change.weeklySummaryScheduleId = null;
    }
    return Response.json(await saveFactSettings(workspaceId, change));
  } catch (error) {
    return handleRouteError(error);
  }
}
