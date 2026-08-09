export const productivityQuerySchema = {
  querystring: {
    type: "object",
    properties: {
      start: { type: "string" },
      end: { type: "string" },
    },
  },
};
