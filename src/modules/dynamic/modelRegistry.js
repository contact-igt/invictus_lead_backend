import db from "../../database/index.js";

const MODEL_REGISTRY = {
  vlslaw_practice: db.VlsLawPractice,
  vlslaw_academy: db.VlsLawAcademy,
  vlslaw_aibe: db.VlsLawAibe,
};

export const getDynamicModel = (modelKey) => {
  if (!modelKey) return null;
  return MODEL_REGISTRY[String(modelKey).toLowerCase()] || null;
};

export const getSupportedDynamicModels = () => Object.keys(MODEL_REGISTRY);
