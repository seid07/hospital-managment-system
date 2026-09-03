import { get, post } from "./api";

export const serviceOrderService = {
  async createServiceOrders(data) {
    const res = await post("/service-orders", data);
    return res.data || res;
  },

  async createDoctorOrders(data) {
    const res = await post("/service-orders", data);
    return res.data || res;
  },

  async getServiceOrdersByVisit(visitId) {
    const res = await get(`/service-orders/visit/${visitId}`);
    return res.data || res;
  },

  async getServiceOrderById(id) {
    const res = await get(`/service-orders/${id}`);
    return res.data || res;
  },

  async authorizeServiceOrder(id, data = {}) {
    const res = await post(`/service-orders/${id}/authorize`, data);
    return res.data || res;
  },

  async cancelServiceOrder(id, data = {}) {
    const res = await post(`/service-orders/${id}/cancel`, data);
    return res.data || res;
  },

  async getPatientClinicalResults(patientId) {
    const res = await get(`/service-orders/patient/${patientId}/results`);
    return res.data || res;
  },
};

export default serviceOrderService;
