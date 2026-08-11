export const loginSchema = {
  body: {
    type: "object",
    required: ["phone", "pin"],
    properties: {
      phone: { type: "string", minLength: 7, maxLength: 20 },
      pin: { type: "string", minLength: 4, maxLength: 8 },
    },
  },
};

export const registerSchema = {
  body: {
    type: "object",
    required: ["token", "name", "phone", "pin", "image"],
    properties: {
      token: { type: "string", minLength: 10 },
      name: { type: "string", minLength: 1, maxLength: 120 },
      phone: { type: "string", minLength: 7, maxLength: 20 },
      pin: { type: "string", minLength: 4, maxLength: 8 },
      language: { type: "string", maxLength: 10 },
      image: { type: "string" },
    },
  },
};

export const facialSchema = {
  body: {
    type: "object",
    required: ["image"],
    properties: {
      image: { type: "string" },
    },
  },
};
