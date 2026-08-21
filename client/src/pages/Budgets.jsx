import { useEffect, useMemo, useState } from "react";

import { createCategory, getCategories } from "../services/categoriesApi";
import {
	calculateBudgetUsage,
	calculateMonthSpendingProjection,
	calculateSpendingPaceIndicator,
	calculateVariableDailyLimitRecommendation,
	endOfMonthSafeToSpend,
	findTopSpendingCategory,
	formatEur,
} from "../services/financeData";
import { createBudget, deleteBudget, getBudgets, updateBudget } from "../services/budgetsApi";
import { deleteCategory } from "../services/categoriesApi";
import { transactionsChangedEvent } from "../services/transactionsApi";

function Budgets() {
	const [categories, setCategories] = useState([]);
	const [budgets, setBudgets] = useState([]);
	const [newBudget, setNewBudget] = useState({ category: "", limit: "", isFixed: false });
	const [isCreatingCategory, setIsCreatingCategory] = useState(false);
	const [editingBudgetId, setEditingBudgetId] = useState(null);
	const [budgetNameDraft, setBudgetNameDraft] = useState("");
	const [budgetLimitDraft, setBudgetLimitDraft] = useState("");
	const [budgetIsFixedDraft, setBudgetIsFixedDraft] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		const loadBudgets = async () => {
			setLoading(true);
			setError("");

			try {
				setBudgets(await getBudgets());
			} catch {
				setError("Неуспешно зареждане на бюджетите.");
			} finally {
				setLoading(false);
			}
		};

		void loadBudgets();

		const handleTransactionsChanged = () => {
			void loadBudgets();
		};

		window.addEventListener(transactionsChangedEvent, handleTransactionsChanged);

		return () => {
			window.removeEventListener(transactionsChangedEvent, handleTransactionsChanged);
		};
	}, []);

	useEffect(() => {
		const loadCategories = async () => {
			try {
				const items = await getCategories();
				setCategories(items.filter((item) => item.categoryType === "expense"));
			} catch {
				setCategories([]);
			}
		};

		void loadCategories();
	}, []);

	const totalBudget = budgets.reduce((sum, budget) => sum + budget.limit, 0);
	const totalSpent = budgets.reduce((sum, budget) => sum + budget.spent, 0);
	const safeToSpend = useMemo(
		() => endOfMonthSafeToSpend(totalBudget, totalSpent),
		[totalBudget, totalSpent],
	);
	const monthProjection = useMemo(
		() => calculateMonthSpendingProjection(totalSpent, totalBudget),
		[totalBudget, totalSpent],
	);
	const paceIndicator = useMemo(
		() => {
			const today = new Date();
			return calculateSpendingPaceIndicator(
				totalSpent,
				totalBudget,
				today.getDate(),
				new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate(),
			);
		},
		[totalBudget, totalSpent],
	);
	const topSpendingCategory = useMemo(
		() => {
			const today = new Date();
			return findTopSpendingCategory(
				budgets,
				today.getDate(),
				new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate(),
			);
		},
		[budgets],
	);
	const variableDailyLimitRecommendation = useMemo(
		() => calculateVariableDailyLimitRecommendation(budgets),
		[budgets],
	);

	const addBudget = (event) => {
		event.preventDefault();
		const trimmedCategory = newBudget.category.trim();
		if (!trimmedCategory || Number(newBudget.limit) <= 0) {
			return;
		}

		void (async () => {
			setIsCreatingCategory(true);
			setError("");

			try {
				const normalizedName = trimmedCategory.toLowerCase();
				let categoryRecord = categories.find(
					(item) => item.category?.toLowerCase() === normalizedName && item.categoryType === "expense",
				);

				if (!categoryRecord) {
					try {
						categoryRecord = await createCategory({ category: trimmedCategory, categoryType: "expense" });
						setCategories((current) => [...current, categoryRecord]);
					} catch {
						const freshCategories = await getCategories();
						categoryRecord = freshCategories.find(
							(item) =>
								item.categoryType === "expense" && item.category?.toLowerCase() === normalizedName,
						);
						if (!categoryRecord) {
							throw new Error("Missing category after creation");
						}
					}
				}

				const created = await createBudget({
					category: trimmedCategory,
					categoryId: categoryRecord?.id ?? null,
					limit: Number(newBudget.limit),
					isFixed: Boolean(newBudget.isFixed),
				});
				setBudgets((current) => [...current, created]);
				setNewBudget({ category: "", limit: "", isFixed: false });
			} catch {
				setError("Неуспешно създаване на бюджет.");
			} finally {
				setIsCreatingCategory(false);
			}
		})();
	};

	const startBudgetEdit = (budget) => {
		setEditingBudgetId(budget.id);
		setBudgetNameDraft(budget.category);
		setBudgetLimitDraft(String(budget.limit));
		setBudgetIsFixedDraft(Boolean(budget.isFixed));
	};

	const saveBudgetLimit = async (id) => {
		const trimmedName = budgetNameDraft.trim();
		const nextLimit = Number(budgetLimitDraft);
		if (!trimmedName) {
			setError("Името на бюджета не може да е празно.");
			return;
		}
		if (!Number.isFinite(nextLimit) || nextLimit <= 0) {
			setError("Лимитът трябва да е по-голям от 0.");
			return;
		}

		try {
			const updated = await updateBudget({
				id,
				category: trimmedName,
				limit: nextLimit,
				isFixed: budgetIsFixedDraft,
			});
			setBudgets((current) => current.map((budget) => (budget.id === id ? updated : budget)));
			setEditingBudgetId(null);
			setBudgetNameDraft("");
			setBudgetLimitDraft("");
			setBudgetIsFixedDraft(false);
			setError("");
		} catch {
			setError("Неуспешно редактиране на бюджета.");
		}
	};

	const handleDeleteBudget = async (budget) => {
		const confirmed = window.confirm(`Да изтриеш ли бюджета "${budget.category}"?`);
		if (!confirmed) {
			return;
		}

		try {
			await deleteBudget(budget.id);
			setBudgets((current) => current.filter((item) => item.id !== budget.id));

			if (budget.categoryId) {
				const categoryStillUsed = budgets.some(
					(item) => item.id !== budget.id && item.categoryId === budget.categoryId,
				);

				if (!categoryStillUsed) {
					try {
						await deleteCategory(budget.categoryId);
						setCategories((current) => current.filter((item) => item.id !== budget.categoryId));
					} catch {
						setError("Бюджетът е изтрит, но категорията не можа да бъде премахната.");
					}
				}
			}
			setError("");
		} catch {
			setError("Неуспешно изтриване на бюджета.");
		}
	};

	return (
		<div className="finance-page budgets-page">
			<section className="finance-header">
				<div>
					<h1>Планиране и контрол</h1>
					<p>Задай лимити и следи дали се движиш в рамките им.</p>
				</div>
			</section>

			<section className="budgets-layout">
				<article className="surface-card">
					<div className="surface-card__head">
						<h2>Моите бюджети</h2>
					</div>

					{loading ? <p className="muted">Зареждане на бюджети...</p> : null}
					{error ? <p className="muted">{error}</p> : null}

					<form className="inline-form" onSubmit={addBudget}>
						<input
							type="text"
							placeholder="Име на категория/бюджет"
							value={newBudget.category}
							onChange={(event) =>
								setNewBudget((current) => ({ ...current, category: event.target.value }))
							}
						/>
						<input
							type="number"
							step="0.01"
							min="0"
							placeholder="Лимит"
							value={newBudget.limit}
							onChange={(event) =>
								setNewBudget((current) => ({ ...current, limit: event.target.value }))
							}
						/>
						<label className="checkbox-row">
							<input
								type="checkbox"
								checked={newBudget.isFixed}
								onChange={(event) =>
									setNewBudget((current) => ({ ...current, isFixed: event.target.checked }))
								}
							/>
							<span>Фиксиран разход</span>
						</label>
						<button type="submit" className="button button--primary" disabled={isCreatingCategory}>
							{isCreatingCategory ? "Създаване..." : "Добави бюджет"}
						</button>
					</form>

					<div className="budget-progress-list">
						{budgets.map((budget) => {
							const usage = calculateBudgetUsage(budget);
							const progress = Math.min(100, usage);
							const tone = usage >= 100 ? "danger" : usage >= 80 ? "warn" : "ok";

							return (
								<article key={budget.id} className="budget-progress-card">
									<div className="budget-progress-card__head">
										<strong>{budget.category}</strong>
										<span className={`pill pill--${tone}`}>{usage}%</span>
									</div>
									<p>
										{formatEur(budget.spent)} от {formatEur(budget.limit)}
									</p>
									<div className="progress-track" aria-label={`Прогрес на бюджет ${budget.category}`}>
										<span className={`progress-fill progress-fill--${tone}`} style={{ width: `${progress}%` }} />
									</div>
									<div className="budget-actions">
										{editingBudgetId === budget.id ? (
											<div className="inline-form inline-form--compact budget-edit-form">
												<input
													type="text"
													value={budgetNameDraft}
													onChange={(event) => setBudgetNameDraft(event.target.value)}
													placeholder="Име на бюджета"
												/>
												<input
													type="number"
													step="0.01"
													min="0"
													value={budgetLimitDraft}
													onChange={(event) => setBudgetLimitDraft(event.target.value)}
													placeholder="Лимит"
												/>
												<label className="checkbox-row">
													<input
														type="checkbox"
														checked={budgetIsFixedDraft}
														onChange={(event) => setBudgetIsFixedDraft(event.target.checked)}
													/>
													<span>Фиксиран разход</span>
												</label>
												<button type="button" className="button button--primary" onClick={() => void saveBudgetLimit(budget.id)}>
													Запази
												</button>
												<button
													type="button"
													className="button button--ghost"
													onClick={() => {
														setEditingBudgetId(null);
														setBudgetNameDraft("");
														setBudgetLimitDraft("");
														setBudgetIsFixedDraft(false);
													}}
												>
													Отказ
												</button>
											</div>
										) : (
											<div className="budget-actions__row">
												<button type="button" className="button button--ghost" onClick={() => startBudgetEdit(budget)}>
													Редактирай
												</button>
												<button type="button" className="button button--danger" onClick={() => void handleDeleteBudget(budget)}>
													Изтрий
												</button>
											</div>
										)}
									</div>
								</article>
							);
						})}
					</div>
				</article>

				<article className="surface-card safe-spend-card">
					<div className="surface-card__head">
						<h2>Сума за харчене</h2>
					</div>
					{paceIndicator.visible ? (
						<p className="safe-spend-status">
							<strong>{paceIndicator.emoji}</strong> <span>{paceIndicator.label}</span>
						</p>
					) : null}
					{topSpendingCategory ? (
						<p className="safe-spend-note safe-spend-note--warning">
							Основен принос за преразхода: {topSpendingCategory.category} ({Math.round(topSpendingCategory.percentSpent * 100)}% от лимита похарчени за {topSpendingCategory.daysElapsed} от {topSpendingCategory.daysInMonth} дни)
						</p>
					) : null}
					{variableDailyLimitRecommendation?.visible ? (
						<p className="safe-spend-note safe-spend-note--highlight">{variableDailyLimitRecommendation.message}</p>
					) : null}
					<div className="safe-spend-summary">
						<div>
							<span>Общ лимит</span>
							<strong>{formatEur(totalBudget)}</strong>
						</div>
						<div>
							<span>Изразходвано</span>
							<strong>{formatEur(totalSpent)}</strong>
						</div>
					</div>
				</article>
			</section>
		</div>
	);
}

export default Budgets;
