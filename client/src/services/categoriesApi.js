import { apiRequest } from "./apiClient.js";

function normalizeCategory(item) {
  const categoryName = String(item.category ?? item.name ?? "").trim();

  return {
    id: item.id,
    category: categoryName,
    categoryType: item.categoryType ?? item.category_type ?? "expense",
    isBuiltin: Boolean(item.isBuiltin ?? item.is_builtin),
    createdAt: item.createdAt || item.created_at || null,
    updatedAt: item.updatedAt || item.updated_at || null,
  };
}

export async function getCategories() {
  const result = await apiRequest("/categories.php", { method: "GET" });
  return (result.categories || []).map(normalizeCategory);
}

export async function createCategory(payload) {
  const result = await apiRequest("/categories.php", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return normalizeCategory(result.category);
}

export async function updateCategory(payload) {
  const result = await apiRequest("/categories.php", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  return normalizeCategory(result.category);
}

export async function deleteCategory(id) {
  await apiRequest("/categories.php", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
}