import { Link } from "react-router-dom";

function Hero() {
  return (
    <section className="hero">
      <div className="hero__copy">
        <p className="hero__eyebrow">Finly • лични финанси</p>

        <h1 className="hero__title">
          Парите ти в
          <span className="hero__accent"> едно ясно пространство.</span>
        </h1>

        <p className="hero__lead">
          Проследявай приходи, разходи, бюджети и цели в интерфейс, който е
          прост, подреден и приятен за ежедневна употреба.
        </p>

        <div className="hero__actions">
          <Link to="/register" className="button button--primary button--large">
            Започни безплатно
          </Link>
          <a href="#how-it-works" className="button button--ghost button--large">
            Виж как работи
          </a>
        </div>
      </div>

      <div className="hero__panel" aria-label="Financial snapshot">
        <div className="hero__card hero__card--summary">
          <span className="hero__card-label">Месечен баланс</span>
          <strong className="hero__balance">12 480 €</strong>
          <span className="hero__trend">+18% спрямо миналия месец</span>
        </div>

        <div className="hero__grid">
          <article className="stat-card">
            <span className="stat-card__label">Приходи</span>
            <strong className="stat-card__value">8 240 €</strong>
          </article>

          <article className="stat-card">
            <span className="stat-card__label">Разходи</span>
            <strong className="stat-card__value">3 760 €</strong>
          </article>

          <article className="stat-card">
            <span className="stat-card__label">Спестени</span>
            <strong className="stat-card__value">1 920 €</strong>
          </article>
        </div>

        <div className="hero__timeline">
          <div>
            <span>Бюджет за храна</span>
            <strong>72% използван</strong>
          </div>
          <div>
            <span>Следваща цел</span>
            <strong>Пътуване през септември</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;