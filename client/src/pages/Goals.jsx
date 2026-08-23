import { useEffect, useState } from "react";

import {
	calculateGoalProgress,
	formatEur,
} from "../services/financeData";
import {
	getMinimumGoalDeadline,
	isGoalDeadlineValid,
} from "../services/goalDateValidation";
import {
	createGoal as createGoalRequest,
	deleteGoal as deleteGoalRequest,
	getGoals,
	isGoalCompleted,
	updateGoal,
} from "../services/goalsApi";
import { createTransaction } from "../services/transactionsApi";
import { getWallets, updateWallet } from "../services/walletsApi";

const initialTransferDraft = {
	mode: "add",
	toGoalId: "",
	fromGoalId: "",
	sourceId: "",
	amount: "",
	note: "",
};

function mergeFundingWallets(existingFundingWallets = [], walletId, amount) {
	const totals = new Map();

	for (const entry of Array.isArray(existingFundingWallets) ? existingFundingWallets : []) {
		const walletKey = Number(entry?.walletId ?? entry?.wallet_id ?? 0);
		const walletAmount = Number(entry?.amount ?? entry?.value ?? 0);
		if (!walletKey || !Number.isFinite(walletAmount) || walletAmount <= 0) {
			continue;
		}
		totals.set(walletKey, (totals.get(walletKey) ?? 0) + walletAmount);
	}

	const sourceWalletId = Number(walletId);
	const sourceAmount = Number(amount || 0);
	if (sourceWalletId > 0 && Number.isFinite(sourceAmount) && sourceAmount > 0) {
		totals.set(sourceWalletId, (totals.get(sourceWalletId) ?? 0) + sourceAmount);
	}

	return [...totals.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([walletKey, walletAmount]) => ({
			walletId: walletKey,
			amount: Number(walletAmount.toFixed(2)),
		}));
}

function Goals() {
	const [goals, setGoals] = useState([]);
	const [fundingSources, setFundingSources] = useState([]);
	const [transferDraft, setTransferDraft] = useState(initialTransferDraft);
	const [transferError, setTransferError] = useState("");
	const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
	const [goalDeleteModal, setGoalDeleteModal] = useState({
		isOpen: false,
		goalId: null,
		goalTitle: "",
		mode: "active",
	});
	const [newGoal, setNewGoal] = useState({ title: "", target: "", deadline: "" });
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const mapWalletsToSources = (walletItems) =>
		walletItems.map((wallet) => ({
			id: wallet.id,
			name: wallet.walletType === "bank" ? `${wallet.bank} (${wallet.account})` : wallet.name,
			balance: wallet.balance,
			walletType: wallet.walletType,
		}));

	const refreshWalletSources = async () => {
		const walletItems = await getWallets();
		setFundingSources(mapWalletsToSources(walletItems));
		return walletItems;
	};

	const refreshGoals = async () => {
		const nextGoals = await getGoals();
		setGoals(nextGoals);
		return nextGoals;
	};

	const refreshGoalAndWalletState = async () => {
		const [nextGoals, walletItems] = await Promise.all([getGoals(), getWallets()]);
		setGoals(nextGoals);
		setFundingSources(mapWalletsToSources(walletItems));
		return { nextGoals, walletItems };
	};

	useEffect(() => {
		const loadData = async () => {
			setLoading(true);
			setError("");

			try {
				const [goalItems, walletItems] = await Promise.all([getGoals(), getWallets()]);
				setGoals(goalItems);
				setFundingSources(
					walletItems.map((wallet) => ({
						id: wallet.id,
						name: wallet.walletType === "bank" ? `${wallet.bank} (${wallet.account})` : wallet.name,
						balance: wallet.balance,
						walletType: wallet.walletType,
					})),
				);
			} catch {
				setError("Неуспешно зареждане на целите и източниците.");
			} finally {
				setLoading(false);
			}
		};

		void loadData();
	}, []);

	const handleCreateGoal = (event) => {
		event.preventDefault();
		if (!newGoal.title.trim() || Number(newGoal.target) <= 0 || !newGoal.deadline) {
			setError("Дата на крайния срок е задължителна.");
			return;
		}

		if (!isGoalDeadlineValid(newGoal.deadline)) {
			setError("Крайната дата трябва да е поне 1 ден след днешния.");
			return;
		}

		void (async () => {
			try {
				await createGoalRequest({
					title: newGoal.title.trim(),
					target: Number(newGoal.target),
					deadline: newGoal.deadline,
				});
				await refreshGoalAndWalletState();
				setNewGoal({ title: "", target: "", deadline: "" });
				setError("");
			} catch {
				setError("Неуспешно създаване на цел.");
			}
		})();
	};

	const openDeleteGoalModal = (goalId) => {
		const goal = goals.find((item) => Number(item.id) === Number(goalId));
		if (!goal) {
			return;
		}

		setGoalDeleteModal({
			isOpen: true,
			goalId: goal.id,
			goalTitle: goal.title,
			mode: isGoalCompleted(goal) ? "archive" : "active",
		});
		setError("");
	};

	const closeDeleteGoalModal = () => {
		setGoalDeleteModal({
			isOpen: false,
			goalId: null,
			goalTitle: "",
			mode: "active",
		});
	};

	const archiveCompletedGoal = async (goalId) => {
		const goal = goals.find((item) => Number(item.id) === Number(goalId));
		if (!goal) {
			return;
		}

		try {
			await createTransaction({
				type: "expense",
				title: `Платени и архивирани: ${goal.title}`,
				amount: Number(goal.saved || 0),
				wallet: "Цели",
				category: "Спестяване",
				note: `Целта ${goal.title} е изпълнена и средствата са отчетени като платени.`,
				tags: ["#goal-completed", "#goal-archive"],
				receipt: "",
			});
			await deleteGoalRequest(goal.id, { skipRefund: true });
			await refreshGoalAndWalletState();
			closeDeleteGoalModal();
		} catch {
			setError("Неуспешно архивиране на изпълнената цел.");
		}
	};

	const handleDeleteGoal = async (event) => {
		event.preventDefault();
		const goalId = Number(goalDeleteModal.goalId);

		if (!goalId) {
			return;
		}

		try {
			if (goalDeleteModal.mode === "archive") {
				await archiveCompletedGoal(goalId);
				return;
			}

			await deleteGoalRequest(goalId);
			await refreshGoalAndWalletState();
			closeDeleteGoalModal();
		} catch {
			setError("Неуспешно премахване на целта.");
		}
	};

	const moveToGoal = async (id, amount, sourceId = null) => {
		const goal = goals.find((item) => Number(item.id) === Number(id));
		if (!goal) {
			return null;
		}

		const walletId = Number(sourceId ?? goal.sourceId ?? fundingSources[0]?.id ?? 0);
		const nextSaved = Math.min(Number(goal.target || 0), Number(goal.saved || 0) + Number(amount || 0));
		const nextStatus = nextSaved >= Number(goal.target || 0) ? "funded" : (goal.status || "active");
		const mergedFundingWallets = mergeFundingWallets(goal.fundingWallets ?? [], walletId, amount);

		try {
			const updated = await updateGoal({
				id,
				saved: nextSaved,
				status: nextStatus,
				amount,
				sourceId: walletId > 0 ? walletId : null,
				fundingWallets: mergedFundingWallets,
			});

			return updated;
		} catch {
			setError("Неуспешно обновяване на цел.");
			return null;
		}
	};

	const openAddModal = (goalId) => {
		setTransferError("");
		setTransferDraft({
			mode: "add",
			toGoalId: goalId,
			fromGoalId: "",
			sourceId: fundingSources[0]?.id ?? "",
			amount: "",
			note: "",
		});
		setIsTransferModalOpen(true);
	};

	const openGoalTransferModal = (goalId) => {
		const fallbackFromGoal = goals.find(
			(goal) => Number(goal.id) !== Number(goalId) && Number(goal.saved ?? 0) > 0,
		);

		setTransferError("");
		setTransferDraft({
			mode: "goal-transfer",
			toGoalId: String(goalId),
			fromGoalId: fallbackFromGoal ? String(fallbackFromGoal.id) : "",
			sourceId: "",
			amount: "",
			note: "",
		});
		setIsTransferModalOpen(true);
	};

	const closeTransferModal = () => {
		setIsTransferModalOpen(false);
		setTransferError("");
		setTransferDraft(initialTransferDraft);
	};

	const submitTransfer = async (event) => {
		event.preventDefault();

		const targetGoalId = Number(transferDraft.toGoalId) || 0;
		const sourceId = Number(transferDraft.sourceId) || 0;
		const fromGoalId = Number(transferDraft.fromGoalId) || 0;

		const selectedTargetGoal = goals.find((goal) => Number(goal.id) === targetGoalId);
		const selectedSource = fundingSources.find((source) => Number(source.id) === sourceId);
		const selectedFromGoal = goals.find((goal) => Number(goal.id) === fromGoalId);
		const amount = Number(transferDraft.amount);

		if (!selectedTargetGoal) {
			setTransferError("Избери цел, към която искаш да добавиш сума.");
			return;
		}

		if (!Number.isFinite(amount) || amount <= 0) {
			setTransferError("Въведи валидна сума за прехвърляне.");
			return;
		}

		const remaining = Math.max(0, selectedTargetGoal.target - selectedTargetGoal.saved);
		if (remaining <= 0) {
			setTransferError("Целта вече е изпълнена.");
			return;
		}

		if (amount > remaining) {
			setTransferError(`Остават само ${formatEur(remaining)} до целта.`);
			return;
		}

		if (transferDraft.mode === "goal-transfer") {
			if (!selectedFromGoal) {
				setTransferError("Избери изходна цел, от която да прехвърлиш сума.");
				return;
			}

			if (selectedFromGoal.id === selectedTargetGoal.id) {
				setTransferError("Избери различни цели за прехвърляне.");
				return;
			}

			if (amount > selectedFromGoal.saved) {
				setTransferError("В изходната цел няма достатъчно налични средства.");
				return;
			}

			try {
				await createTransaction({
					type: "expense",
					title: `Прехвърляне между цели: ${selectedFromGoal.title} -> ${selectedTargetGoal.title}`,
					amount,
					wallet: "Цели",
					category: "Спестяване",
					goalId: selectedTargetGoal.id,
					sourceGoalId: selectedFromGoal.id,
					note:
						transferDraft.note.trim() ||
						`От ${selectedFromGoal.title} към ${selectedTargetGoal.title}`,
					tags: ["#goal-transfer", "#goal-to-goal"],
					receipt: "",
				});
			} catch {
				setTransferError("Неуспешно записване на прехвърлянето в хронологията.");
				return;
			}

			const nextSourceSaved = Math.max(0, selectedFromGoal.saved - amount);
			const nextTargetSaved = Math.min(selectedTargetGoal.target, selectedTargetGoal.saved + amount);
			const nextSourceStatus = nextSourceSaved >= selectedFromGoal.target ? "funded" : selectedFromGoal.status;
			const nextTargetStatus = nextTargetSaved >= selectedTargetGoal.target ? "funded" : selectedTargetGoal.status;

			try {
				await Promise.all([
					updateGoal({
						id: selectedFromGoal.id,
						title: selectedFromGoal.title,
						target: selectedFromGoal.target,
						deadline: selectedFromGoal.deadline,
						status: nextSourceStatus,
						saved: nextSourceSaved,
					}),
					updateGoal({
						id: selectedTargetGoal.id,
						title: selectedTargetGoal.title,
						target: selectedTargetGoal.target,
						deadline: selectedTargetGoal.deadline,
						status: nextTargetStatus,
						saved: nextTargetSaved,
					}),
				]);
				await refreshGoalAndWalletState();
			} catch (error) {
				console.error("Goal transfer update failed", error);
				setTransferError("Неуспешно запаметяване на прехвърлянето между целите.");
				return;
			}
		} else {
			if (!selectedSource) {
				setTransferError("Избери източник на средства.");
				return;
			}

			if (amount > selectedSource.balance) {
				setTransferError("Нямаш достатъчна наличност в избрания източник.");
				return;
			}

			try {
				await createTransaction({
					type: "transfer",
					title: `Трансфер към цел: ${selectedTargetGoal.title}`,
					amount,
					wallet: selectedSource.name,
					walletId: selectedSource.id,
					goalId: selectedTargetGoal.id,
					category: "Спестяване",
					note: transferDraft.note.trim() || `Добавяне към цел ${selectedTargetGoal.title}`,
					tags: ["#goal-transfer", "#goal-funding"],
					receipt: "",
				});
			} catch {
				setTransferError("Неуспешно записване на добавянето в хронологията.");
				return;
			}

			try {
				const updatedTargetGoal = await moveToGoal(selectedTargetGoal.id, amount, selectedSource.id);
				if (updatedTargetGoal) {
					await refreshGoalAndWalletState();
				}
				await updateWallet({
					id: selectedSource.id,
					balance: Math.max(0, selectedSource.balance - amount),
				});
				await refreshGoalAndWalletState();
			} catch {
				setTransferError("Неуспешно запаметяване на добавянето към целта.");
				return;
			}
		}

		closeTransferModal();
	};

	return (
		<div className="finance-page goals-page">
			<section className="finance-header">
				<div>
					<h1>Цели за спестяване</h1>
					<p>Създавай цели, добавяй пари от източници или прехвърляй между цели.</p>
				</div>
			</section>

			<section className="goals-layout">
				<article className="surface-card">
					<div className="surface-card__head">
						<h2>Създай цел</h2>
					</div>
					{loading ? <p className="muted">Зареждане на цели...</p> : null}
					{error ? <p className="muted">{error}</p> : null}
					<form className="inline-form inline-form--three" onSubmit={handleCreateGoal}>
						<input
							type="text"
							placeholder="Име на целта"
							value={newGoal.title}
							onChange={(event) => setNewGoal((current) => ({ ...current, title: event.target.value }))}
						/>
						<input
							type="number"
							min="0"
							step="1"
							placeholder="Сума"
							value={newGoal.target}
							onChange={(event) => setNewGoal((current) => ({ ...current, target: event.target.value }))}
						/>
						<input
							type="date"
							min={getMinimumGoalDeadline()}
							value={newGoal.deadline}
							onChange={(event) =>
								setNewGoal((current) => ({ ...current, deadline: event.target.value }))
							}
						/>
						<button type="submit" className="button button--primary">
							Добави цел
						</button>
					</form>
				</article>

				<article className="surface-card">
					<div className="surface-card__head">
						<h2>Моите цели</h2>
					</div>

					<div className="goals-list">
						{goals.map((goal) => {
							const progress = calculateGoalProgress(goal);
							const completed = isGoalCompleted(goal);
							return (
								<article key={goal.id} className="goal-card">
									<div className="goal-card__head">
										<div>
											<strong>{goal.title}</strong>
											<p>Краен срок: {new Date(goal.deadline).toLocaleDateString("bg-BG")}</p>
										</div>
										<span className="pill pill--ok">{progress}%</span>
									</div>

									<p>
										{formatEur(goal.saved)} от {formatEur(goal.target)}
									</p>

									<div className="progress-track" aria-label={`Прогрес на цел ${goal.title}`}>
										<span className="progress-fill progress-fill--ok" style={{ width: `${progress}%` }} />
									</div>

									<div className="goal-card__actions">
										{!completed ? (
											<button
												type="button"
												className="button button--ghost"
												onClick={() => openAddModal(goal.id)}
											>
												Добави
											</button>
										) : null}
										{!completed ? (
											<button
												type="button"
												className="button button--primary"
												onClick={() => openGoalTransferModal(goal.id)}
											>
												Прехвърли
											</button>
										) : null}
										{completed ? (
											<button
												type="button"
												className="button button--ghost button--danger"
												onClick={() => openDeleteGoalModal(goal.id)}
											>
												Платени
											</button>
										) : (
											<button
												type="button"
												className="button button--ghost button--danger"
												onClick={() => openDeleteGoalModal(goal.id)}
											>
												Премахни цел
											</button>
										)}
									</div>
								</article>
							);
							})}
						</div>
					</article>
				</section>

				{goalDeleteModal.isOpen ? (
					<div
						className="modal-shell"
						role="dialog"
						aria-modal="true"
						aria-label="Премахване на цел"
					>
						<form className="surface-card modal-card" onSubmit={handleDeleteGoal}>
							<div className="surface-card__head">
								<h2>Премахване на цел</h2>
							</div>

							<div className="filter-grid">
								<label>
									<span>Цел</span>
									<input type="text" value={goalDeleteModal.goalTitle} readOnly />
								</label>

								<label>
									<span>{goalDeleteModal.mode === "archive" ? "Разход срещу реална покупка" : "Връщане на средствата"}</span>
									<input
										type="text"
										value={
											goalDeleteModal.mode === "archive"
												? "Целта е изпълнена. Парите се считат за похарчени и няма да бъдат върнати по сметката."
												: "Парите ще се върнат обратно към източниците, от които са били добавени."
										}
										readOnly
									/>
								</label>
							</div>

							{error ? <p className="muted">{error}</p> : null}

							<div className="modal-actions">
								<button type="button" className="button button--ghost" onClick={closeDeleteGoalModal}>
									Отказ
								</button>
								<button type="submit" className="button button--danger">
									{goalDeleteModal.mode === "archive" ? "Платени" : "Премахни цел"}
								</button>
							</div>
						</form>
					</div>
				) : null}

				{isTransferModalOpen ? (
					<div
						className="modal-shell"
						role="dialog"
						aria-modal="true"
						aria-label={
							transferDraft.mode === "goal-transfer"
								? "Прехвърляне между цели"
								: "Добавяне към цел"
						}
					>
						<form className="surface-card modal-card" onSubmit={submitTransfer}>
							<div className="surface-card__head">
								<h2>
									{transferDraft.mode === "goal-transfer"
										? "Прехвърляне между цели"
										: "Добавяне към цел"}
								</h2>
							</div>

							<div className="filter-grid">
								<label>
									<span>Към цел</span>
									<select
										value={transferDraft.toGoalId}
										onChange={(event) =>
											setTransferDraft((current) => ({ ...current, toGoalId: event.target.value }))
										}
									>
										<option value="">Избери цел</option>
										{goals.map((goal) => (
											<option key={goal.id} value={goal.id}>
												{goal.title}
											</option>
										))}
									</select>
								</label>

								{transferDraft.mode === "goal-transfer" ? (
									<label>
										<span>От цел</span>
										<select
											value={transferDraft.fromGoalId}
											onChange={(event) =>
												setTransferDraft((current) => ({ ...current, fromGoalId: event.target.value }))
											}
										>
											<option value="">Избери изходна цел</option>
											{goals
												.filter((goal) => Number(goal.id) !== Number(transferDraft.toGoalId))
												.map((goal) => (
													<option key={goal.id} value={goal.id}>
														{goal.title} • Наличност: {formatEur(goal.saved)}
													</option>
												))}
										</select>
									</label>
								) : (
									<label>
										<span>От портфейл/сметка</span>
										<select
											value={transferDraft.sourceId}
											onChange={(event) =>
												setTransferDraft((current) => ({ ...current, sourceId: event.target.value }))
											}
										>
											<option value="">Избери източник</option>
											{fundingSources.map((source) => (
												<option key={source.id} value={source.id}>
													{source.name} • Наличност: {formatEur(source.balance)}
												</option>
											))}
										</select>
									</label>
								)}

								<label>
									<span>Сума</span>
									<input
										type="number"
										step="0.01"
										min="0"
										value={transferDraft.amount}
										onChange={(event) =>
											setTransferDraft((current) => ({ ...current, amount: event.target.value }))
										}
									/>
								</label>

								<label>
									<span>Бележка (по желание)</span>
									<input
										type="text"
										placeholder="Напр. Лично задължение"
										value={transferDraft.note}
										onChange={(event) =>
											setTransferDraft((current) => ({ ...current, note: event.target.value }))
										}
									/>
								</label>
							</div>

							{transferError ? <p className="muted">{transferError}</p> : null}

							<div className="modal-actions">
								<button type="button" className="button button--ghost" onClick={closeTransferModal}>
									Отказ
								</button>
								<button type="submit" className="button button--primary">
									{transferDraft.mode === "goal-transfer"
										? "Потвърди прехвърляне"
										: "Потвърди добавяне"}
								</button>
							</div>
						</form>
					</div>
				) : null}
		</div>
	);
}

export default Goals;
