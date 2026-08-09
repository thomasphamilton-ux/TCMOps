export const clockInSchema = {
  body: {
    type: "object",
    required: ["employeeId", "timestamp"],
    properties: {
      employeeId: { type: "number" },
      timestamp: { type: "string" },
      image: { type: "string" },
      lat: { type: "number" },
      lng: { type: "number" },
    },
  },
};

export const clockOutSchema = {
  body: {
    type: "object",
    required: ["employeeId", "timestamp"],
    properties: {
      employeeId: { type: "number" },
      timestamp: { type: "string" },
      image: { type: "string" },
      signature: { type: "string" },
      lat: { type: "number" },
      lng: { type: "number" },
    },
  },
};

export const saveDailySchema = {
  body: {
    type: "object",
    required: ["employeeId", "date", "entries"],
    properties: {
      employeeId: { type: "number" },
      date: { type: "string" },
      entries: {
        type: "array",
        items: {
          type: "object",
          required: ["costCodeId", "hours"],
          properties: {
            costCodeId: { type: "number" },
            hours: { type: "number", minimum: 0 },
            units: { type: "number" },
            notes: { type: "string" },
          },
        },
      },
    },
  },
};

export const updateEntrySchema = {
  body: {
    type: "object",
    properties: {
      costCodeId: { type: "number" },
      hours: { type: "number", minimum: 0 },
      units: { type: "number" },
      notes: { type: "string" },
      reason: { type: "string" },
    },
  },
};

export const deleteEntrySchema = {
  body: {
    type: "object",
    properties: {
      reason: { type: "string" },
    },
  },
};

export const correctDailySchema = {
  body: {
    type: "object",
    properties: {
      clockIn: { type: ["string", "null"] },
      clockOut: { type: ["string", "null"] },
      reason: { type: "string" },
    },
  },
};

export const locationsSchema = {
  querystring: {
    type: "object",
    properties: {
      start: { type: "string" },
      end: { type: "string" },
      projectId: { type: "number" },
    },
  },
};
