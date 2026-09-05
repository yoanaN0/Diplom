import { useEffect, useState } from "react";

import { getSessionUser } from "../services/authStorage";
import { getAdminOverview, updateUserProfileStatus } from "../services/adminApi";

const statusLabels = {
  active: "Активен",
  blocked: "Блокиран",
};

const verificationLabels = {
  true: "Потвърден",
  false: "Непотвърден",
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
  }).format(parsed);
}

function Admin() {
  const currentUser = getSessionUser();
  const currentUserId = Number(currentUser?.id ?? 0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({
    totalUsersCount: 0,
    verifiedUsersCount: 0,
    blockedUsersCount: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    totalUsers: 0,
    totalPages: 0,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [pendingUserId, setPendingUserId] = useState(null);

  const loadOverview = async ({ search = searchTerm, page = 1 } = {}) => {
    setLoading(true);
    setError("");

    try {
      const overview = await getAdminOverview({ search, page });
      setUsers(overview.users);
      setStats(overview.stats);
      setPagination(overview.pagination);
      setSearchTerm(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неуспешно зареждане на админ панела.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview({ search: "", page: 1 });
  }, []);

  const handleSearchSubmit = async (event) => {
    event.preventDefault();
    await loadOverview({ search: searchTerm, page: 1 });
  };

  const handlePageChange = async (nextPage) => {
    if (nextPage < 1) {
      return;
    }

    if (pagination.totalPages > 0 && nextPage > pagination.totalPages) {
      return;
    }

    await loadOverview({ search: searchTerm, page: nextPage });
  };

  const handleStatusToggle = async (user) => {
    const nextStatus = user.profileStatus === "active" ? "blocked" : "active";

    if (nextStatus === "blocked" && user.id === currentUserId) {
      setError("Не можеш да блокираш собствения си профил.");
      return;
    }

    if (nextStatus === "blocked" && !window.confirm(`Сигурни ли сте, че искате да блокирате ${user.name || user.email || "този потребител"}?`)) {
      return;
    }

    setPendingUserId(user.id);
    setError("");

    try {
      await updateUserProfileStatus(user.id, nextStatus);
      await loadOverview({ search: searchTerm, page: pagination.page });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неуспешна промяна на статуса.");
    } finally {
      setPendingUserId(null);
    }
  };

  return (
    <div className="finance-page admin-page">
      <section className="finance-header">
        <div>
          <h1>Административен панел</h1>
          <p>Преглед, търсене по имейл и блокиране или активиране на потребители.</p>
        </div>
      </section>

      <section className="admin-stats-grid">
        <article className="surface-card admin-stat-card">
          <p>Общо потребители</p>
          <strong>{stats.totalUsersCount}</strong>
        </article>
        <article className="surface-card admin-stat-card">
          <p>Потвърдени потребители</p>
          <strong>{stats.verifiedUsersCount}</strong>
        </article>
        <article className="surface-card admin-stat-card">
          <p>Блокирани потребители</p>
          <strong>{stats.blockedUsersCount}</strong>
        </article>
      </section>

      <section className="surface-card admin-users-card">
        <div className="surface-card__head">
          <h2>Потребители</h2>
          <p className="muted admin-table-hint">Показват се до 20 записа на страница.</p>
        </div>

        <form className="admin-filters" onSubmit={handleSearchSubmit}>
          <label>
            <span>Търсене по имейл</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="example@domain.com"
            />
          </label>
          <button type="submit" className="button button--primary">
            Търси
          </button>
        </form>

        {loading ? <p className="muted admin-state">Зареждане на потребители...</p> : null}
        {error ? <p className="muted admin-state admin-state--error">{error}</p> : null}

        {!loading && !error && users.length === 0 ? (
          <p className="muted admin-state">Няма потребители по зададеното търсене.</p>
        ) : null}

        {!loading && !error && users.length > 0 ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Име и фамилия</th>
                  <th>Имейл</th>
                  <th>Дата на регистрация</th>
                  <th>Верификация</th>
                  <th>Статус</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isCurrentUser = user.id === currentUserId;
                  const actionLabel = user.profileStatus === "active" ? "Блокирай" : "Активирай";
                  const isPending = pendingUserId === user.id;

                  return (
                    <tr key={user.id}>
                      <td>{user.name || "-"}</td>
                      <td>{user.email || "-"}</td>
                      <td>{formatDateTime(user.registeredAt)}</td>
                      <td>
                        <span className={`admin-status admin-status--${user.isVerified ? "verified" : "unverified"}`}>
                          {verificationLabels[String(Boolean(user.isVerified))]}
                        </span>
                      </td>
                      <td>
                        <span className={`admin-status admin-status--${user.profileStatus}`}>
                          {statusLabels[user.profileStatus] || user.profileStatus}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={user.profileStatus === "active" ? "button button--ghost" : "button button--primary"}
                          onClick={() => handleStatusToggle(user)}
                          disabled={isPending || (isCurrentUser && user.profileStatus === "active")}
                          title={isCurrentUser && user.profileStatus === "active" ? "Не можеш да блокираш собствения си профил." : undefined}
                        >
                          {isPending ? "Обновяване..." : actionLabel}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="admin-pagination">
          <button
            type="button"
            className="button button--ghost"
            onClick={() => void handlePageChange(pagination.page - 1)}
            disabled={loading || pagination.page <= 1}
          >
            Предишна
          </button>
          <span className="admin-pagination__info">
            {pagination.totalUsers === 0
              ? "Няма страници"
              : `Страница ${pagination.page} от ${pagination.totalPages || 1} · ${pagination.totalUsers} потребители`}
          </span>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => void handlePageChange(pagination.page + 1)}
            disabled={loading || (pagination.totalPages > 0 && pagination.page >= pagination.totalPages)}
          >
            Следваща
          </button>
        </div>
      </section>
    </div>
  );
}

export default Admin;
