import { apiRequest } from "./apiClient.js";

let adminCsrfToken = "";

function setAdminCsrfToken(token) {
  adminCsrfToken = String(token || "").trim();
}

function adminHeaders() {
  return adminCsrfToken ? { "X-CSRF-Token": adminCsrfToken } : {};
}

export function normalizeAdminUser(item) {
  const firstName = String(item?.firstName ?? "").trim();
  const lastName = String(item?.lastName ?? "").trim();
  const fallbackName = [firstName, lastName].filter(Boolean).join(" ");

  return {
    id: Number(item?.id ?? 0),
    name: String(item?.name ?? fallbackName).trim(),
    firstName,
    lastName,
    email: String(item?.email ?? ""),
    registeredAt: item?.registeredAt ?? null,
    profileStatus: String(item?.profileStatus ?? "active").toLowerCase(),
    isVerified: Boolean(Number(item?.isVerified ?? 0)),
  };
}

export async function getAdminOverview(params = {}) {
  const query = new URLSearchParams();

  if (params.search) {
    query.set("search", String(params.search).trim());
  }
  if (params.page) {
    query.set("page", String(params.page));
  }

  const url = query.toString() ? `?${query.toString()}` : "";
  const result = await apiRequest(`/admin/users.php${url}`, { method: "GET" });

  setAdminCsrfToken(result?.csrfToken ?? "");

  return {
    stats: {
      totalUsersCount: Number(result?.stats?.totalUsersCount ?? 0),
      verifiedUsersCount: Number(result?.stats?.verifiedUsersCount ?? 0),
      blockedUsersCount: Number(result?.stats?.blockedUsersCount ?? 0),
    },
    pagination: {
      page: Number(result?.pagination?.page ?? 1),
      pageSize: Number(result?.pagination?.pageSize ?? 20),
      totalUsers: Number(result?.pagination?.totalUsers ?? 0),
      totalPages: Number(result?.pagination?.totalPages ?? 0),
    },
    users: Array.isArray(result?.users) ? result.users.map(normalizeAdminUser) : [],
  };
}

export async function createUser(payload = {}) {
  const result = await apiRequest("/admin/users.php", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });

  return normalizeAdminUser(result?.user ?? {});
}

export async function updateUserProfileStatus(userId, status) {
  const result = await apiRequest("/admin/users.php", {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({ userId, status }),
  });

  return normalizeAdminUser(result?.user ?? {});
}

export async function updateUserRole(userId, role) {
  const result = await apiRequest("/admin/users.php", {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({ userId, role }),
  });

  return normalizeAdminUser(result?.user ?? {});
}

export async function updateUserProfile(userId, payload = {}) {
  const result = await apiRequest("/admin/users.php", {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify({ userId, ...payload }),
  });

  return normalizeAdminUser(result?.user ?? {});
}

export async function deleteUser(userId) {
  const result = await apiRequest("/admin/users.php", {
    method: "DELETE",
    headers: adminHeaders(),
    body: JSON.stringify({ userId }),
  });

  return result?.deletedUserId ?? userId;
}

export function getAdminCsrfToken() {
  return adminCsrfToken;
}
