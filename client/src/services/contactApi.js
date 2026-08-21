import { apiRequest } from "./apiClient.js";

export async function sendContactMessage(payload) {
  await apiRequest("/contact.php", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
