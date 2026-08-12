import { TIME_OFF_TYPES } from "../../db/schema";

export const createTimeOffRequestSchema = {
  body: {
    type: "object",
    required: ["startDate", "endDate", "hoursPerDay", "type"],
    properties: {
      startDate: { type: "string" },
      endDate: { type: "string" },
      hoursPerDay: { type: "number", exclusiveMinimum: 0, maximum: 8 },
      type: { type: "string", enum: [...TIME_OFF_TYPES] },
      notes: { type: "string" },
    },
  },
};

export const listTimeOffRequestsSchema = {
  querystring: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["pending_foreman", "pending_supervisor", "approved", "denied"] },
      projectId: { type: "number" },
    },
  },
};

export const approveTimeOffRequestSchema = {
  body: {
    type: "object",
    required: ["signature"],
    properties: {
      signature: { type: "string", minLength: 1 },
    },
  },
};

export const denyTimeOffRequestSchema = {
  body: {
    type: "object",
    required: ["reason"],
    properties: {
      reason: { type: "string", minLength: 1 },
    },
  },
};
