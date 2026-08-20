import { get } from "./api";

export const serviceCatalogService = {
  async getServices(params = {}) {
    const query = new URLSearchParams();
    if (params.category) query.append("category", params.category);
    if (params.activeOnly !== undefined) query.append("activeOnly", params.activeOnly);
    const qs = query.toString() ? `?${query.toString()}` : "";
    const res = await get(`/services${qs}`);
    return res.data || res;
  },

  async getDepartments() {
    const res = await get("/services/departments");
    return res.data || res;
  },

  async getServiceById(id) {
    const res = await get(`/services/${id}`);
    return res.data || res;
  },
};

export default serviceCatalogService;
