import { get, post } from "./api";

export const radiologyService = {
  async getMetrics() {
    const res = await get("/radiology/metrics");
    return res.data || res;
  },

  async getRadiologyQueue(params = {}) {
    const query = new URLSearchParams();
    if (params.status && params.status !== "ALL") query.append("status", params.status);
    const qs = query.toString() ? `?${query.toString()}` : "";
    const res = await get(`/radiology/queue${qs}`);
    return res.data || res;
  },

  async startExam(serviceOrderId) {
    const res = await post(`/radiology/orders/${serviceOrderId}/start`, {});
    return res.data || res;
  },

  async recordRadiologyResult(serviceOrderId, data) {
    const res = await post(`/radiology/orders/${serviceOrderId}/result`, data);
    return res.data || res;
  },

  async getRadiologyOrder(id) {
    const res = await get(`/radiology/orders/${id}`);
    return res.data || res;
  },

  async getPatientRadiologyHistory(patientId) {
    const res = await get(`/radiology/patients/${patientId}/history`);
    return res.data || res;
  },
};

export default radiologyService;
