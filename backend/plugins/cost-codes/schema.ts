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
      taskType: { type: "string", maxLength: 64 },
      budgetHours: { type: "number", minimum: 0 },
      budgetUnits: { type: "number", minimum: 0 },
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
      taskType: { type: ["string", "null"], maxLength: 64 },
      budgetHours: { type: ["number", "null"], minimum: 0 },
      budgetUnits: { type: ["number", "null"], minimum: 0 },
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
