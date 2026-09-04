import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import {
  getPendingVerificationEmail,
  resendVerificationCode,
  verifyEmailCode,
} from "../services/authStorage";

function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(() => {
    const fromState = String(location.state?.email || "").trim();
    return fromState || getPendingVerificationEmail();
  });
  const [code, setCode] = useState("");
  const [feedback, setFeedback] = useState(() => String(location.state?.initialError || ""));
  const [feedbackType, setFeedbackType] = useState(() => (
    location.state?.emailDeliveryFailed ? "error" : ""
  ));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const canSubmit = useMemo(() => {
    return email.trim() !== "" && code.trim().length >= 6 && !isSubmitting;
  }, [email, code, isSubmitting]);

  const handleVerify = async (event) => {
    event.preventDefault();

    if (!email.trim()) {
      setFeedback("Въведи имейл адрес.");
      setFeedbackType("error");
      return;
    }

    if (code.trim().length < 6) {
      setFeedback("Кодът трябва да е 6 цифри.");
      setFeedbackType("error");
      return;
    }

    setIsSubmitting(true);
    setFeedback("");
    setFeedbackType("");

    const result = await verifyEmailCode({
      email: email.trim(),
      code: code.trim(),
    });

    setIsSubmitting(false);

    if (!result.ok) {
      setFeedback(result.error || "Неуспешна верификация. Опитай отново.");
      setFeedbackType("error");
      return;
    }

    setFeedback("Имейлът е потвърден успешно. Пренасочване...");
    setFeedbackType("success");
    navigate("/dashboard");
  };

  const handleResend = async () => {
    if (!email.trim()) {
      setFeedback("Въведи имейла си, за да изпратим нов код.");
      setFeedbackType("error");
      return;
    }

    setIsResending(true);
    setFeedback("");
    setFeedbackType("");

    const result = await resendVerificationCode({ email: email.trim() });

    setIsResending(false);

    if (!result.ok) {
      setFeedback(result.error || "Неуспешно изпращане на нов код.");
      setFeedbackType("error");
      return;
    }

    setFeedback("Изпратихме нов код на твоя имейл.");
    setFeedbackType("success");
  };

  return (
    <div className="auth-page">
      <section className="auth-hero">
        <p className="section-heading__eyebrow">Потвърждение</p>
        <h1 className="auth-hero__title">Потвърди имейла си</h1>
        <p>
          Изпратихме код за потвърждение. Въведи кода, за да активираш
          профила си и да продължиш към приложението.
        </p>
      </section>

      <section className="auth-layout">
        <form className="auth-card" onSubmit={handleVerify}>
          <label className="auth-field">
            <span>Имейл</span>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
          </label>

          <label className="auth-field">
            <span>Код за потвърждение</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              name="code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              placeholder="123456"
            />
          </label>

          <p className="auth-card__hint">
            Кодът е валиден 10 минути. Ако не виждаш имейл, провери и Spam папката.
          </p>

          <p className={`auth-card__feedback ${feedbackType ? `auth-card__feedback--${feedbackType}` : ""}`}>
            {feedback}
          </p>

          <button type="submit" className="button button--primary" disabled={!canSubmit}>
            {isSubmitting ? "Проверка..." : "Потвърди кода"}
          </button>

          <button
            type="button"
            className="button button--ghost"
            onClick={handleResend}
            disabled={isResending}
          >
            {isResending ? "Изпращане..." : "Изпрати нов код"}
          </button>

          <p className="auth-card__note">
            Назад към <Link to="/login">Вход</Link>
          </p>
        </form>

        <aside className="auth-side">
          <div className="auth-side__card">
            <h2>Сигурност на профила</h2>
            <ul>
              <li>Само потвърдени имейли имат достъп до приложението</li>
              <li>Кодът е еднократен и с ограничена валидност</li>
              <li>Можеш да заявиш нов код по всяко време</li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}

export default VerifyEmail;
