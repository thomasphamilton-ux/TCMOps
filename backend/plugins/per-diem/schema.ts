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
