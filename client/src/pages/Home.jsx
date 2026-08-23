import Hero from "../components/Hero";

const features = [
  {
    title: "Ясен преглед",
    text: "Виж всичко важно на едно място без излишен шум и объркващи екрани.",
  },
  {
    title: "Прегледни бюджети",
    text: "Следи лимити, разходи и спестявания с удобна визуална подредба.",
  },
  {
    title: "Финансови цели",
    text: "Планирай големи покупки и спестявания с ясен напредък по пътя.",
  },
];

const steps = [
  {
    number: "01",
    title: "Регистрирай се",
    text: "Създай профил и подреди основните си финансови категории за минути.",
  },
  {
    number: "02",
    title: "Добави движение",
    text: "Записвай приходи, разходи и сметки, за да виждаш реалната картина.",
  },
  {
    number: "03",
    title: "Следи прогреса",
    text: "Наблюдавай бюджетите и целите си в подреден интерфейс всеки ден.",
  },
];

function Home() {
  return (
    <div className="home-page">
      <Hero />

      <section className="home-section home-section--soft">
        <div className="section-heading">
          <p className="section-heading__eyebrow">Защо Finly</p>
          <h2>Подредено финансово изживяване за ежедневна употреба</h2>
          <p>
            Проектиран е да е лек за ползване, ясен на поглед и достатъчно
            силен, за да ти даде контрол върху парите без сложност.
          </p>
        </div>

        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section" id="how-it-works">
        <div className="section-heading">
          <p className="section-heading__eyebrow">Как работи</p>
          <h2>Три ясни стъпки до по-добър контрол</h2>
        </div>

        <div className="steps-grid">
          {steps.map((step) => (
            <article className="step-card" key={step.number}>
              <span className="step-card__number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section home-section--cta">
        <div>
          <p className="section-heading__eyebrow">Готов ли си?</p>
          <h2>Започни с ясна картина за личните си финанси още днес</h2>
          <p>
            Създай профил и виж защо една добре подредена начална страница може
            да направи продукта по-приятен и полезен.
          </p>
        </div>

        <a href="/register" className="button button--primary button--large home-section__cta">
          Създай акаунт
        </a>
      </section>
    </div>
  );
}

export default Home;