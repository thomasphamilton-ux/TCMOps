export const submitDailySchema = {
  body: {
    type: "object",
    required: ["teamId", "date"],
    properties: {
      teamId: { type: "number" },
      date: { type: "string" },
    },
  },
};
