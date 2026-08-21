import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
	calculateSpendingPaceIndicator,
	calculateVariableDailyLimitRecommendation,
	endOfMonthSafeToSpend,
	findTopSpendingCategory,
	formatEur,
	periodOptions,
} from "../services/financeData";
import { getBudgets } from "../services/budgetsApi";
import { calculateCashFlowSeries, calculateDashboardData } from "../services/dashboardAnalytics";
import { getGoals } from "../services/goalsApi";
import { getTransactions } from "../services/transactionsApi";
import { getWallets } from "../services/walletsApi";

function buildLinePath(points) {
	if (!points.length) {
		return "";
	}

	return points
		.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
		.join(" ");
}

function buildAreaPath(points, baseline = 260) {
	if (!points.length) {
		return "";
	}

	const linePath = buildLinePath(points);
	const firstPoint = points[0];
	const lastPoint = points[points.length - 1];

	return `${linePath} L ${lastPoint.x},${baseline} L ${firstPoint.x},${baseline} Z`;
}

function Dashboard() {
	const [period, setPeriod] = useState("month");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [transactions, setTransactions] = useState([]);
	const [wallets, setWallets] = useState([]);
	const [budgets, setBudgets] = useState([]);
	const [dashboard, setDashboard] = useState({
		history: [],
		summary: { income: 0, expense: 0 },
		riskyBudgets: [],
		goalBubbles: [],
		totalBalance: 0,
	});

	useEffect(() => {
		const loadDashboard = async () => {
			setLoading(true);
			setError("");

			try {
				const [nextTransactions, goals, budgets, wallets] = await Promise.all([
					getTransactions(),
					getGoals(),
					getBudgets(),
					getWallets(),
				]);

				const totalBalance = wallets.reduce((sum, wallet) => sum + wallet.balance, 0);
				setTransactions(nextTransactions);
				setWallets(wallets);
				setBudgets(budgets);
				setDashboard(calculateDashboardData(nextTransactions, goals, budgets, totalBalance, period));
			} catch {
				setError("Неуспешно зареждане на dashboard данните.");
			} finally {
				setLoading(false);
			}
		};

		void loadDashboard();
	}, [period]);

	const history = dashboard.history;
	const summary = dashboard.summary;
	const walletBreakdown = useMemo(
		() =>
			[...wallets]
				.filter((wallet) => Number(wallet.balance) !== 0)
				.sort((left, right) => Number(right.balance) - Number(left.balance))
				.map((wallet) => ({
					...wallet,
					balance: Number(wallet.balance) || 0,
				})),
		[wallets],
	);
	const totalBudget = budgets.reduce((sum, budget) => sum + Number(budget.limit || 0), 0);
	const totalSpent = budgets.reduce((sum, budget) => sum + Number(budget.spent || 0), 0);
	const safeToSpend = useMemo(
		() => endOfMonthSafeToSpend(totalBudget, totalSpent),
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
	const cashFlowSeries = useMemo(() => {
		const series = calculateCashFlowSeries(transactions, period);
		const incomeValues = series.income;
		const expenseValues = series.expense;
		const combined = [...incomeValues, ...expenseValues];
		const maxValue = Math.max(...combined, 1);

		const incomePoints = incomeValues.map((value, index) => {
			const x = series.income.length > 1 ? (index / (series.income.length - 1)) * 640 : 320;
			const y = 260 - (value / maxValue) * 200;
			return { x, y };
		});

		const expensePoints = expenseValues.map((value, index) => {
			const x = series.expense.length > 1 ? (index / (series.expense.length - 1)) * 640 : 320;
			const y = 260 - (value / maxValue) * 200;
			return { x, y };
		});

		return {
			...series,
			incomePath: buildLinePath(incomePoints),
			expensePath: buildLinePath(expensePoints),
			incomeAreaPath: buildAreaPath(incomePoints, 260),
			expenseAreaPath: buildAreaPath(expensePoints, 260),
			incomePoints,
			expensePoints,
			maxValue,
		};
	}, [period, transactions]);

	const gridLines = Array.from({ length: 5 }, (_, index) => 30 + index * 52);

	return (
		<div className="finance-page dashboard-page">
			<section className="finance-header">
				<div>
					<h1>Общата картина</h1>
					<p>Проследи баланса, бюджета и целите си в един екран.</p>
				</div>
			</section>

			{loading ? <p className="muted">Зареждане на dashboard данни...</p> : null}
			{error ? <p className="muted">{error}</p> : null}

			<section className="dashboard-layout">
				<article className="surface-card chart-card cashflow-chart-card">
					<div className="surface-card__head">
						<h2>Паричен поток</h2>
						<div className="segmented-control segmented-control--compact" role="tablist" aria-label="Период на паричния поток">
							{periodOptions.map((option) => (
								<button
									key={option.value}
									type="button"
									className={period === option.value ? "segment segment--active" : "segment"}
									onClick={() => setPeriod(option.value)}
								>
									{option.label}
								</button>
							))}
						</div>
					</div>

					<svg className="cashflow-svg" viewBox="0 0 640 290" role="img" aria-label="Графика на паричния поток">
						<defs>
							<linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="rgba(34, 197, 94, 0.24)" />
								<stop offset="100%" stopColor="rgba(34, 197, 94, 0.02)" />
							</linearGradient>
							<linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="rgba(239, 68, 68, 0.22)" />
								<stop offset="100%" stopColor="rgba(239, 68, 68, 0.02)" />
							</linearGradient>
						</defs>

						{gridLines.map((y) => (
							<line key={`grid-${y}`} x1="20" x2="620" y1={y} y2={y} className="cashflow-grid-line" />
						))}

						<path d={cashFlowSeries.expenseAreaPath} fill="url(#expenseFill)" />
						<path d={cashFlowSeries.incomeAreaPath} fill="url(#incomeFill)" />
						<path d={cashFlowSeries.incomePath} fill="none" stroke="#22c55e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
						<path d={cashFlowSeries.expensePath} fill="none" stroke="#ef4444" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
						{cashFlowSeries.incomePoints.map((point, index) => (
							<circle key={`income-${period}-${index}`} cx={point.x} cy={point.y} r="4.5" fill="#22c55e" />
						))}
						{cashFlowSeries.expensePoints.map((point, index) => (
							<circle key={`expense-${period}-${index}`} cx={point.x} cy={point.y} r="4.5" fill="#ef4444" />
						))}
					</svg>

					<div className="chart-labels chart-labels--cashflow">
						{cashFlowSeries.labels.filter(Boolean).map((label) => (
							<span key={`${label}-${period}`}>{label}</span>
						))}
					</div>
				</article>

				<aside className="dashboard-side-grid">
					<article className="surface-card widget-card">
						<span>Общ баланс</span>
						<strong>{formatEur(dashboard.totalBalance)}</strong>
						<div className="wallet-breakdown" aria-label="Разпределение на баланса по портфейли">
							{walletBreakdown.length ? (
								walletBreakdown.map((wallet) => (
									<span key={wallet.id ?? wallet.name} className="wallet-breakdown__item">
										<span className="wallet-breakdown__name">{wallet.name}</span>
										<span className="wallet-breakdown__value">{formatEur(wallet.balance)}</span>
									</span>
								))
							) : (
								<span className="wallet-breakdown__empty">Няма данни за портфейли.</span>
							)}
						</div>
					</article>
					<article className="surface-card widget-card widget-card--income">
						<span>Приходи за периода</span>
						<strong>{formatEur(summary.income)}</strong>
					</article>
					<article className="surface-card widget-card widget-card--expense">
						<span>Разходи за периода</span>
						<strong>{formatEur(summary.expense)}</strong>
					</article>
				</aside>
			</section>

			<section className="dashboard-bottom-grid">
				<article className="surface-card">
					<div className="surface-card__head">
						<h2>Напредък по целите</h2>
						<Link to="/goals" className="surface-link">
							Виж всички
						</Link>
					</div>
					<div className="goal-bubbles">
						{dashboard.goalBubbles.map((goal) => (
							<Link
								to="/goals"
								key={goal.id}
								className="goal-bubble"
								style={{ "--goal-size": `${110 + goal.progress * 0.8}px` }}
								title={`Отиди към целта ${goal.title}`}
							>
								<strong>{goal.progress}%</strong>
								<span>{goal.title}</span>
							</Link>
						))}
					</div>
				</article>

				<article className="surface-card">
					<div className="surface-card__head">
						<h2>Индикатор за бюджети</h2>
						<Link to="/budgets" className="surface-link">
							Към бюджети
						</Link>
					</div>
					<div className="budget-alerts">
						{dashboard.riskyBudgets.length ? (
							dashboard.riskyBudgets.map((budget) => (
								<div key={budget.id} className="budget-alert-item">
									<div>
										<strong>{budget.category}</strong>
										<p>
											{formatEur(budget.spent)} от {formatEur(budget.limit)}
										</p>
									</div>
									<span className={budget.usage >= 100 ? "pill pill--danger" : "pill pill--warn"}>
										{budget.usage}%
									</span>
								</div>
							))
						) : (
							<p className="muted">Няма бюджети близо до лимит.</p>
						)}
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

export default Dashboard;