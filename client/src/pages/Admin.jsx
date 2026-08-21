import { useEffect, useMemo, useState } from "react";

import {
  createUser,
  deleteUser,
  getAdminOverview,
  updateUserProfile,
  updateUserProfileStatus,
  updateUserRole,
} from "../services/adminApi";

const statusLabels = {
  active: "Активен",
  blocked: "Блокиран",
  deleted: "Изтрит",
};

const roleLabels = {
  admin: "Администратор",
  user: "Потребител",
};

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("bg-BG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function Admin() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({
    usersCount: 0,
    blockedUsersCount: 0,
    recent7Days: 0,
    recent30Days: 0,
  });
  const [statusUpdateId, setStatusUpdateId] = useState(null);
  const [roleUpdateId, setRoleUpdateId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    role: "user",
    status: "active",
  });
  const [editUserId, setEditUserId] = useState(null);
  const [editDraft, setEditDraft] = useState({ firstName: "", lastName: "", email: "" });

  const loadOverview = async (nextFilters = { search: searchTerm, status: statusFilter, role: roleFilter }) => {
    setLoading(true);
    setError("");

    try {
      const overview = await getAdminOverview(nextFilters);
      setUsers(overview.users);
      setStats(overview.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неуспешно зареждане на админ панела.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, []);

  const sortedUsers = useMemo(
    () => [...users].sort((left, right) => (right.registeredAt || "").localeCompare(left.registeredAt || "")),
    [users],
  );

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return sortedUsers.filter((user) => {
      const matchesSearch =
        normalizedSearch === "" ||
        `${user.name} ${user.email}`.toLowerCase().includes(normalizedSearch);
      const matchesStatus = statusFilter === "all" || user.profileStatus === statusFilter;
      const matchesRole = roleFilter === "all" || user.role === roleFilter;

      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [searchTerm, sortedUsers, statusFilter, roleFilter]);

  const blockedUsers = useMemo(
    () => sortedUsers.filter((user) => user.profileStatus === "blocked"),
    [sortedUsers],
  );

  const handleStatusToggle = async (userId, currentStatus) => {
    const nextStatus = currentStatus === "active" ? "blocked" : "active";
    setStatusUpdateId(userId);
    setError("");

    try {
      const updatedUser = await updateUserProfileStatus(userId, nextStatus);
      setUsers((current) => current.map((user) => (user.id === userId ? { ...user, ...updatedUser } : user)));
      await loadOverview({ search: searchTerm, status: statusFilter, role: roleFilter });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неуспешна промяна на статуса.");
    } finally {
      setStatusUpdateId(null);
    }
  };

  const handleRoleChange = async (userId, nextRole) => {
    setRoleUpdateId(userId);
    setError("");

    try {
      const updatedUser = await updateUserRole(userId, nextRole);
      setUsers((current) => current.map((user) => (user.id === userId ? { ...user, ...updatedUser } : user)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неуспешна промяна на ролята.");
    } finally {
      setRoleUpdateId(null);
    }
  };

  const handleCreateUser = async () => {
    setError("");

    try {
      const createdUser = await createUser(createDraft);
      setUsers((current) => [createdUser, ...current]);
      setShowCreateForm(false);
      setCreateDraft({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        role: "user",
        status: "active",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неуспешно създаване на потребител.");
    }
  };

  const handleEditStart = (user) => {
    setEditUserId(user.id);
    setEditDraft({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    });
  };

  const handleEditSave = async () => {
    if (!editUserId) {
      return;
    }

    setError("");

    try {
      const updatedUser = await updateUserProfile(editUserId, editDraft);
      setUsers((current) => current.map((user) => (user.id === editUserId ? { ...user, ...updatedUser } : user)));
      setEditUserId(null);
      setEditDraft({ firstName: "", lastName: "", email: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неуспешно обновяване на потребителя.");
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm("Сигурни ли сте, че искате да изтриете този потребител?")) {
      return;
    }

    setDeleteId(userId);
    setError("");

    try {
      await deleteUser(userId);
      setUsers((current) => current.map((user) =>
        user.id === userId ? { ...user, profileStatus: "deleted" } : user,
      ));
      if (editUserId === userId) {
        setEditUserId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неуспешно изтриване на потребителя.");
    } finally {
      setDeleteId(null);
    }
  };

  const applyFilters = async () => {
    await loadOverview({ search: searchTerm, status: statusFilter, role: roleFilter });
  };

  return (
    <div className="finance-page admin-page">
      <section className="finance-header">
        <div>
          <h1>Админ панел</h1>
          <p>Управлявай потребителите, техния статус и ролите в системата.</p>
        </div>
      </section>

      <section className="admin-stats-grid">
        <article className="surface-card admin-stat-card">
          <p>Регистрирани</p>
          <strong>{stats.usersCount}</strong>
        </article>
        <article className="surface-card admin-stat-card">
          <p>Блокирани</p>
          <strong>{stats.blockedUsersCount}</strong>
        </article>
        <article className="surface-card admin-stat-card">
          <p>Нови за 7 дни</p>
          <strong>{stats.recent7Days}</strong>
        </article>
        <article className="surface-card admin-stat-card">
          <p>Нови за 30 дни</p>
          <strong>{stats.recent30Days}</strong>
        </article>
      </section>

      {loading ? <p className="muted">Зареждане на админ данни...</p> : null}
      {error ? <p className="muted">{error}</p> : null}

      <section className="surface-card admin-blocked-card">
        <div className="surface-card__head">
          <h2>Блокирани потребители</h2>
        </div>

        {blockedUsers.length === 0 ? (
          <p className="muted">Няма блокирани профили.</p>
        ) : (
          <ul className="admin-blocked-list">
            {blockedUsers.map((user) => (
              <li key={`blocked-${user.id}`} className="admin-blocked-item">
                <div>
                  <strong>{user.name || "-"}</strong>
                  <p>{user.email || "-"}</p>
                  <p>Последен вход: {formatDateTime(user.lastLoginAt)}</p>
                </div>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => handleStatusToggle(user.id, user.profileStatus)}
                  disabled={statusUpdateId === user.id}
                >
                  {statusUpdateId === user.id ? "Обновяване..." : "Активирай"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="surface-card admin-users-card">
        <div className="surface-card__head">
          <h2>Управление на потребители</h2>
          <div className="surface-card__head-actions">
            <button type="button" className="button button--primary" onClick={() => setShowCreateForm((current) => !current)}>
              {showCreateForm ? "Затвори" : "Създай потребител"}
            </button>
            <button type="button" className="button button--ghost" onClick={() => loadOverview()}>
              Обнови
            </button>
          </div>
        </div>

        {showCreateForm ? (
          <div className="admin-create-form">
            <div className="admin-create-grid">
              <label>
                <span>Име</span>
                <input
                  type="text"
                  value={createDraft.firstName}
                  onChange={(event) => setCreateDraft((current) => ({ ...current, firstName: event.target.value }))}
                />
              </label>
              <label>
                <span>Фамилия</span>
                <input
                  type="text"
                  value={createDraft.lastName}
                  onChange={(event) => setCreateDraft((current) => ({ ...current, lastName: event.target.value }))}
                />
              </label>
              <label>
                <span>Имейл</span>
                <input
                  type="email"
                  value={createDraft.email}
                  onChange={(event) => setCreateDraft((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <label>
                <span>Парола</span>
                <input
                  type="password"
                  value={createDraft.password}
                  onChange={(event) => setCreateDraft((current) => ({ ...current, password: event.target.value }))}
                />
              </label>
              <label>
                <span>Роля</span>
                <select
                  value={createDraft.role}
                  onChange={(event) => setCreateDraft((current) => ({ ...current, role: event.target.value }))}
                >
                  <option value="user">Потребител</option>
                  <option value="admin">Администратор</option>
                </select>
              </label>
              <label>
                <span>Статус</span>
                <select
                  value={createDraft.status}
                  onChange={(event) => setCreateDraft((current) => ({ ...current, status: event.target.value }))}
                >
                  <option value="active">Активен</option>
                  <option value="blocked">Блокиран</option>
                  <option value="deleted">Изтрит</option>
                </select>
              </label>
            </div>
            <div className="admin-create-actions">
              <button type="button" className="button button--primary" onClick={handleCreateUser}>
                Създай
              </button>
            </div>
          </div>
        ) : null}

        <div className="admin-filters">
          <label>
            <span>Търсене</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Име или имейл"
            />
          </label>
          <label>
            <span>Статус</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Всички</option>
              <option value="active">Активни</option>
              <option value="blocked">Блокирани</option>
              <option value="deleted">Изтрити</option>
            </select>
          </label>
          <label>
            <span>Роля</span>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="all">Всички</option>
              <option value="admin">Администратори</option>
              <option value="user">Потребители</option>
            </select>
          </label>
          <button type="button" className="button button--primary" onClick={applyFilters}>
            Приложи
          </button>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Име</th>
                <th>Имейл</th>
                <th>Роля</th>
                <th>Регистрация</th>
                <th>Последен вход</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="muted">
                    Няма потребители по избраните филтри.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      {editUserId === user.id ? (
                        <div className="admin-inline-editor">
                          <input
                            type="text"
                            value={editDraft.firstName}
                            onChange={(event) => setEditDraft((current) => ({ ...current, firstName: event.target.value }))}
                          />
                          <input
                            type="text"
                            value={editDraft.lastName}
                            onChange={(event) => setEditDraft((current) => ({ ...current, lastName: event.target.value }))}
                          />
                        </div>
                      ) : (
                        user.name || "-"
                      )}
                    </td>
                    <td>
                      {editUserId === user.id ? (
                        <input
                          type="email"
                          value={editDraft.email}
                          onChange={(event) => setEditDraft((current) => ({ ...current, email: event.target.value }))}
                        />
                      ) : (
                        user.email || "-"
                      )}
                    </td>
                    <td>
                      {user.role === "admin" ? (
                        <span className="pill pill--ok">{roleLabels[user.role] || user.role}</span>
                      ) : (
                        <select
                          value={user.role}
                          onChange={(event) => handleRoleChange(user.id, event.target.value)}
                          disabled={roleUpdateId === user.id}
                        >
                          <option value="admin">Администратор</option>
                          <option value="user">Потребител</option>
                        </select>
                      )}
                    </td>
                    <td>{formatDateTime(user.registeredAt)}</td>
                    <td>{formatDateTime(user.lastLoginAt)}</td>
                    <td>
                      <span className={`admin-status admin-status--${user.profileStatus}`}>
                        {statusLabels[user.profileStatus] || user.profileStatus}
                      </span>
                    </td>
                    <td>
                      <div className="admin-action-stack">
                        {editUserId === user.id ? (
                          <>
                            <button type="button" className="button button--primary" onClick={handleEditSave}>
                              Запази
                            </button>
                            <button type="button" className="button button--ghost" onClick={() => setEditUserId(null)}>
                              Отказ
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="button button--ghost" onClick={() => handleEditStart(user)}>
                              Редактирай
                            </button>
                            <button
                              type="button"
                              className={user.profileStatus === "active" ? "button button--ghost" : "button button--primary"}
                              onClick={() => handleStatusToggle(user.id, user.profileStatus)}
                              disabled={statusUpdateId === user.id}
                            >
                              {statusUpdateId === user.id
                                ? "Обновяване..."
                                : user.profileStatus === "active"
                                  ? "Блокирай"
                                  : "Активирай"}
                            </button>
                            <button
                              type="button"
                              className="button button--danger"
                              onClick={() => handleDelete(user.id)}
                              disabled={deleteId === user.id}
                            >
                              {deleteId === user.id ? "Изтриване..." : "Изтрий"}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default Admin;
