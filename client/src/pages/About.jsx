const highlights = [
  {
    title: "Транзакции",
    text: "Записвай всеки приход и разход, филтрирай по дата, тип или категория и имай пълна история на паричния си поток.",
  },
  {
    title: "Портфейли",
    text: "Управлявай няколко портфейла едновременно – в брой, банкова сметка или друг вид. Виждаш наличността на всеки поотделно и общия баланс.",
  },
  {
    title: "Бюджети",
    text: "Задавай лимити за харчене по категории и следи в реално време колко от бюджета вече е използван.",
  },
  {
    title: "Финансови цели",
    text: "Задавай спестовни цели с целева сума и краен срок. Приложението изчислява прогреса и колко остава до края.",
  },
  {
    title: "Категории",
    text: "Организирай транзакциите си по собствени категории, за да виждаш точно за какво отиват парите ти.",
  },
  {
    title: "Дашборд с анализи",
    text: "Обобщена визуална картина – графики за приходи и разходи, разпределение по категории и обща наличност по портфейли.",
  },
];

const values = [
  "Ясна и подредена финансова картина",
  "По-малко импулсивни финансови решения",
  "По-ефективно използване на наличните средства",
  "Персонализирани съвети, базирани на реалните ти навици",
];

function About() {
  return (
    <div className="about-page">
      <section className="about-hero">
        <p className="section-heading__eyebrow">За Finly</p>
        <h1 className="about-hero__title">
          Уеб приложение за пълен контрол върху{" "}
          <span className="about-hero__gradient">личните ти финанси</span>
        </h1>
        <p>
          Finly е изградено, за да ти даде ясна картина на паричния поток – от
          всекидневните транзакции и портфейли до бюджети, спестовни цели и
          интелигентен финансов анализ на едно място.
        </p>
        <div className="about-hero__chips">
          <span className="about-hero__chip">💳 Транзакции</span>
          <span className="about-hero__chip">👛 Портфейли</span>
          <span className="about-hero__chip">📊 Бюджети</span>
          <span className="about-hero__chip">🎯 Цели</span>
          <span className="about-hero__chip">🤖 Сценарии</span>
        </div>
      </section>

      <section className="about-section about-section--grid">
        <div className="section-heading">
          <p className="section-heading__eyebrow">Функционалности</p>
          <h2>Всичко важно е събрано на едно място</h2>
        </div>

        <div className="feature-grid">
          {highlights.map((item) => (
            <article className="feature-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-section about-insight">
        <div>
          <p className="section-heading__eyebrow">Сценарии</p>
          <h2>Персонализиран алгоритъм, базиран на реалните ти данни</h2>
          <p>
            Разделът Сценарии анализира историята на транзакциите ти, активните
            бюджети и наличностите по портфейли, за да ти даде конкретни и
            приложими препоръки – без общи фрази, само реални числа от твоя профил.
          </p>
        </div>

        <div className="about-insight__panel">
          <h3>Какво получаваш</h3>
          <ul>
            <li>Изчислен среден месечен разход по категории</li>
            <li>Предложения как да разпределиш парите си по-ефективно</li>
            <li>Сигнали за категории, в които харченето е надхвърлило нормата</li>
            <li>Насоки за спестяване съобразени с текущия ти баланс</li>
          </ul>
        </div>
      </section>

      <section className="about-section about-mission">
        <div className="about-card about-card--wide about-card--accent">
          <p className="section-heading__eyebrow">Мисия и фокус</p>
          <h2>Да направим личните финанси ясни, спокойни и управляеми</h2>
          <p>
            Finly е разработено с цел да даде на всеки потребител прост, интуитивен
            и визуално подреден инструмент, с който да разбира по-добре парите си,
            да поставя финансови цели и да ги постига стъпка по стъпка.
          </p>

          <div className="about-values-wrap">
            <ul className="about-values">
              {values.map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="about-cta">
        <div>
          <p className="section-heading__eyebrow">Готов ли си да започнеш?</p>
          <h2>Създай профил и поеми контрол над личните си финанси</h2>
        </div>

        <a href="/register" className="button button--primary button--large">
          Регистрирай се
        </a>
      </section>
    </div>
  );
}

export default About;