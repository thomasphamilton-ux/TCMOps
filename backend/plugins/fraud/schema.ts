import { FRAUD_RESOLUTION_REASONS } from "../../db/schema";

export const listFlagsSchema = {
  querystring: {
    type: "object",
    properties: {
      resolved: { type: "string", enum: ["true", "false"] },
      projectId: { type: "number" },
    },
  },
};

export const resolveFlagSchema = {
  body: {
    type: "object",
    required: ["reason"],
    properties: {
      reason: { type: "string", enum: [...FRAUD_RESOLUTION_REASONS] },
      notes: { type: "string" },
      denyHours: { type: "boolean" },
    },
  },
};
