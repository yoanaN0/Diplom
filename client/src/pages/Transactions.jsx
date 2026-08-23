import { useEffect, useMemo, useRef, useState } from "react";

import { useTransactions } from "../hooks/useTransactions";
import { getBudgets } from "../services/budgetsApi";
import {
	createCategory,
	deleteCategory,
	getCategories,
	updateCategory,
} from "../services/categoriesApi";
import { formatEur } from "../services/financeData";
import { getWallets } from "../services/walletsApi";
import { parseAmountFromReceipt, parseMerchantFromReceipt } from "./receiptParsers";

const initialDraft = {
	type: "expense",
	title: "",
	amount: "",
	wallet: "ДСК",
	category: "",
	note: "",
};

function getCategoryLabel(item) {
	if (!item) {
		return "";
	}

	if (typeof item === "string") {
		return item.trim();
	}

	return String(item.category ?? item.name ?? "").trim();
}

function formatDateHeader(dateValue) {
	return new Intl.DateTimeFormat("bg-BG", {
		day: "2-digit",
		month: "long",
		year: "numeric",
	}).format(new Date(dateValue));
}

const typeFilterButtons = [
	{ value: "all", label: "Всички" },
	{ value: "transfer", label: "Трансфер" },
	{ value: "income", label: "Приход" },
	{ value: "expense", label: "Разход" },
];

function isTransferTransaction(entry) {
	const tags = Array.isArray(entry.tags) ? entry.tags : [];
	const category = String(entry.category || "").trim();
	const title = String(entry.title || "").trim();

	if (tags.includes("#goal-transfer")) {
		return true;
	}

	if (category === "Спестяване") {
		return title.startsWith("Трансфер към цел:");
	}

	return false;
}

function Transactions() {
	const { transactions, loading, error, add, edit } = useTransactions();
	const [periodFilter, setPeriodFilter] = useState("all");
	const [typeFilter, setTypeFilter] = useState("all");
	const [walletFilter, setWalletFilter] = useState("all");
	const [categoryFilter, setCategoryFilter] = useState("all");
	const [draft, setDraft] = useState(initialDraft);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [editingId, setEditingId] = useState(null);
	const [wallets, setWallets] = useState([]);
	const [categories, setCategories] = useState([]);
	const [budgetCategories, setBudgetCategories] = useState([]);
	const [categoryDrafts, setCategoryDrafts] = useState({ income: "", expense: "" });
	const [categoryForms, setCategoryForms] = useState({ income: false, expense: false });
	const [editingCategory, setEditingCategory] = useState({ id: null, type: "expense", name: "" });
	const scanInputRef = useRef(null);
	const [scanState, setScanState] = useState({
		isScanning: false,
		error: "",
		rawText: "",
		preview: "",
	});

	useEffect(() => {
		const loadCategories = async () => {
			try {
				const [walletItems, categoryItems, budgetItems] = await Promise.all([
					getWallets(),
					getCategories(),
					getBudgets(),
				]);

				const nextCategories = categoryItems.map((item) => item.category);
				setWallets(walletItems);
				setCategories(categoryItems);
				setBudgetCategories(nextCategories.length ? nextCategories : [...new Set(budgetItems.map((item) => item.category).filter(Boolean))]);
			} catch {
				setWallets([]);
				setCategories([]);
				setBudgetCategories([]);
			}
		};

		void loadCategories();
	}, []);

	const walletOptions = useMemo(() => {
		const walletNames = new Map();

		for (const wallet of wallets) {
			const label = String(wallet?.name ?? "").trim();
			if (label) {
				walletNames.set(label, { id: Number(wallet?.id ?? 0) || null, name: label });
			}
		}

		if (walletNames.size === 0) {
			for (const entry of transactions) {
				const label = String(entry?.wallet ?? "").trim();
				if (label && label !== "Цели" && !walletNames.has(label)) {
					walletNames.set(label, { id: Number(entry?.walletId ?? 0) || null, name: label });
			}
			}
		}

		return [...walletNames.values()];
	}, [wallets, transactions]);
	const normalizedCategoryItems = useMemo(() => {
		const source = categories.length ? categories : budgetCategories;
		return (Array.isArray(source) ? source : [])
			.map((item) => {
				if (typeof item === "string") {
					const name = item.trim();
					return name ? { id: null, category: name, categoryType: "expense" } : null;
				}

				if (!item || typeof item !== "object") {
					return null;
				}

				const name = getCategoryLabel(item);
				if (!name) {
					return null;
				}

				return {
					...item,
					category: name,
					categoryType: item.categoryType ?? item.category_type ?? "expense",
				};
			})
			.filter(Boolean);
	}, [categories, budgetCategories]);

	const incomeCategoryItems = useMemo(
		() => [...new Map(normalizedCategoryItems.filter((item) => item.categoryType === "income").map((item) => [item.category, item])).values()],
		[normalizedCategoryItems],
	);
	const expenseCategoryItems = useMemo(
		() => [...new Map(normalizedCategoryItems.filter((item) => item.categoryType === "expense").map((item) => [item.category, item])).values()],
		[normalizedCategoryItems],
	);
	const incomeCategories = useMemo(
		() => incomeCategoryItems.map((item) => item.category),
		[incomeCategoryItems],
	);
	const expenseCategories = useMemo(
		() => expenseCategoryItems.map((item) => item.category),
		[expenseCategoryItems],
	);
	const allCategoryOptions = useMemo(
		() => [...new Set([...incomeCategories, ...expenseCategories])],
		[incomeCategories, expenseCategories],
	);
	const categoryOptions = draft.type === "income" ? incomeCategories : expenseCategories;

	const filteredTransactions = useMemo(() => {
		const now = new Date();
		return transactions.filter((entry) => {
			const date = new Date(entry.date);
			const isGoalTransfer = isTransferTransaction(entry);

			if (periodFilter === "week") {
				const lastWeek = new Date(now);
				lastWeek.setDate(now.getDate() - 7);
				if (date < lastWeek) {
					return false;
				}
			}

			if (periodFilter === "lastMonth") {
				const startCurrent = new Date(now.getFullYear(), now.getMonth(), 1);
				const startLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
				if (date < startLast || date >= startCurrent) {
					return false;
				}
			}

			if (typeFilter === "transfer" && !isGoalTransfer) {
				return false;
			}

			if (typeFilter === "income" && (isGoalTransfer || entry.type !== "income")) {
				return false;
			}

			if (typeFilter === "expense" && (isGoalTransfer || entry.type !== "expense")) {
				return false;
			}

			if (walletFilter !== "all" && entry.wallet !== walletFilter) {
				return false;
			}

			if (categoryFilter !== "all" && entry.category !== categoryFilter) {
				return false;
			}

			return true;
		});
	}, [transactions, periodFilter, typeFilter, walletFilter, categoryFilter]);

	const groupedTransactions = useMemo(() => {
		return filteredTransactions.reduce((groups, entry) => {
			const key = new Date(entry.date).toISOString().slice(0, 10);
			if (!groups[key]) {
				groups[key] = [];
			}
			groups[key].push(entry);
			return groups;
		}, {});
	}, [filteredTransactions]);

	const sortedDates = Object.keys(groupedTransactions).sort((a, b) => new Date(b) - new Date(a));

	const openNewModal = (type) => {
		setEditingId(null);
		const nextCategoryOptions = type === "income" ? incomeCategories : expenseCategories;
		const defaultWallet = walletOptions[0]?.name || initialDraft.wallet;
		setDraft({
			...initialDraft,
			type,
			wallet: defaultWallet,
			category: nextCategoryOptions[0] || "",
		});
		setScanState({ isScanning: false, error: "", rawText: "", preview: "" });
		setIsModalOpen(true);
	};

	const triggerScan = () => {
		scanInputRef.current?.click();
	};

	const openEditModal = (entry) => {
		setEditingId(entry.id);
		const nextCategoryOptions = entry.type === "income" ? incomeCategories : expenseCategories;
		const selectedWallet = walletOptions.find((wallet) => wallet.name === entry.wallet);
		setDraft({
			type: entry.type,
			title: entry.title,
			amount: String(entry.amount),
			wallet: selectedWallet?.name || walletOptions[0]?.name || initialDraft.wallet,
			category: entry.category || nextCategoryOptions[0] || "",
			note: entry.note,
		});
		setScanState({ isScanning: false, error: "", rawText: "", preview: "" });
		setIsModalOpen(true);
	};

	const closeModal = () => {
		setIsModalOpen(false);
		setDraft(initialDraft);
		setEditingId(null);
		setScanState({ isScanning: false, error: "", rawText: "", preview: "" });
	};

	const handleAddCategory = async (type) => {
		const trimmed = categoryDrafts[type]?.trim();

		if (!trimmed) {
			setCategoryForms((current) => ({ ...current, [type]: true }));
			return;
		}

		try {
			const created = await createCategory({ category: trimmed, categoryType: type });
			setCategories((current) => {
				if (current.some((category) => category.category === created.category && category.categoryType === created.categoryType)) {
					return current;
		}
				return [...current, created];
			});
			setCategoryDrafts((current) => ({ ...current, [type]: "" }));
			setCategoryForms((current) => ({ ...current, [type]: false }));
			if (draft.type === type) {
				setDraft((current) => ({ ...current, category: created.category }));
			}
		} catch {
			window.alert("Неуспешно създаване на категория.");
		}
	};

	const handleOpenCategoryEdit = (item) => {
		if (!item) {
			return;
		}

		const label = String(item.category ?? "").trim();
		if (!label) {
			return;
		}

		setEditingCategory({
			id: item.id ?? null,
			type: item.categoryType ?? "expense",
			name: label,
			});
	};

	const handleSaveCategoryEdit = async (event) => {
		event.preventDefault();
		const trimmed = editingCategory.name.trim();
		if (!trimmed || editingCategory.id === null) {
			return;
		}

		try {
			const updated = await updateCategory({
				id: editingCategory.id,
				category: trimmed,
				categoryType: editingCategory.type,
			});
			setCategories((current) => current.map((item) => (item.id === editingCategory.id ? { ...item, ...updated } : item)));
			setDraft((current) => ({
					...current,
				category: current.category === editingCategory.name ? updated.category : current.category,
			}));
			setCategoryFilter("all");
			setEditingCategory({ id: null, type: "expense", name: "" });
		} catch {
			window.alert("Неуспешно редактиране на категория.");
		}
	};

	const handleDeleteCategory = async () => {
		if (editingCategory.id === null) {
			return;
		}

		const confirmed = window.confirm(`Да изтриеш ли категорията "${editingCategory.name}"?`);
		if (!confirmed) {
			return;
		}

		try {
			await deleteCategory(editingCategory.id);
			setCategories((current) => current.filter((item) => item.id !== editingCategory.id));
			setDraft((current) => ({
				...current,
				category: current.category === editingCategory.name ? "" : current.category,
			}));
			setCategoryFilter("all");
			setEditingCategory({ id: null, type: "expense", name: "" });
		} catch {
			window.alert("Неуспешно изтриване на категория.");
		}
	};

	const ensureTesseract = async () => {
		if (typeof window === "undefined") {
			return null;
		}

		if (window.Tesseract) {
			return window.Tesseract;
		}

		await new Promise((resolve, reject) => {
			const script = document.createElement("script");
			script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
			script.onload = resolve;
			script.onerror = () => reject(new Error("Неуспешно зареждане на OCR библиотеката."));
			document.body.appendChild(script);
		});

		return window.Tesseract;
	};

	const handleReceiptScan = async (event) => {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}

		const preview = URL.createObjectURL(file);
		setEditingId(null);
		setDraft({
			...initialDraft,
			type: "expense",
			category: categoryOptions[0] || "",
		});
		setIsModalOpen(true);
		setScanState({ isScanning: true, error: "", rawText: "", preview });

		try {
			const Tesseract = await ensureTesseract();
			if (!Tesseract) {
				throw new Error("OCR библиотеката не е налична в текущата среда.");
			}

			const result = await Tesseract.recognize(file, "bul");
			const rawText = result?.data?.text ?? "";
			const amount = parseAmountFromReceipt(rawText);
			const merchant = parseMerchantFromReceipt(rawText);

			setScanState({
				isScanning: false,
				error: "",
				rawText,
				preview,
			});

			setDraft((current) => ({
				...current,
				type: "expense",
				title: merchant && !current.title.trim() ? merchant : current.title,
				amount: amount !== null && amount > 0 ? String(amount) : current.amount,
			}));
		} catch (error) {
			setScanState({
				isScanning: false,
				error: error instanceof Error ? error.message : "Неуспешно сканиране на бележката.",
				rawText: "",
				preview,
			});
		}
	};

	const saveTransaction = async (event) => {
		event.preventDefault();

		const parsedAmount = Number(draft.amount || 0);
		if (!draft.title.trim() || parsedAmount <= 0 || !draft.category.trim()) {
			return;
		}

		const selectedWallet = walletOptions.find((wallet) => wallet.name === draft.wallet) || null;
		const selectedCategory = normalizedCategoryItems.find((item) => item.category === draft.category) || null;
		if (!selectedWallet) {
			window.alert("Моля, изберете валиден портфейл.");
			return;
		}

		const payload = {
			id: editingId ?? `t-${Date.now()}`,
			type: draft.type,
			title: draft.title.trim(),
			amount: parsedAmount,
			wallet: draft.wallet,
			walletId: selectedWallet.id,
			category: draft.category,
			categoryId: selectedCategory?.id ?? null,
			note: draft.note.trim(),
			tags: [],
			date: editingId
				? transactions.find((entry) => entry.id === editingId)?.date ?? new Date().toISOString()
				: new Date().toISOString(),
			receipt: "",
		};

		const saved = editingId ? await edit(editingId, payload) : await add(payload);
		if (!saved) {
			return;
		}

		closeModal();
	};

	return (
		<div className="finance-page transactions-page">
			<section className="finance-header">
				<div>
					<h1>Тразнакции</h1>
					<p>Хронологичен списък с филтриране, търсене и редакция.</p>
				</div>
			</section>

			<section className="surface-card category-visual-card">
				<div className="surface-card__head">
					<h2>Категории</h2>
				</div>

				<div className="category-visual-grid">
					<div className="category-visual-section category-visual-section--income">
						<div className="category-visual-header">
							<h3>Приход</h3>
							<button type="button" className="button button--success category-add-button" onClick={() => setCategoryForms((current) => ({ ...current, income: !current.income }))}>
								Добави категория
							</button>
						</div>
						{categoryForms.income ? (
							<form
								className="category-form-inline"
								onSubmit={(event) => {
									event.preventDefault();
									void handleAddCategory("income");
								}}
							>
								<input
									type="text"
									value={categoryDrafts.income}
									onChange={(event) => setCategoryDrafts((current) => ({ ...current, income: event.target.value }))}
									placeholder="Име на категория"
								/>
								<button type="submit" className="button button--success category-submit-button">
									Запази
								</button>
							</form>
						) : null}
						<div className="category-chip-list">
							{incomeCategoryItems.length ? (
								incomeCategoryItems.map((item) => {
									const isEditing = editingCategory.id === item.id && editingCategory.type === "income";
									if (isEditing) {
										return (
											<form key={`income-edit-${item.id ?? item.category}`} className="category-form-inline" onSubmit={handleSaveCategoryEdit}>
												<input
													type="text"
													value={editingCategory.name}
													onChange={(event) => setEditingCategory((current) => ({ ...current, name: event.target.value }))}
												/>
												<div className="category-chip__actions">
													<button type="submit" className="category-chip__action">Запази</button>
													<button type="button" className="category-chip__action category-chip__action--danger" onClick={handleDeleteCategory}>Изтрий категория</button>
												</div>
											</form>
										);
									}

									return (
										<button
											key={`income-${item.id ?? item.category}`}
											type="button"
											className="category-chip category-chip--income"
											onClick={() => handleOpenCategoryEdit(item)}
										>
											<span className="category-chip__label">{item.category}</span>
										</button>
									);
								})
							) : (
								<span className="muted">Няма категории за приходи.</span>
							)}
						</div>
					</div>

					<div className="category-visual-section category-visual-section--expense">
						<div className="category-visual-header">
							<h3>Разход</h3>
							<button type="button" className="button button--danger category-add-button" onClick={() => setCategoryForms((current) => ({ ...current, expense: !current.expense }))}>
								Добави категория
							</button>
						</div>
						{categoryForms.expense ? (
							<form
								className="category-form-inline"
								onSubmit={(event) => {
									event.preventDefault();
									void handleAddCategory("expense");
								}}
							>
								<input
									type="text"
									value={categoryDrafts.expense}
									onChange={(event) => setCategoryDrafts((current) => ({ ...current, expense: event.target.value }))}
									placeholder="Име на категория"
								/>
								<button type="submit" className="button button--danger category-submit-button">
									Запази
								</button>
							</form>
						) : null}
						<div className="category-chip-list">
							{expenseCategoryItems.length ? (
								expenseCategoryItems.map((item) => {
									const isEditing = editingCategory.id === item.id && editingCategory.type === "expense";
									if (isEditing) {
										return (
											<form key={`expense-edit-${item.id ?? item.category}`} className="category-form-inline" onSubmit={handleSaveCategoryEdit}>
												<input
													type="text"
													value={editingCategory.name}
													onChange={(event) => setEditingCategory((current) => ({ ...current, name: event.target.value }))}
												/>
												<div className="category-chip__actions">
													<button type="submit" className="category-chip__action">Запази</button>
													<button type="button" className="category-chip__action category-chip__action--danger" onClick={handleDeleteCategory}>Изтрий категория</button>
												</div>
											</form>
										);
									}

									return (
										<button
											key={`expense-${item.id ?? item.category}`}
											type="button"
											className="category-chip category-chip--expense"
											onClick={() => handleOpenCategoryEdit(item)}
										>
											<span className="category-chip__label">{item.category}</span>
										</button>
									);
								})
							) : (
								<span className="muted">Няма категории за разходи.</span>
							)}
						</div>
					</div>
				</div>
			</section>

			<section className="surface-card toolbar-card">
				<div className="surface-card__head">
					<h2>Нова транзакция</h2>
				</div>

				<div className="toolbar-actions">
					<button type="button" className="button button--success" onClick={() => openNewModal("income")}>
						+ Приход
					</button>
					<button type="button" className="button button--danger" onClick={() => openNewModal("expense")}>
						- Разход
					</button>
					<button type="button" className="button button--primary" onClick={triggerScan}>
						Сканирай касова бележка
					</button>
					<input
						type="file"
						accept="image/*"
						ref={scanInputRef}
						onChange={handleReceiptScan}
						style={{ display: "none" }}
					/>
				</div>
			</section>

			<section className="surface-card">
				<div className="surface-card__head">
					<h2>Хронология</h2>
					<div className="ledger-head-controls">
						<span className="muted">{filteredTransactions.length} резултата</span>
						<div className="ledger-type-toggle" role="group" aria-label="Филтър по тип">
							{typeFilterButtons.map((item) => (
								<button
									key={item.value}
									type="button"
									className={
										typeFilter === item.value
											? "ledger-type-toggle__button ledger-type-toggle__button--active"
											: "ledger-type-toggle__button"
									}
									onClick={() => setTypeFilter(item.value)}
								>
									{item.label}
								</button>
							))}
						</div>
					</div>
				</div>

				<div className="filter-grid transactions-filter-grid">
					<label>
						<span>Период</span>
						<select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}>
							<option value="all">Всичко</option>
							<option value="week">Тази седмица</option>
							<option value="lastMonth">Миналия месец</option>
						</select>
					</label>

					<label>
						<span>Портфейл</span>
						<select value={walletFilter} onChange={(event) => setWalletFilter(event.target.value)}>
							<option value="all">Всички</option>
							{walletOptions.map((wallet) => (
								<option key={wallet.name} value={wallet.name}>
									{wallet.name}
								</option>
							))}
						</select>
					</label>

					<label>
						<span>Категория</span>
						<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
							<option value="all">Всички</option>
							{allCategoryOptions.map((category) => (
								<option key={category} value={category}>
									{category}
								</option>
							))}
						</select>
					</label>
				</div>

				{loading ? <p className="muted">Зареждане на транзакции...</p> : null}
				{error ? <p className="muted">{error}</p> : null}

				{sortedDates.length ? (
					<div className="ledger-groups">
						{sortedDates.map((dateKey) => (
							<div key={dateKey} className="ledger-group">
								<h3>{formatDateHeader(dateKey)}</h3>
								<div className="ledger-list">
									{groupedTransactions[dateKey].map((entry) => {
										const isGoalTransfer = isTransferTransaction(entry);
										return (
										<button
											key={entry.id}
											type="button"
											className="ledger-item"
											onClick={() => openEditModal(entry)}
										>
											<div>
												<strong>{entry.title}</strong>
													<p>{entry.wallet} • {entry.category}</p>
											</div>
											<div className="ledger-item__meta">
												<span
													className={
														isGoalTransfer
															? "pill pill--warn"
															: entry.type === "income"
																? "pill pill--ok"
																: "pill pill--danger"
													}
												>
													{isGoalTransfer ? "Трансфер" : entry.type === "income" ? "Приход" : "Разход"}
												</span>
													<strong>
														{entry.type === "income" ? "+" : "-"}
														{formatEur(entry.amount)}
													</strong>
											</div>
										</button>
											);
										})}
								</div>
							</div>
						))}
					</div>
				) : (
					<p className="muted">Няма транзакции по зададените филтри.</p>
				)}
			</section>

			{isModalOpen ? (
				<div className="modal-shell" role="dialog" aria-modal="true" aria-label="Детайли за транзакция">
					<form className="surface-card modal-card" onSubmit={saveTransaction}>
						<div className="surface-card__head">
							<h2>{editingId ? "Редакция на транзакция" : "Нова транзакция"}</h2>
						</div>

						<div className="filter-grid">
							<label>
								<span>Тип</span>
								<select
									value={draft.type}
									onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}
								>
									<option value="income">Приход</option>
									<option value="expense">Разход</option>
								</select>
							</label>
							<label>
								<span>Име</span>
								<input
									type="text"
									value={draft.title}
									onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
								/>
							</label>
							<label>
								<span>Сума</span>
								<input
									type="number"
									step="0.01"
									min="0"
									value={draft.amount}
									onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
								/>
							</label>
							<label>
								<span>Портфейл</span>
								<select
									value={draft.wallet}
									onChange={(event) => setDraft((current) => ({ ...current, wallet: event.target.value }))}
								>
									<option value="">Избери портфейл</option>
									{walletOptions.map((wallet) => (
										<option key={wallet.name} value={wallet.name}>
											{wallet.name}
										</option>
									))}
								</select>
							</label>
							<label>
								<span>Категория</span>
								<select
									value={draft.category}
									onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
								>
									<option value="">Избери категория</option>
									{categoryOptions.map((category) => (
										<option key={category} value={category}>
											{category}
										</option>
									))}
								</select>
							</label>
						</div>

						{scanState.preview ? (
							<div className="receipt-preview-wrap">
								<img className="receipt-preview" src={scanState.preview} alt="Касова бележка" />
							</div>
						) : null}
						{scanState.isScanning ? <p className="muted">Сканиране…</p> : null}
						{scanState.error ? <p className="muted">{scanState.error}</p> : null}
						{scanState.rawText ? (
							<details className="scan-raw-text">
								<summary>OCR текст</summary>
								<p>{scanState.rawText}</p>
							</details>
						) : null}
						<label>
							<span>Бележка</span>
							<textarea
								rows="3"
								value={draft.note}
								onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
							/>
						</label>

						<div className="modal-actions">
							<button type="button" className="button button--ghost" onClick={closeModal}>
								Отказ
							</button>
							<button type="submit" className="button button--primary">
								Запази
							</button>
						</div>
					</form>
				</div>
			) : null}
		</div>
	);
}

export default Transactions;
