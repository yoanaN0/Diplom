import { useEffect, useState } from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";

import { clearSession, getSessionUser, isAdmin, isAuthenticated } from "../services/authStorage";

function Navbar() {
  const navigate = useNavigate();
  const [userLoggedIn, setUserLoggedIn] = useState(() => {
    return isAuthenticated();
  });
  const [userIsAdmin, setUserIsAdmin] = useState(() => isAdmin());

  useEffect(() => {
    const handleStorageChange = () => {
      setUserLoggedIn(isAuthenticated());
      setUserIsAdmin(isAdmin());
    };

    const handleAuthChange = () => {
      setUserLoggedIn(isAuthenticated());
      setUserIsAdmin(isAdmin());
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("finly-auth-changed", handleAuthChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("finly-auth-changed", handleAuthChange);
    };
  }, []);

  const handleLogout = async () => {
    await clearSession();
    setUserLoggedIn(false);
    setUserIsAdmin(false);
    navigate("/");
  };

  const user = getSessionUser();

  return (
    <header className="navbar">
      <Link
        to={userLoggedIn ? "/dashboard" : "/"}
        className="navbar__brand"
        aria-label={userLoggedIn ? "Finly dashboard" : "Finly home"}
      >
        <span className="navbar__mark">F</span>
        <span>Finly</span>
      </Link>

      <nav aria-label="Main navigation">
        <ul className="navbar__links">
          {userLoggedIn ? (
            userIsAdmin ? (
              <li>
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    isActive ? "navbar__link navbar__link--active" : "navbar__link"
                  }
                >
                  Админ
                </NavLink>
              </li>
            ) : (
              <>
                <li>
                  <NavLink
                    to="/dashboard"
                    className={({ isActive }) =>
                      isActive ? "navbar__link navbar__link--active" : "navbar__link"
                    }
                  >
                    Табло
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/wallets"
                    className={({ isActive }) =>
                      isActive ? "navbar__link navbar__link--active" : "navbar__link"
                    }
                  >
                    Портфейли
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/budgets"
                    className={({ isActive }) =>
                      isActive ? "navbar__link navbar__link--active" : "navbar__link"
                    }
                  >
                    Бюджети
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/goals"
                    className={({ isActive }) =>
                      isActive ? "navbar__link navbar__link--active" : "navbar__link"
                    }
                  >
                    Цели
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/transactions"
                    className={({ isActive }) =>
                      isActive ? "navbar__link navbar__link--active" : "navbar__link"
                    }
                  >
                    Транзакции
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/financial-twin"
                    className={({ isActive }) =>
                      isActive ? "navbar__link navbar__link--active" : "navbar__link"
                    }
                  >
                    Сценарии
                  </NavLink>
                </li>
              </>
            )
          ) : (
            <>
              <li>
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) =>
                    isActive ? "navbar__link navbar__link--active" : "navbar__link"
                  }
                >
                  Начало
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/about"
                  className={({ isActive }) =>
                    isActive ? "navbar__link navbar__link--active" : "navbar__link"
                  }
                >
                  За Finly
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/contact"
                  className={({ isActive }) =>
                    isActive ? "navbar__link navbar__link--active" : "navbar__link"
                  }
                >
                  Контакти
                </NavLink>
              </li>
            </>
          )}
        </ul>
      </nav>

      <div className="navbar__actions">
        {userLoggedIn ? (
          <>
            {!userIsAdmin ? (
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                isActive
                  ? "navbar__profile-button navbar__profile-button--active"
                  : "navbar__profile-button"
              }
              aria-label="Профил"
              title={user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Профил" : "Профил"}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12Zm0 2.25c-3.75 0-6.75 1.9-6.75 4.25a.75.75 0 0 0 1.5 0c0-1.31 2.17-2.75 5.25-2.75s5.25 1.44 5.25 2.75a.75.75 0 0 0 1.5 0c0-2.35-3-4.25-6.75-4.25Z" />
              </svg>
            </NavLink>
            ) : null}

            <button type="button" onClick={handleLogout} className="button button--ghost">
              Изход
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="button button--ghost">
              Вход
            </Link>
            <Link to="/register" className="button button--primary">
              Регистрация
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

export default Navbar;