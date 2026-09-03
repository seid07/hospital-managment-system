import { get, post } from "./api";

export const wardService = {
  async getMetrics() {
    const res = await get("/ward/metrics");
    return res.data || res;
  },

  async getBeds() {
    const res = await get("/ward/beds");
    return res.data || res;
  },

  async createBed(data) {
    const res = await post("/ward/beds", data);
    return res.data || res;
  },

  async updateBedStatus(bedId, status) {
    const res = await post(`/ward/beds/${bedId}/status`, { status });
    return res.data || res;
  },

  async getWardQueue(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await get(`/ward/queue${query ? `?${query}` : ""}`);
    return res.data || res;
  },

  async admitPatient(data) {
    const res = await post("/ward/admissions", data);
    return res.data || res;
  },

  async transferBed(admissionId, data) {
    const res = await post(`/ward/admissions/${admissionId}/transfer`, data);
    return res.data || res;
  },

  async dischargePatient(admissionId, data) {
    const res = await post(`/ward/admissions/${admissionId}/discharge`, data);
    return res.data || res;
  },
};

export default wardService;
