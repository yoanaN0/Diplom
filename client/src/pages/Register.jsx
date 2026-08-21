import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";

import { registerUser } from "../services/authStorage";

function Register() {
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const payload = {
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
      terms: formData.get("terms") === "on",
    };

    const messageNode = event.currentTarget.querySelector("[data-auth-feedback]");
    if (messageNode) {
      messageNode.textContent = "";
      messageNode.className = "auth-card__feedback";
    }

    if (!payload.terms) {
      if (messageNode) {
        messageNode.textContent = "Трябва да приемеш условията за ползване.";
        messageNode.className = "auth-card__feedback auth-card__feedback--error";
      }
      return;
    }

    if (payload.password.length < 8) {
      if (messageNode) {
        messageNode.textContent = "Паролата трябва да е поне 8 символа.";
        messageNode.className = "auth-card__feedback auth-card__feedback--error";
      }
      return;
    }

    if (payload.password !== payload.confirmPassword) {
      if (messageNode) {
        messageNode.textContent = "Паролите не съвпадат.";
        messageNode.className = "auth-card__feedback auth-card__feedback--error";
      }
      return;
    }

    const result = await registerUser(payload);
    if (!result.ok) {
      if (messageNode) {
        messageNode.textContent = result.error;
        messageNode.className = "auth-card__feedback auth-card__feedback--error";
      }
      return;
    }

    if (messageNode) {
      messageNode.textContent = "Профилът е създаден успешно. Пренасочване...";
      messageNode.className = "auth-card__feedback auth-card__feedback--success";
    }

    navigate("/dashboard");
  };

  return (
    <div className="auth-page">
      <section className="auth-hero">
        <p className="section-heading__eyebrow">Регистрация</p>
        <h1 className="auth-hero__title">Създай своя профил</h1>
        <p>
          Започни да следиш доходи, разходи и цели в Finly само с няколко
          стъпки. Регистрацията е бърза и без излишни полета.
        </p>
      </section>

      <section className="auth-layout">
        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="auth-field-grid">
            <label className="auth-field">
              <span>Име</span>
              <input type="text" name="firstName" placeholder="Иван" />
            </label>

            <label className="auth-field">
              <span>Фамилия</span>
              <input type="text" name="lastName" placeholder="Петров" />
            </label>
          </div>

          <label className="auth-field">
            <span>Имейл</span>
            <input type="email" name="email" placeholder="name@example.com" />
          </label>

          <label className="auth-field">
            <span>Парола</span>
            <input type="password" name="password" placeholder="Създай парола" />
          </label>

          <label className="auth-field">
            <span>Потвърди паролата</span>
            <input
              type="password"
              name="confirmPassword"
              placeholder="Повтори паролата"
            />
          </label>

          <p className="auth-card__hint">
            Използвай поне 8 символа, комбинирай букви и цифри и не споделяй паролата си.
          </p>

          <label className="auth-check auth-check--stacked">
            <input type="checkbox" name="terms" />
            <span>
              Съгласявам се с условията за ползване и политиката за поверителност.
            </span>
          </label>

          <p className="auth-card__feedback" data-auth-feedback />

          <button type="submit" className="button button--primary">
            Регистрация
          </button>

          <p className="auth-card__note">
            Вече имаш профил? <Link to="/login">Вход</Link>
          </p>
        </form>

        <aside className="auth-side">
          <div className="auth-side__card">
            <h2>Какво ще получиш</h2>
            <ul>
              <li>Бърз старт с готов dashboard и лични категории</li>
              <li>Инструменти за бюджети, цели и портфейли</li>
              <li>Ясни отчети за доходи и разходи на едно място</li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}

export default Register;