import { ATTENDANCE_STATUSES } from "../../db/schema";

export const setAttendanceSchema = {
  body: {
    type: "object",
    required: ["employeeId", "date", "status"],
    properties: {
      employeeId: { type: "number" },
      date: { type: "string" },
      status: { type: "string", enum: [...ATTENDANCE_STATUSES] },
      notes: { type: "string" },
    },
  },
};
