export const evaluatePerDiemSchema = {
  body: {
    type: "object",
    required: ["employeeId", "date", "miles"],
    properties: {
      employeeId: { type: "number" },
      date: { type: "string" },
      miles: { type: "number", minimum: 0 },
      stayedOvernight: { type: "boolean" },
    },
  },
};

export const overridePerDiemSchema = {
  body: {
    type: "object",
    required: ["employeeId", "date", "eligible"],
    properties: {
      employeeId: { type: "number" },
      date: { type: "string" },
      eligible: { type: "boolean" },
    },
  },
};

export const clearOverrideSchema = {
  body: {
    type: "object",
    required: ["employeeId", "date"],
    properties: {
      employeeId: { type: "number" },
      date: { type: "string" },
    },
  },
};
