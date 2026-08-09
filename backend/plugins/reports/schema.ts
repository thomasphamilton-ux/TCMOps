export const dailyReportSchema = {
  querystring: {
    type: "object",
    properties: { date: { type: "string" }, projectId: { type: "number" } },
  },
};

export const weeklyReportSchema = {
  querystring: {
    type: "object",
    properties: { start: { type: "string" }, end: { type: "string" }, projectId: { type: "number" } },
  },
};
