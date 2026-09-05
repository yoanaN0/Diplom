import { useEffect, useState } from "react";

import { fetchSessionUser, getSessionUser } from "../services/authStorage";
import { saveProfile as saveProfileRequest } from "../services/profileApi";

function Settings() {
	const [profile, setProfile] = useState(() => {
		const localUser = getSessionUser();
		return {
			firstName: localUser?.firstName || "",
			lastName: localUser?.lastName || "",
			email: localUser?.email || "",
		};
	});
	const [originalProfile, setOriginalProfile] = useState(() => {
		const localUser = getSessionUser();
		return {
			firstName: localUser?.firstName || "",
			lastName: localUser?.lastName || "",
		};
	});
	const [profileError, setProfileError] = useState("");
	const [profileSaved, setProfileSaved] = useState(false);

	useEffect(() => {
		const loadFreshUser = async () => {
			const result = await fetchSessionUser();
			if (!result.ok || !result.user) {
				setProfileError("Не успяхме да заредим профила от сървъра.");
				return;
			}

			const nextProfile = {
				firstName: result.user.firstName || "",
				lastName: result.user.lastName || "",
				email: result.user.email || "",
			};

			setProfileError("");
			setProfile(nextProfile);
			setOriginalProfile({
				firstName: result.user.firstName || "",
				lastName: result.user.lastName || "",
			});
		};

		void loadFreshUser();
	}, []);

	const updateProfileField = (key, value) => {
		setProfileSaved(false);
		setProfile((current) => ({ ...current, [key]: value }));
	};

	const saveProfile = async (event) => {
		event.preventDefault();
		try {
			await saveProfileRequest(profile);
			await fetchSessionUser();
			const nextOriginal = {
				firstName: profile.firstName,
				lastName: profile.lastName,
			};
			setOriginalProfile(nextOriginal);
			setProfileError("");
			setProfileSaved(true);
		} catch {
			setProfileSaved(false);
			setProfileError("Не успяхме да запазим профила.");
		}
	};

	const fullName = `${profile.firstName} ${profile.lastName}`.trim() || "Потребител";
	const initials =
		`${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.trim().toUpperCase() || "U";
	const hasProfileChanges =
		profile.firstName !== originalProfile.firstName || profile.lastName !== originalProfile.lastName;

	return (
		<div className="finance-page settings-page">
			<section className="finance-header profile-header">
				<div>
					<h1>Профил</h1>
					<p>Лични данни на акаунта.</p>
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
				</article>

				<form className="surface-card" onSubmit={saveProfile}>
					<div className="surface-card__head">
						<h2>Лични данни</h2>
					</div>
					{profileError ? <p className="muted">{profileError}</p> : null}
					{profileSaved ? (
						<p className="profile-note profile-note--success">
							Промените в профила са запазени успешно.
						</p>
					) : null}

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
							<input type="email" value={profile.email} readOnly />
						</label>
					</div>

					{hasProfileChanges ? (
						<button type="submit" className="button button--primary">
							Запази промените
						</button>
					) : null}
				</form>
			</section>
		</div>
	);
}

export default Settings;
