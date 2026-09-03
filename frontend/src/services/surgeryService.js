import { get, post } from "./api";

export const surgeryService = {
  async getMetrics() {
    const res = await get("/surgery/metrics");
    return res.data || res;
  },

  async getSurgeryQueue(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await get(`/surgery/queue${query ? `?${query}` : ""}`);
    return res.data || res;
  },

  async updateChecklist(serviceOrderId, data) {
    const res = await post(`/surgery/orders/${serviceOrderId}/checklist`, data);
    return res.data || res;
  },

  async startSurgery(serviceOrderId) {
    const res = await post(`/surgery/orders/${serviceOrderId}/start`, {});
    return res.data || res;
  },

  async completeSurgery(serviceOrderId, data) {
    const res = await post(`/surgery/orders/${serviceOrderId}/complete`, data);
    return res.data || res;
  },
};

export default surgeryService;
