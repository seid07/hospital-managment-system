import {
  get,
  post,
} from "./api";

export async function getAvailability(
  doctorId,
  date
) {
  const params =
    new URLSearchParams({
      doctorId,
      date,
    });

  return get(
    `/appointments/availability?${params}`
  );
}

export async function createAppointment(
  appointment
) {
  return post(
    "/appointments",
    appointment
  );
}
