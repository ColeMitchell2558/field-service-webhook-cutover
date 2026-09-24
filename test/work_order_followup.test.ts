import { describe, expect, it } from "vitest";
import { decideFollowUp, workOrderEventSchema } from "../src/work_order_followup.js";

describe("technician follow-up", () => {
  it("asks for evidence when a completed visit has no photos", () => {
    const event = workOrderEventSchema.parse({
      event_id: "evt_204",
      event_type: "work_order.dispatch_changed",
      work_order_id: "wo_90210",
      dispatch_status: "completed",
      technician_id: "tech_17",
      photo_count: 0,
      occurred_at: "2026-09-23T08:30:00.000Z",
    });

    expect(decideFollowUp(event)).toEqual({
      action: "request_completion_photo",
      workOrderId: "wo_90210",
      technicianId: "tech_17",
    });
  });

  it("closes a completed visit once a photo exists", () => {
    const event = workOrderEventSchema.parse({
      event_id: "evt_205",
      event_type: "work_order.photo_added",
      work_order_id: "wo_90210",
      dispatch_status: "completed",
      technician_id: "tech_17",
      photo_count: 2,
      occurred_at: "2026-09-23T08:34:00.000Z",
    });

    expect(decideFollowUp(event).action).toBe("close_visit");
  });
});
