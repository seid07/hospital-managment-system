import { get, post, patch } from "./api";

export const queueService = {
  async getDepartmentQueue(departmentCode, params = {}) {
    const query = new URLSearchParams();
    if (params.status) query.append("status", params.status);
    const qs = query.toString() ? `?${query.toString()}` : "";
    const res = await get(`/queues/${departmentCode}${qs}`);
    return res.data || res;
  },

  async callNext(departmentCode) {
    const res = await post(`/queues/${departmentCode}/call-next`);
    return res.data || res;
  },

  async updateQueueStatus(queueEntryId, data) {
    const res = await patch(`/queues/entry/${queueEntryId}/status`, data);
    return res.data || res;
  },
};

export default queueService;
