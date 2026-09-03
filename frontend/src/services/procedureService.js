import { get, post } from "./api";

export const procedureService = {
  async getMetrics() {
    const res = await get("/procedures/metrics");
    return res.data || res;
  },

  async getProcedureQueue(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await get(`/procedures/queue${query ? `?${query}` : ""}`);
    return res.data || res;
  },

  async startProcedure(serviceOrderId) {
    const res = await post(`/procedures/orders/${serviceOrderId}/start`, {});
    return res.data || res;
  },

  async completeProcedure(serviceOrderId, data) {
    const res = await post(`/procedures/orders/${serviceOrderId}/complete`, data);
    return res.data || res;
  },
};

export default procedureService;
