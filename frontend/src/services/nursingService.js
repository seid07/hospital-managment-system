import { get, post, patch } from "./api";

export const nursingService = {
  async getMetrics() {
    const res = await get("/nursing/metrics");
    return res.data || res;
  },

  async getPatients(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await get(`/nursing/patients${query ? `?${query}` : ""}`);
    return res.data || res;
  },

  async getTasks(patientId) {
    const res = await get(`/nursing/tasks${patientId ? `?patientId=${patientId}` : ""}`);
    return res.data || res;
  },

  async createTask(data) {
    const res = await post("/nursing/tasks", data);
    return res.data || res;
  },

  async updateTaskStatus(id, data) {
    const res = await patch(`/nursing/tasks/${id}/status`, data);
    return res.data || res;
  },

  async getMedications(patientId) {
    const res = await get(`/nursing/patients/${patientId}/medications`);
    return res.data || res;
  },

  async recordMedication(data) {
    const res = await post("/nursing/medications", data);
    return res.data || res;
  },

  async getNotes(patientId) {
    const res = await get(`/nursing/patients/${patientId}/notes`);
    return res.data || res;
  },

  async getPatientOverview(patientId) {
    const res = await get(`/nursing/patients/${patientId}/overview`);
    return res.data || res;
  },

  async createNote(data) {
    const res = await post("/nursing/notes", data);
    return res.data || res;
  },

  async escalateToDoctor(data) {
    const res = await post("/nursing/escalations", data);
    return res.data || res;
  },
};

export default nursingService;
