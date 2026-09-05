import { apiRequest } from "./apiClient.js";

export async function requestPasswordResetCode(email) {
  const response = await apiRequest("/auth/request-password-reset.php", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

  return response.message || "";
}

export async function resetPassword(payload) {
  return apiRequest("/auth/reset-password.php", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
