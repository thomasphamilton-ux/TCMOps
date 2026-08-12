export const createPayInquirySchema = {
  body: {
    type: "object",
    required: ["subject", "message"],
    properties: {
      subject: { type: "string", minLength: 1, maxLength: 120 },
      message: { type: "string", minLength: 1 },
    },
  },
};

export const listPayInquiriesSchema = {
  querystring: {
    type: "object",
    properties: {
      resolved: { type: "string", enum: ["true", "false"] },
      projectId: { type: "number" },
    },
  },
};

export const resolvePayInquirySchema = {
  body: {
    type: "object",
    required: ["response"],
    properties: {
      response: { type: "string", minLength: 1 },
    },
  },
};
