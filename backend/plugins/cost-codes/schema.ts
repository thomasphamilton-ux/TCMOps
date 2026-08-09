export const createCostCodeSchema = {
  body: {
    type: "object",
    required: ["code", "description"],
    properties: {
      code: { type: "string", minLength: 1 },
      description: { type: "string", minLength: 1 },
      allowsUnits: { type: "boolean" },
      unitType: { type: "string" },
      projectId: { type: "number" },
    },
  },
};

export const updateCostCodeSchema = {
  body: {
    type: "object",
    properties: {
      description: { type: "string" },
      allowsUnits: { type: "boolean" },
      unitType: { type: "string" },
      active: { type: "boolean" },
    },
  },
};

export const importCostCodesSchema = {
  body: {
    type: "object",
    required: ["file"],
    properties: { file: { type: "string" } },
  },
};
