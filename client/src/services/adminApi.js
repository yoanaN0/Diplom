import { apiRequest } from "./apiClient.js";

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
    lastLoginAt: item?.lastLoginAt ?? null,
    profileStatus: String(item?.profileStatus ?? "active").toLowerCase(),
    role: String(item?.role ?? "user").toLowerCase(),
    isVerified: Boolean(item?.isVerified),
    loginLogs: Array.isArray(item?.loginLogs)
      ? item.loginLogs.map((log) => ({
          id: Number(log?.id ?? 0),
          email: log?.email ?? null,
          ipAddress: log?.ipAddress ?? "",
          userAgent: log?.userAgent ?? "",
          isSuccess: Boolean(log?.isSuccess),
          loggedAt: log?.loggedAt ?? null,
        }))
      : [],
  };
}

export async function getAdminOverview(params = {}) {
  const query = new URLSearchParams();

  if (params.search) {
    query.set("search", params.search);
  }
  if (params.status) {
    query.set("status", params.status);
  }
  if (params.role) {
    query.set("role", params.role);
  }

  const url = query.toString() ? `?${query.toString()}` : "";
  const result = await apiRequest(`/admin/users.php${url}`, { method: "GET" });

  return {
    stats: {
      usersCount: Number(result?.stats?.usersCount ?? 0),
      blockedUsersCount: Number(result?.stats?.blockedUsersCount ?? 0),
      recent7Days: Number(result?.stats?.recent7Days ?? 0),
      recent30Days: Number(result?.stats?.recent30Days ?? 0),
    },
    users: Array.isArray(result?.users) ? result.users.map(normalizeAdminUser) : [],
  };
}

export async function createUser(payload = {}) {
  const result = await apiRequest("/admin/users.php", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return normalizeAdminUser(result?.user ?? {});
}

export async function updateUserProfileStatus(userId, status) {
  const result = await apiRequest("/admin/users.php", {
    method: "PATCH",
    body: JSON.stringify({ userId, status }),
  });

  return normalizeAdminUser(result?.user ?? {});
}

export async function updateUserRole(userId, role) {
  const result = await apiRequest("/admin/users.php", {
    method: "PATCH",
    body: JSON.stringify({ userId, role }),
  });

  return normalizeAdminUser(result?.user ?? {});
}

export async function updateUserProfile(userId, payload = {}) {
  const result = await apiRequest("/admin/users.php", {
    method: "PUT",
    body: JSON.stringify({ userId, ...payload }),
  });

  return normalizeAdminUser(result?.user ?? {});
}

export async function deleteUser(userId) {
  const result = await apiRequest("/admin/users.php", {
    method: "DELETE",
    body: JSON.stringify({ userId }),
  });

  return result?.deletedUserId ?? userId;
}
