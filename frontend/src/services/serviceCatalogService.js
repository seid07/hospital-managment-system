import { get } from "./api";

export async function getServices(params = {}) {
  const query = new URLSearchParams();
  if (params.category) query.append("category", params.category);
  if (params.department) query.append("department", params.department);
  if (params.activeOnly !== undefined) query.append("activeOnly", params.activeOnly);
  if (params.search) query.append("search", params.search);
  const qs = query.toString() ? `?${query.toString()}` : "";
  const res = await get(`/services${qs}`);
  return res.data || res;
}

export async function getDepartments() {
  const res = await get("/services/departments");
  return res.data || res;
}

export async function getServiceById(id) {
  const res = await get(`/services/${id}`);
  return res.data || res;
}

export const serviceCatalogService = {
  getServices,
  getDepartments,
  getServiceById,
};

export default serviceCatalogService;
