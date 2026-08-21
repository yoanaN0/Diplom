import { useState } from "react";

import { sendContactMessage } from "../services/contactApi";

function Contact() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const submitForm = async (event) => {
    event.preventDefault();
    setStatus("");
    setError("");

    try {
      await sendContactMessage(form);
      setStatus("Съобщението е изпратено успешно.");
      setForm({ name: "", email: "", message: "" });
    } catch {
      setError("Неуспешно изпращане на съобщението.");
    }
  };

  return (
    <div className="contact-page">
      <section className="contact-hero">
        <h1 className="contact-hero__title">Пиши ни за въпроси, идеи или обратна връзка</h1>
        <p>
          Ако искаш да ни изпратиш имейл, използвай формата по-долу. Ще ти
          отговорим възможно най-скоро.
        </p>

        <div className="contact-hero__metrics" aria-label="Предимства за връзка">
          <article className="contact-metric">
            <strong>до 24ч</strong>
            <span>средно време за отговор</span>
          </article>
          <article className="contact-metric">
            <strong>Пон-Пет</strong>
            <span>09:00 - 18:00</span>
          </article>
        </div>
      </section>

      <section className="contact-layout">
        <form className="contact-form" onSubmit={submitForm}>
          <div className="contact-form__head">
            <h2>Изпрати съобщение</h2>
            <p>Опиши накратко темата и ще се свържем с теб възможно най-скоро.</p>
          </div>

          {status ? <p className="profile-note profile-note--success">{status}</p> : null}
          {error ? <p className="muted">{error}</p> : null}

          <div className="contact-form__row">
            <label className="contact-field">
              <span>Име</span>
              <input
                type="text"
                name="name"
                placeholder="Твоето име"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>

            <label className="contact-field">
              <span>Имейл</span>
              <input
                type="email"
                name="email"
                placeholder="name@example.com"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
          </div>

          <label className="contact-field">
            <span>Съобщение</span>
            <textarea
              name="message"
              rows="6"
              placeholder="Напиши ни какво те интересува или как можем да помогнем."
              value={form.message}
              onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
            />
          </label>

          <div className="contact-form__footer">
            <p>Обикновено отговаряме до 24 часа.</p>

            <button type="submit" className="button button--primary">
              Изпрати съобщение
            </button>
          </div>
        </form>

        <aside className="contact-aside">
          <div className="contact-aside__card">
            <h2>Директен имейл</h2>
            <a>support@finly.bg</a>
          </div>

          <div className="contact-aside__card">
            <h2>Работно време</h2>
            <p>Понеделник - Петък</p>
            <p>09:00 - 18:00</p>
          </div>
        </aside>
      </section>
    </div>
  );
}

export default Contact;