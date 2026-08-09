const SHIFT_START_PATTERN = "^([01]\\d|2[0-3]):[0-5]\\d$";

export const createTeamSchema = {
  body: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1 },
      foremanId: { type: "number" },
      projectId: { type: "number" },
      shiftStart: { type: ["string", "null"], pattern: SHIFT_START_PATTERN },
    },
  },
};

export const updateTeamSchema = {
  body: {
    type: "object",
    properties: {
      name: { type: "string" },
      foremanId: { type: ["number", "null"] },
      projectId: { type: ["number", "null"] },
      shiftStart: { type: ["string", "null"], pattern: SHIFT_START_PATTERN },
    },
  },
};
