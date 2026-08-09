export const generateExportSchema = {
  body: {
    type: "object",
    required: ["type", "startDate", "endDate"],
    properties: {
      type: { type: "string", enum: ["daily", "weekly"] },
      startDate: { type: "string" },
      endDate: { type: "string" },
      notifyEmail: { type: "string" },
    },
  },
};
