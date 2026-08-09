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
