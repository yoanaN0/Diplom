const env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};
const API_BASE = env.VITE_API_BASE_URL || "http://localhost/DiplomJSme/api";

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  let body;
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok || body.ok === false) {
    throw new Error(body.error || "Възникна грешка при връзката със сървъра.");
  }

  return body;
}
