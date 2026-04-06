import api from "@/config/axios";

export const createBilling = async (payload) => {
  const res = await api.post("/billing/", payload);
  return res.data;
};

export const updateBilling = async (billingId, payload) => {
  const res = await api.put(`/billing/${billingId}`, payload);
  return res.data;
};

export const getAllBilling = async (params = {}) => {
  const res = await api.get("/billing/", { params });
  return res.data;
};

export const getBillingById = async (billingId) => {
  const res = await api.get(`/billing/${billingId}`);
  return res.data;
};

export const deleteBilling = async (billingId) => {
  const res = await api.delete(`/billing/${billingId}`);
  return res.data;
};
