export const createCompanySchema = {
  body: {
    type: "object",
    required: ["code", "name"],
    properties: {
      code: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      active: { type: "boolean" },
    },
  },
};

export const updateCompanySchema = {
  body: {
    type: "object",
    properties: {
      code: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      active: { type: "boolean" },
    },
  },
};
