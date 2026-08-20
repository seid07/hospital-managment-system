import { get, post, patch } from "./api";

export const visitService = {
  async createVisit(data) {
    const res = await post("/visits", data);
    return res.data || res;
  },

  async getPatientVisits(patientId) {
    const res = await get(`/visits/patient/${patientId}`);
    return res.data || res;
  },

  async getVisitById(id) {
    const res = await get(`/visits/${id}`);
    return res.data || res;
  },

  async closeVisit(id) {
    const res = await patch(`/visits/${id}/close`);
    return res.data || res;
  },
};

export default visitService;
