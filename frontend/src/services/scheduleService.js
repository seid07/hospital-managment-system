import { get } from "./api";

export async function getDoctors() {
  return get("/schedules/doctors");
}

export async function getDoctorSchedules(
  doctorId
) {
  return get(
    `/schedules/doctors/${doctorId}`
  );
}
