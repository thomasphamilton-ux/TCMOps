export const createUserSchema = {
  body: {
    type: "object",
    required: ["name", "phone", "pin", "role"],
    properties: {
      name: { type: "string", minLength: 1 },
      phone: { type: "string", minLength: 7, maxLength: 20 },
      pin: { type: "string", minLength: 4, maxLength: 8 },
      role: { type: "string", enum: ["admin", "manager", "supervisor", "foreman", "employee"] },
      teamId: { type: "number" },
      projectId: { type: "number" },
      shiftExempt: { type: "boolean" },
      classification: { type: "string", maxLength: 64 },
      perDiemRate: { type: "number", minimum: 0 },
      defaultCostCodeId: { type: "number" },
    },
  },
};

export const updateUserSchema = {
  body: {
    type: "object",
    properties: {
      name: { type: "string" },
      role: { type: "string", enum: ["admin", "manager", "supervisor", "foreman", "employee"] },
      teamId: { type: ["number", "null"] },
      projectId: { type: ["number", "null"] },
      active: { type: "boolean" },
      pin: { type: "string", minLength: 4, maxLength: 8 },
      shiftExempt: { type: "boolean" },
      classification: { type: ["string", "null"], maxLength: 64 },
      perDiemRate: { type: ["number", "null"], minimum: 0 },
      language: { type: ["string", "null"], maxLength: 10 },
      defaultCostCodeId: { type: ["number", "null"] },
    },
  },
};

export const importUsersSchema = {
  body: {
    type: "object",
    required: ["file"],
    properties: { file: { type: "string" } },
  },
};
