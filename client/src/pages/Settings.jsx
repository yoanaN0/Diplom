import { useEffect, useState } from "react";

import { fetchSessionUser, getSessionUser } from "../services/authStorage";
import { saveProfile as saveProfileRequest } from "../services/profileApi";
import { changePassword } from "../services/passwordApi";

function Settings() {
	const [profile, setProfile] = useState(() => {
		const localUser = getSessionUser();
		return {
			firstName: localUser?.firstName || "",
			lastName: localUser?.lastName || "",
			email: localUser?.email || "",
			phone: localUser?.phone || "",
			birthDate: localUser?.birthDate || "",
			city: localUser?.city || "",
			country: localUser?.country || "България",
		};
	});
	const [profileError, setProfileError] = useState("");
	const [profileSaved, setProfileSaved] = useState(false);
	const [phoneError, setPhoneError] = useState("");
	const [phoneTouched, setPhoneTouched] = useState(false);

	const [password, setPassword] = useState({ current: "", next: "", confirm: "" });
	const [passwordError, setPasswordError] = useState("");
	const [passwordSaved, setPasswordSaved] = useState(false);
	const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);

	useEffect(() => {
		const loadFreshUser = async () => {
			const result = await fetchSessionUser();
			if (!result.ok || !result.user) {
				setProfileError("Не успяхме да заредим профила от сървъра.");
				return;
			}

			setProfileError("");
			setProfile((current) => ({
				...current,
				firstName: result.user.firstName || "",
				lastName: result.user.lastName || "",
				email: result.user.email || "",
			}));
		};

		void loadFreshUser();
	}, []);

	const validateBulgarianPhone = (value) => {
		const trimmed = String(value || "").trim();
		if (!trimmed) {
			return "";
		}

		const normalized = trimmed.replace(/[\s()-]/g, "");
		const localPattern = /^0[2-9]\d{8}$/;
		const intlPattern = /^\+359[2-9]\d{8}$/;

		if (!localPattern.test(normalized) && !intlPattern.test(normalized)) {
			return "Невалиден телефон. Използвай формат 08XXXXXXXX или +3598XXXXXXXX.";
		}

		return "";
	};

	const updateProfileField = (key, value) => {
		setProfileSaved(false);
		setProfile((current) => ({ ...current, [key]: value }));

		if (key === "phone" && phoneTouched) {
			setPhoneError(validateBulgarianPhone(value));
		}
	};

	const saveProfile = async (event) => {
		event.preventDefault();
		const nextPhoneError = validateBulgarianPhone(profile.phone);
		setPhoneTouched(true);
		setPhoneError(nextPhoneError);

		if (nextPhoneError) {
			setProfileSaved(false);
			return;
		}

		try {
			await saveProfileRequest(profile);
			await fetchSessionUser();
			setProfileError("");
			setProfileSaved(true);
		} catch {
			setProfileSaved(false);
			setProfileError("Не успяхме да запазим профила.");
		}
	};

	const savePassword = async (event) => {
		event.preventDefault();
		setPasswordError("");
		setPasswordSaved(false);

		if (!password.current || !password.next || !password.confirm) {
			setPasswordError("Попълни всички полета за парола.");
			return;
		}

		if (password.next.length < 8) {
			setPasswordError("Новата парола трябва да е поне 8 символа.");
			return;
		}

		if (password.next !== password.confirm) {
			setPasswordError("Новата парола и потвърждението не съвпадат.");
			return;
		}

		try {
			await changePassword({
				currentPassword: password.current,
				nextPassword: password.next,
			});
			setPassword({ current: "", next: "", confirm: "" });
			setPasswordSaved(true);
			setIsPasswordFormOpen(false);
		} catch {
			setPasswordSaved(false);
			setPasswordError("Не успяхме да обновим паролата.");
		}
	};

	const togglePasswordForm = () => {
		setPasswordError("");
		setPasswordSaved(false);
		setPassword((current) =>
			isPasswordFormOpen ? { current: "", next: "", confirm: "" } : current,
		);
		setIsPasswordFormOpen((current) => !current);
	};

	const fullName = `${profile.firstName} ${profile.lastName}`.trim() || "Потребител";
	const initials =
		`${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.trim().toUpperCase() || "U";
	const profileFields = [
		profile.firstName,
		profile.lastName,
		profile.email,
		profile.phone,
		profile.birthDate,
		profile.city,
		profile.country,
	];
	const filledFields = profileFields.filter((field) => String(field || "").trim()).length;
	const completionPercent = Math.round((filledFields / profileFields.length) * 100);

	return (
		<div className="finance-page settings-page">
			<section className="finance-header profile-header">
				<div>
					<h1>Профил</h1>
					<p>Лични данни и сигурност на акаунта.</p>
				</div>
				<div className="profile-header__meta">
					<span className="pill pill--ok">{completionPercent}% попълнен профил</span>
					<span className="muted">{filledFields} от {profileFields.length} полета попълнени</span>
				</div>
			</section>

			<section className="settings-layout profile-layout">
				<article className="surface-card profile-summary-card">
					<div className="profile-summary-head">
						<div className="profile-avatar" aria-hidden="true">
							<span className="profile-avatar__initials">{initials}</span>
						</div>
						<div>
							<h2>{fullName}</h2>
							<p className="muted">{profile.email || "Имейл не е зададен"}</p>
						</div>
					</div>

					<div className="profile-summary-list">
						<div>
							<span>Телефон</span>
							<strong>{profile.phone || "Не е добавен"}</strong>
						</div>
						<div>
							<span>Град</span>
							<strong>{profile.city || "Не е добавен"}</strong>
						</div>
						<div>
							<span>Държава</span>
							<strong>{profile.country || "Не е добавена"}</strong>
						</div>
					</div>
				</article>

				<form className="surface-card" onSubmit={saveProfile}>
					<div className="surface-card__head">
						<h2>Лични данни</h2>
					</div>
					{profileError ? <p className="muted">{profileError}</p> : null}
					{profileSaved ? <p className="profile-note profile-note--success">Промените в профила са запазени успешно.</p> : null}

					<div className="filter-grid">
						<label>
							<span>Име</span>
							<input
								type="text"
								value={profile.firstName}
								onChange={(event) => updateProfileField("firstName", event.target.value)}
							/>
						</label>
						<label>
							<span>Фамилия</span>
							<input
								type="text"
								value={profile.lastName}
								onChange={(event) => updateProfileField("lastName", event.target.value)}
							/>
						</label>
						<label>
							<span>Имейл</span>
							<input
								type="email"
								value={profile.email}
								onChange={(event) => updateProfileField("email", event.target.value)}
							/>
						</label>
						<label>
							<span>Телефон</span>
							<input
								type="tel"
								value={profile.phone}
								placeholder="0888123456 или +359888123456"
								onChange={(event) => updateProfileField("phone", event.target.value)}
								onBlur={() => {
									setPhoneTouched(true);
									setPhoneError(validateBulgarianPhone(profile.phone));
								}}
							/>
							{phoneError ? <span className="profile-field-error">{phoneError}</span> : null}
						</label>
						<label>
							<span>Дата на раждане</span>
							<input
								type="date"
								value={profile.birthDate}
								onChange={(event) => updateProfileField("birthDate", event.target.value)}
							/>
						</label>
						<label>
							<span>Град</span>
							<input
								type="text"
								value={profile.city}
								onChange={(event) => updateProfileField("city", event.target.value)}
							/>
						</label>
						<label>
							<span>Държава</span>
							<input
								type="text"
								value={profile.country}
								onChange={(event) => updateProfileField("country", event.target.value)}
							/>
						</label>
					</div>

					<button type="submit" className="button button--primary">
						Запази профил
					</button>
				</form>

				<form className="surface-card profile-security-card" onSubmit={savePassword}>
					<div className="surface-card__head">
						<h2>Сигурност</h2>
					</div>
					<div className="profile-security-panel">
						<button
							type="button"
							className={
								isPasswordFormOpen
									? "profile-password-toggle profile-password-toggle--open"
									: "profile-password-toggle"
							}
							onClick={togglePasswordForm}
						>
							<span>{isPasswordFormOpen ? "Скрий смяната на парола" : "Смяна на парола"}</span>
							<span className="profile-password-toggle__chevron" aria-hidden="true">
								{isPasswordFormOpen ? "▴" : "▾"}
							</span>
						</button>
					</div>

					{passwordSaved ? <p className="profile-note profile-note--success">Паролата е обновена успешно.</p> : null}

					{isPasswordFormOpen ? (
						<div className="profile-password-fields">
							{passwordError ? <p className="profile-note profile-note--danger">{passwordError}</p> : null}
							<div className="filter-grid">
								<label>
									<span>Текуща парола</span>
									<input
										type="password"
										value={password.current}
										onChange={(event) =>
											setPassword((current) => ({ ...current, current: event.target.value }))
										}
									/>
								</label>
								<label>
									<span>Нова парола</span>
									<input
										type="password"
										value={password.next}
										onChange={(event) =>
											setPassword((current) => ({ ...current, next: event.target.value }))
										}
									/>
								</label>
								<label>
									<span>Потвърди новата парола</span>
									<input
										type="password"
										value={password.confirm}
										onChange={(event) =>
											setPassword((current) => ({ ...current, confirm: event.target.value }))
										}
									/>
								</label>
							</div>

							<button type="submit" className="button button--primary">
								Обнови парола
							</button>
						</div>
					) : null}
				</form>
			</section>
		</div>
	);
}

export default Settings;
