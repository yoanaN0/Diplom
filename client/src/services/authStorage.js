const SESSION_KEY = "finly_session";
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost/DiplomJSme/api";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function setLocalSession(user) {
  if (!user) {
    return;
  }

  writeJson(SESSION_KEY, {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role || "user",
    profileStatus: user.profileStatus || "active",
    isVerified: Boolean(user.isVerified),
    lastLoginAt: user.lastLoginAt || null,
  });
  localStorage.setItem("isAuthenticated", "true");
  window.dispatchEvent(new Event("finly-auth-changed"));
}

function clearLocalSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem("isAuthenticated");
  window.dispatchEvent(new Event("finly-auth-changed"));
}

async function callApi(path, options = {}) {
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
    return {
      ok: false,
      error: body.error || "Възникна грешка при връзката със сървъра.",
    };
  }

  return { ok: true, ...body };
}

export async function registerUser({ firstName, lastName, email, password }) {
  const result = await callApi("/auth/register.php", {
    method: "POST",
    body: JSON.stringify({ firstName, lastName, email, password }),
  });

  if (!result.ok) {
    return result;
  }

  setLocalSession(result.user);
  return result;
}

export async function loginUser({ email, password }) {
  const result = await callApi("/auth/login.php", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  if (!result.ok) {
    return result;
  }

  setLocalSession(result.user);
  return result;
}

export async function fetchSessionUser() {
  const result = await callApi("/auth/me.php", { method: "GET" });

  if (!result.ok) {
    clearLocalSession();
    return result;
  }

  setLocalSession(result.user);
  return result;
}

export async function clearSession() {
  await callApi("/auth/logout.php", { method: "POST" });
  clearLocalSession();
}

export function isAuthenticated() {
  return localStorage.getItem("isAuthenticated") === "true";
}

export function getSessionUser() {
  return readJson(SESSION_KEY, null);
}

export function isAdmin() {
  const user = getSessionUser();
  return Boolean(user && user.role === "admin" && user.profileStatus === "active");
}

export async function syncAuthState() {
  if (!isAuthenticated()) {
    return { ok: false };
  }

  return fetchSessionUser();
}
