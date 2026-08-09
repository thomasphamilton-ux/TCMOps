export const createProjectSchema = {
  body: {
    type: "object",
    required: ["code", "name"],
    properties: {
      code: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      active: { type: "boolean" },
      geofenceLat: { type: ["number", "null"], minimum: -90, maximum: 90 },
      geofenceLng: { type: ["number", "null"], minimum: -180, maximum: 180 },
      geofenceRadiusM: { type: ["number", "null"], minimum: 1 },
    },
  },
};

export const updateProjectSchema = {
  body: {
    type: "object",
    properties: {
      code: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      active: { type: "boolean" },
      geofenceLat: { type: ["number", "null"], minimum: -90, maximum: 90 },
      geofenceLng: { type: ["number", "null"], minimum: -180, maximum: 180 },
      geofenceRadiusM: { type: ["number", "null"], minimum: 1 },
    },
  },
};
