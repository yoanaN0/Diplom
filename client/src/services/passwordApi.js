import { apiRequest } from "./apiClient.js";

export async function changePassword(payload) {
  await apiRequest("/auth/change-password.php", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
