import { Link } from "react-router-dom";
import { isAdmin, isAuthenticated } from "../services/authStorage";

function Footer() {
  const year = new Date().getFullYear();
  const loggedIn = isAuthenticated();
  const adminUser = isAdmin();

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <Link to={loggedIn ? (adminUser ? "/admin" : "/dashboard") : "/"} className="site-footer__brand">
          Finly
        </Link>

        {!adminUser ? (
          <nav className="site-footer__nav" aria-label="Footer navigation">
            {!loggedIn && <Link to="/">Начало</Link>}
            {!loggedIn && <Link to="/about">За Finly</Link>}
            <Link to="/contact">Контакт</Link>
          </nav>
        ) : null}

        <p className="site-footer__copy">
          &copy; {year} Finly. Всички права запазени.
        </p>
      </div>
    </footer>
  );
}

export default Footer;
