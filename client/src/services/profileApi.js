import { apiRequest } from "./apiClient.js";

export async function fetchProfile() {
  const result = await apiRequest("/profile.php", { method: "GET" });
  return result.user;
}

export async function saveProfile(payload) {
  const result = await apiRequest("/profile.php", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  return result.user;
}
