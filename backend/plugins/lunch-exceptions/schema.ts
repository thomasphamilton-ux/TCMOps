export const logLunchExceptionSchema = {
  body: {
    type: "object",
    required: ["employeeId", "date", "reason"],
    properties: {
      employeeId: { type: "number" },
      date: { type: "string" },
      reason: { type: "string", minLength: 1 },
    },
  },
};

export const listLunchExceptionsSchema = {
  querystring: {
    type: "object",
    properties: {
      projectId: { type: "number" },
    },
  },
};
