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

export const facialSchema = {
  body: {
    type: "object",
    required: ["image"],
    properties: {
      image: { type: "string" },
    },
  },
};
