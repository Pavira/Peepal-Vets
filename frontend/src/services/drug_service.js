import api from "@/config/axios";

const DRUG_NAME_QTY_CACHE_PREFIX = "drug_name_qty_cache_v1";

const isBrowser = () => typeof window !== "undefined" && !!window.localStorage;

const buildCacheKey = (params = {}) => {
  const sortedEntries = Object.entries(params || {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const serialized = JSON.stringify(Object.fromEntries(sortedEntries));
  return `${DRUG_NAME_QTY_CACHE_PREFIX}:${serialized}`;
};

const readDrugNameQtyCache = (params = {}) => {
  if (!isBrowser()) return null;

  try {
    const raw = window.localStorage.getItem(buildCacheKey(params));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.drugs)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeDrugNameQtyCache = (params = {}, data = { drugs: [] }) => {
  if (!isBrowser()) return;

  try {
    window.localStorage.setItem(buildCacheKey(params), JSON.stringify(data));
  } catch {
    // Ignore quota/storage errors and continue with API behavior.
  }
};

const clearDrugNameQtyCache = () => {
  if (!isBrowser()) return;

  try {
    const keysToRemove = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(DRUG_NAME_QTY_CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Ignore cache clear errors.
  }
};

const refreshDrugNameQtyCache = async () => {
  const defaultParams = { limit: 1000 };
  const res = await api.get("/drugs/name-quantity", { params: defaultParams });
  writeDrugNameQtyCache(defaultParams, res.data);
  return res.data;
};

const refreshDrugNameQtyCacheSafely = async () => {
  try {
    await refreshDrugNameQtyCache();
  } catch {
    // Don't fail mutation APIs if cache refresh fails.
  }
};

// Create drug
export const createDrug = async (payload) => {
  const res = await api.post("/drugs/", payload);
  await refreshDrugNameQtyCacheSafely();
  return res.data;
};

// Get all drugs with pagination and search
export const getAllDrugs = async (params = {}) => {
  const res = await api.get("/drugs/", { params });
  return res.data;
};

// Get all drugs with pagination and search
// export const getAllDrugsNameAndQty = async (params = {}) => {
//   const res = await api.get("/drugs", { params });
//   return res.data;
// };

// Get drug names and quantities for lightweight selection
export const getDrugNameAndQuantity = async (params = {}) => {
  const cached = readDrugNameQtyCache(params);
  if (cached) {
    return cached;
  }

  const res = await api.get("/drugs/name-quantity", { params });
  writeDrugNameQtyCache(params, res.data);
  return res.data;
};

// Get drug by ID
export const getDrugById = async (drugId) => {
  const res = await api.get(`/drugs/${drugId}`);
  return res.data;
};

// Add stock/history entry to drug
export const updateDrug = async (drugId, payload) => {
  const res = await api.post(`/drugs/${drugId}/entries`, payload);
  await refreshDrugNameQtyCacheSafely();
  return res.data;
};

// Adjust drug quantity with reason/remark
export const adjustDrugQuantity = async (drugId, payload) => {
  const requestBody = {
    date: payload.date,
    adjustmentType: payload.adjustmentType,
    quantity: Number(payload.quantity),
    price: Number(payload.price),
    gstPercent: Number(payload.gstPercent ?? 0),
    reason: payload.reason ?? "",
  };
  const res = await api.post(`/drugs/${drugId}/adjustments`, requestBody);
  await refreshDrugNameQtyCacheSafely();
  return res.data;
};

// Update drug name
export const updateDrugName = async (drugId, name) => {
  const res = await api.put(`/drugs/${drugId}/name`, { name });
  await refreshDrugNameQtyCacheSafely();
  return res.data;
};

// Delete one history entry
export const deleteDrugHistoryEntry = async (drugId, entryId) => {
  const res = await api.delete(`/drugs/${drugId}/entries/${entryId}`);
  await refreshDrugNameQtyCacheSafely();
  return res.data;
};

// Delete drug
export const deleteDrug = async (drugId) => {
  const res = await api.delete(`/drugs/${drugId}`);
  await refreshDrugNameQtyCacheSafely();
  return res.data;
};

export const invalidateDrugNameQtyCache = () => {
  clearDrugNameQtyCache();
};

// Save a prescription template
export const createDrugTemplate = async (payload) => {
  const res = await api.post("/drugs/manage/templates", payload);
  return res.data;
};

// Get all prescription templates
export const getAllDrugTemplates = async () => {
  const res = await api.get("/drugs/manage/templates");
  return res.data;
};

// Get one prescription template
export const getDrugTemplateById = async (templateId) => {
  const res = await api.get(`/drugs/manage/templates/${templateId}`);
  return res.data;
};

// Delete a prescription template
export const deleteDrugTemplate = async (templateId) => {
  const res = await api.delete(`/drugs/manage/templates/${templateId}`);
  return res.data;
};
