import { get, post } from "./api";

export const procedureService = {
  async getProcedureQueue(params = {}) {
    const query = new URLSearchParams();
    if (params.status) query.append("status", params.status);
    const qs = query.toString() ? `?${query.toString()}` : "";
    const res = await get(`/procedures/queue${qs}`);
    return res.data || res;
  },

  async completeProcedure(serviceOrderId, data) {
    const res = await post(`/procedures/orders/${serviceOrderId}/complete`, data);
    return res.data || res;
  },
};

export const wardService = {
  async getBeds() {
    const res = await get("/ward/beds");
    return res.data || res;
  },

  async getWardQueue(params = {}) {
    const query = new URLSearchParams();
    if (params.status) query.append("status", params.status);
    const qs = query.toString() ? `?${query.toString()}` : "";
    const res = await get(`/ward/queue${qs}`);
    return res.data || res;
  },

  async admitPatient(data) {
    const res = await post("/ward/admit", data);
    return res.data || res;
  },

  async dischargePatient(admissionId, data) {
    const res = await post(`/ward/discharge/${admissionId}`, data);
    return res.data || res;
  },
};

export const surgeryService = {
  async getSurgeryQueue(params = {}) {
    const query = new URLSearchParams();
    if (params.status) query.append("status", params.status);
    const qs = query.toString() ? `?${query.toString()}` : "";
    const res = await get(`/surgery/queue${qs}`);
    return res.data || res;
  },

  async updateSurgeryStatus(serviceOrderId, data) {
    const res = await post(`/surgery/orders/${serviceOrderId}/status`, data);
    return res.data || res;
  },
};
