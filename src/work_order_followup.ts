import { z } from "zod";

export const workOrderEventSchema = z.object({
  event_id: z.string().min(1),
  event_type: z.enum(["work_order.dispatch_changed", "work_order.photo_added"]),
  work_order_id: z.string().min(1),
  dispatch_status: z.enum(["assigned", "en_route", "on_site", "completed"]),
  technician_id: z.string().min(1),
  photo_count: z.number().int().nonnegative(),
  occurred_at: z.string().datetime(),
});

export type WorkOrderEvent = z.infer<typeof workOrderEventSchema>;

export type FollowUpDecision = {
  action: "request_completion_photo" | "close_visit" | "record_progress";
  workOrderId: string;
  technicianId: string;
};

export function decideFollowUp(event: WorkOrderEvent): FollowUpDecision {
  if (event.dispatch_status === "completed" && event.photo_count === 0) {
    return {
      action: "request_completion_photo",
      workOrderId: event.work_order_id,
      technicianId: event.technician_id,
    };
  }
  return {
    action: event.dispatch_status === "completed" ? "close_visit" : "record_progress",
    workOrderId: event.work_order_id,
    technicianId: event.technician_id,
  };
}
