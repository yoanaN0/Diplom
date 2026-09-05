import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  requestPasswordResetCode,
  resetPassword,
} from "../services/passwordResetApi";

function ForgotPassword() {
  const [step, setStep] = useState("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [feedback, setFeedback] = useState("");
  const [feedbackType, setFeedbackType] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const canRequest = useMemo(() => {
    return email.trim() !== "" && !isSubmitting;
  }, [email, isSubmitting]);

  const canReset = useMemo(() => {
    return (
      email.trim() !== ""
      && code.trim().length === 6
      && newPassword.length >= 8
      && confirmPassword.length >= 8
      && !isSubmitting
    );
  }, [email, code, newPassword, confirmPassword, isSubmitting]);

  const handleRequestCode = async (event) => {
    event.preventDefault();

    if (!email.trim()) {
      setFeedback("Въведи имейл адрес.");
      setFeedbackType("error");
      return;
    }

    setIsSubmitting(true);
    setFeedback("");
    setFeedbackType("");

    try {
      const message = await requestPasswordResetCode(email.trim());
      setFeedback(
        message || "Ако има профил с този имейл, ще получиш код за възстановяване.",
      );
      setFeedbackType("success");
      setStep("reset");
    } catch (error) {
      setFeedback(error.message || "Възникна грешка. Опитай отново.");
      setFeedbackType("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();

    if (code.trim().length !== 6) {
      setFeedback("Кодът трябва да съдържа точно 6 цифри.");
      setFeedbackType("error");
      return;
    }

    if (newPassword.length < 8) {
      setFeedback("Паролата трябва да е поне 8 символа.");
      setFeedbackType("error");
      return;
    }

    if (newPassword !== confirmPassword) {
      setFeedback("Паролите не съвпадат.");
      setFeedbackType("error");
      return;
    }

    setIsSubmitting(true);
    setFeedback("");
    setFeedbackType("");

    try {
      const result = await resetPassword({
        email: email.trim(),
        code: code.trim(),
        newPassword,
        confirmPassword,
      });

      setFeedback(
        result.message || "Паролата е променена успешно. Вече можеш да влезеш в профила си.",
      );
      setFeedbackType("success");
      setIsDone(true);
    } catch (error) {
      setFeedback(error.message || "Възникна грешка. Опитай отново.");
      setFeedbackType("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-hero">
        <p className="section-heading__eyebrow">Възстановяване</p>
        <h1 className="auth-hero__title">Забравена парола</h1>
        <p>
          Въведи имейла си, за да получиш код за възстановяване, и задай нова
          парола за профила си.
        </p>
      </section>

      <section className="auth-layout">
        <form
          className="auth-card"
          onSubmit={step === "request" ? handleRequestCode : handleResetPassword}
        >
          <label className="auth-field">
            <span>Имейл</span>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              disabled={isDone}
            />
          </label>

          {step === "reset" && (
            <>
              <label className="auth-field">
                <span>Код</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  name="code"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  disabled={isDone}
                />
              </label>

              <label className="auth-field">
                <span>Нова парола</span>
                <input
                  type="password"
                  name="newPassword"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Въведи нова парола"
                  disabled={isDone}
                />
              </label>

              <label className="auth-field">
                <span>Повтори паролата</span>
                <input
                  type="password"
                  name="confirmPassword"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Повтори новата парола"
                  disabled={isDone}
                />
              </label>
            </>
          )}

          <p className={`auth-card__feedback ${feedbackType ? `auth-card__feedback--${feedbackType}` : ""}`}>
            {feedback}
          </p>

          {!isDone && step === "request" && (
            <button type="submit" className="button button--primary" disabled={!canRequest}>
              {isSubmitting ? "Изпращане..." : "Изпрати код"}
            </button>
          )}

          {!isDone && step === "reset" && (
            <button type="submit" className="button button--primary" disabled={!canReset}>
              {isSubmitting ? "Запазване..." : "Смени паролата"}
            </button>
          )}

          {isDone && (
            <Link to="/login" className="button button--primary">
              Към вход
            </Link>
          )}

          {!isDone && step === "reset" && (
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                setStep("request");
                setCode("");
                setNewPassword("");
                setConfirmPassword("");
                setFeedback("");
                setFeedbackType("");
              }}
            >
              Изпрати нов код
            </button>
          )}

          <p className="auth-card__note">
            Назад към <Link to="/login">Вход</Link>
          </p>
        </form>

        <aside className="auth-side">
          <div className="auth-side__card">
            <h2>Сигурност</h2>
            <ul>
              <li>Кодът е валиден 10 минути</li>
              <li>Кодът е еднократен</li>
              <li>Ще можеш да влезеш с новата парола веднага след смяната</li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}

export default ForgotPassword;
