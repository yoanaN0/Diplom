import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";

import { loginUser } from "../services/authStorage";

function Login() {
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const payload = {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    };

    const messageNode = event.currentTarget.querySelector("[data-auth-feedback]");
    if (messageNode) {
      messageNode.textContent = "";
      messageNode.className = "auth-card__feedback";
    }

    const result = await loginUser(payload);
    if (!result.ok) {
      if (messageNode) {
        messageNode.textContent = result.error;
        messageNode.className = "auth-card__feedback auth-card__feedback--error";
      }
      return;
    }

    if (messageNode) {
      messageNode.textContent = "Успешен вход. Пренасочване...";
      messageNode.className = "auth-card__feedback auth-card__feedback--success";
    }

    navigate("/dashboard");
  };

  return (
    <div className="auth-page">
      <section className="auth-hero">
        <p className="section-heading__eyebrow">Вход</p>
        <h1 className="auth-hero__title">Влез в профила си</h1>
        <p>
          Достъпвай dashboard-а, проследявай финансите си и виж препоръките на
          Finly за по-умно управление на парите.
        </p>
      </section>

      <section className="auth-layout">
        <form className="auth-card" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Имейл</span>
            <input type="email" name="email" placeholder="name@example.com" />
          </label>

          <label className="auth-field">
            <span>Парола</span>
            <input type="password" name="password" placeholder="Въведи парола" />
          </label>

          <div className="auth-card__footer">
            <label className="auth-check">
              <input type="checkbox" name="remember" />
              <span>Запомни ме</span>
            </label>

            <a href="#" onClick={(event) => event.preventDefault()}>
              Забравена парола?
            </a>
          </div>

          <p className="auth-card__feedback" data-auth-feedback />

          <button type="submit" className="button button--primary">
            Вход
          </button>

          <p className="auth-card__note">
            Нямаш профил? <Link to="/register">Регистрирай се</Link>
          </p>
        </form>

        <aside className="auth-side">
          <div className="auth-side__card">
            <h2>Какво получаваш</h2>
            <ul>
              <li>Преглед на приходи, разходи и наличности</li>
              <li>Бюджети и цели за спестяване</li>
              <li>Финансови предложения според навиците ти</li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}

export default Login;