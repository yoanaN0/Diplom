import { useEffect, useMemo, useState } from "react";

import { formatEur } from "../services/financeData";
import { buildCsvImportPreview, buildCsvRowDedupeKey, evaluateCsvRowStatus, formatCsvImportSummary } from "../services/csvImport";
import { getCategories } from "../services/categoriesApi";
import { createTransactionDetailed, getTransactions, transactionsChangedEvent } from "../services/transactionsApi";
import { createWallet, deleteWallet, getWallets, updateWallet } from "../services/walletsApi";

const getSavedByWallet = (transactions = []) => {
	const totals = {};

	for (const transaction of Array.isArray(transactions) ? transactions : []) {
		const walletId = Number(transaction?.walletId ?? transaction?.wallet_id ?? 0);
		const goalId = Number(transaction?.goalId ?? transaction?.goal_id ?? 0);
		const amount = Number(transaction?.amount ?? 0);

		if (!walletId || !goalId || !Number.isFinite(amount) || amount <= 0) {
			continue;
		}

		totals[walletId] = (totals[walletId] ?? 0) + amount;
	}

	return totals;
};

function Wallets() {
	const [cashWallets, setCashWallets] = useState([]);
	const [bankConnections, setBankConnections] = useState([]);
	const [savedByWallet, setSavedByWallet] = useState({});
	const [cashDraft, setCashDraft] = useState({
		name: "",
		balance: "",
	});
	const [bankDraft, setBankDraft] = useState({
		name: "",
		bank: "",
		account: "",
		balance: "",
	});
	const [isCashModalOpen, setIsCashModalOpen] = useState(false);
	const [isBankModalOpen, setIsBankModalOpen] = useState(false);
	const [editingWallet, setEditingWallet] = useState(null);
	const [allTransactions, setAllTransactions] = useState([]);
	const [categoryOptions, setCategoryOptions] = useState([]);
	const [importDraft, setImportDraft] = useState({
		isOpen: false,
		walletId: null,
		walletName: "",
		preview: null,
	});
	const [isImporting, setIsImporting] = useState(false);
	const [importSummary, setImportSummary] = useState("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const loadWallets = async () => {
		setLoading(true);
		setError("");

		try {
			const [items, nextTransactions, nextCategories] = await Promise.all([
				getWallets(),
				getTransactions(),
				getCategories(),
			]);
			const nextCashWallets = items.filter((item) => item.walletType === "cash");
			const nextBankWallets = items.filter((item) => item.walletType === "bank");
			const nextCategoryOptions = Array.isArray(nextCategories) ? nextCategories : [];

			setAllTransactions(nextTransactions);
			setCashWallets(nextCashWallets);
			setBankConnections(nextBankWallets);
			setSavedByWallet(getSavedByWallet(nextTransactions));
			setCategoryOptions(nextCategoryOptions);
		} catch {
			setError("Неуспешно зареждане на портфейлите.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void loadWallets();

		const handleTransactionsChanged = () => {
			void loadWallets();
		};

		window.addEventListener(transactionsChangedEvent, handleTransactionsChanged);

		return () => {
			window.removeEventListener(transactionsChangedEvent, handleTransactionsChanged);
		};
	}, []);

	const totalCash = useMemo(
		() => cashWallets.reduce((sum, wallet) => sum + wallet.balance, 0),
		[cashWallets],
	);
	const totalBank = useMemo(
		() => bankConnections.reduce((sum, wallet) => sum + wallet.balance, 0),
		[bankConnections],
	);
	const totalSavedCash = useMemo(
		() => cashWallets.reduce((sum, wallet) => sum + Number(savedByWallet[wallet.id] ?? 0), 0),
		[cashWallets, savedByWallet],
	);
	const totalSavedBank = useMemo(
		() => bankConnections.reduce((sum, wallet) => sum + Number(savedByWallet[wallet.id] ?? 0), 0),
		[bankConnections, savedByWallet],
	);

	const openCsvImport = (walletId, walletName) => {
		const wallet = bankConnections.find((item) => Number(item.id) === Number(walletId));
		if (!wallet || wallet.walletType !== "bank") {
			return;
		}

		setImportDraft({
			isOpen: true,
			walletId: Number(walletId),
			walletName,
			preview: null,
		});
	};

	const closeCsvImport = () => {
		setImportDraft({
			isOpen: false,
			walletId: null,
			walletName: "",
			preview: null,
		});
	};

	const handleCsvImportFile = async (event) => {
		const file = event.target.files?.[0];
		if (!file || !importDraft.walletId) {
			return;
		}

		const csvText = await file.text();
		const preview = buildCsvImportPreview(csvText, {
			existingTransactions: allTransactions,
			walletId: importDraft.walletId,
			now: new Date(),
		});

		setImportDraft((current) => ({
			...current,
			preview,
		}));
		event.target.value = "";
	};

	const getCategoriesForType = (type = "expense") => {
		const normalizedType = type === "income" ? "income" : "expense";

		return Array.from(
			new Set(
				(categoryOptions || [])
					.filter((category) => {
						const categoryType = String(category?.categoryType ?? category?.type ?? "").toLowerCase();
						return !categoryType || categoryType === normalizedType;
					})
					.map((category) => category?.category ?? category?.name ?? "")
					.filter(Boolean),
			),
		);
	};

	const updateImportRow = (rowId, field, value) => {
		setImportDraft((current) => {
			if (!current.preview) {
				return current;
			}

			const currentSeenHashes = new Set(
				current.preview.rows
					.filter((row) => row.id !== rowId)
					.map((row) => buildCsvRowDedupeKey(row, current.walletId)),
			);

			const updatedRows = current.preview.rows.map((row) => {
				if (row.id !== rowId) {
					return row;
				}

				const updated = { ...row, [field]: value };
				if (field === "type") {
					updated.category = "";
				}
				const status = evaluateCsvRowStatus(updated, allTransactions, current.walletId, new Date(), currentSeenHashes);
				return { ...updated, ...status };
			});

			return {
				...current,
				preview: {
					...current.preview,
					rows: updatedRows,
					validRows: updatedRows.filter((row) => row.status === "valid").length,
					duplicateRows: updatedRows.filter((row) => row.status === "duplicate").length,
					invalidRows: updatedRows.filter((row) => row.status === "invalid").length,
					outsideWindowRows: updatedRows.filter((row) => row.status === "outsideWindow").length,
				},
			};
		});
	};

	const rowsReadyForCsvImport = importDraft.preview?.rows ?? [];
	const hasMissingCategoriesForValidRows = rowsReadyForCsvImport
		.filter((row) => row.status === "valid")
		.some((row) => !row.category || !String(row.category).trim());

	const saveCsvImport = async () => {
		if (!importDraft.preview || !importDraft.walletId || isImporting) {
			return;
		}

		const rowsToSave = importDraft.preview.rows.filter((row) => row.status === "valid");

		if (!rowsToSave.length) {
			setError("Няма валидни редове за запис.");
			return;
		}

		const missingCategoryRows = rowsToSave.filter((row) => !row.category || !String(row.category).trim());
		if (missingCategoryRows.length) {
			setError("Моля, изберете категория за всички валидни транзакции преди запис.");
			return;
		}

		setIsImporting(true);
		setError("");
		setImportSummary("");

		let insertedCount = 0;
		let skippedServerDuplicates = 0;
		let failedCount = 0;

		try {
			for (const row of rowsToSave) {
				try {
					const result = await createTransactionDetailed({
					type: row.type || "expense",
					title: row.description || "CSV транзакция",
					amount: Math.abs(Number(row.amount || 0)),
					wallet: importDraft.walletName,
					walletId: importDraft.walletId,
					category: row.category || "Общи",
					note: `CSV импорт • ${row.date || new Date().toISOString().slice(0, 10)}`,
					tags: ["#csv-import"],
					sourceType: "csv",
					externalReference: row.externalReference || "",
					date: row.date || new Date().toISOString(),
					});

					if (result?.duplicate) {
						skippedServerDuplicates += 1;
					} else if (result?.transaction) {
						insertedCount += 1;
					}
				} catch {
					failedCount += 1;
				}
			}

			const summary = `Добавени: ${insertedCount} · Пропуснати дубликати: ${importDraft.preview.duplicateRows + skippedServerDuplicates} · Невалидни: ${importDraft.preview.invalidRows} · Извън периода: ${importDraft.preview.outsideWindowRows}`;
			setImportSummary(summary);

			let syncFailed = false;
			try {
				await updateWallet({
					id: importDraft.walletId,
					lastSync: new Date().toISOString(),
				});
				await loadWallets();
			} catch {
				syncFailed = true;
			}

			closeCsvImport();
			if (failedCount > 0) {
				setError(`Импортът приключи частично. Незаписани редове заради грешка: ${failedCount}.`);
			} else if (syncFailed) {
				setError("Транзакциите са записани, но опресняването на данните не бе успешно.");
			}
		} catch {
			setError("Неуспешен импорт на CSV файл.");
		} finally {
			setIsImporting(false);
		}
	};

	const handleAddCashWallet = async (event) => {
		event.preventDefault();
		if (!cashDraft.name.trim()) {
			return;
		}

		try {
			const created = await createWallet({
				walletType: "cash",
				name: cashDraft.name.trim(),
				balance: Number(cashDraft.balance || 0),
				bank: "",
				account: "",
				status: "",
				lastSync: null,
				daysToReconnect: null,
				isActive: true,
			});

			setCashWallets((current) => [...current, created]);
			setCashDraft({ name: "", balance: "" });
			setIsCashModalOpen(false);
		} catch {
			setError("Неуспешно създаване на кеш портфейл.");
		}
	};

	const handleAddBankWallet = async (event) => {
		event.preventDefault();
		if (!bankDraft.name.trim()) {
			return;
		}

		try {
			const created = await createWallet({
				walletType: "bank",
				name: bankDraft.name.trim(),
				balance: Number(bankDraft.balance || 0),
				bank: bankDraft.bank.trim(),
				account: bankDraft.account.trim(),
				status: "Свързана",
				lastSync: null,
				daysToReconnect: null,
				isActive: true,
			});

			setBankConnections((current) => [...current, created]);
			setBankDraft({ name: "", bank: "", account: "", balance: "" });
			setIsBankModalOpen(false);
		} catch {
			setError("Неуспешно създаване на карта/банкова връзка.");
		}
	};

	const openEditWallet = (wallet, type) => {
		setEditingWallet({
			type,
			id: wallet.id,
			name: wallet.name,
			balance: String(wallet.balance ?? 0),
			bank: wallet.bank || "",
			account: wallet.account || "",
		});
	};

	const closeEditWallet = () => setEditingWallet(null);

	const saveEditedWallet = async (event) => {
		event.preventDefault();
		if (!editingWallet || !editingWallet.name.trim()) {
			return;
		}

		try {
			const payload = {
				id: editingWallet.id,
				name: editingWallet.name.trim(),
				walletType: editingWallet.type,
				bank: editingWallet.type === "bank" ? editingWallet.bank.trim() : "",
				account: editingWallet.type === "bank" ? editingWallet.account.trim() : "",
			};

			const updated = await updateWallet(payload);

			if (editingWallet.type === "cash") {
				setCashWallets((current) => current.map((wallet) => (wallet.id === editingWallet.id ? updated : wallet)));
			} else {
				setBankConnections((current) => current.map((wallet) => (wallet.id === editingWallet.id ? updated : wallet)));
			}

			closeEditWallet();
		} catch {
			setError("Неуспешно редактиране на портфейла.");
		}
	};

	const removeWallet = async (id, type) => {
		const confirmed = window.confirm("Сигурни ли сте, че искате да премахнете този портфейл?");
		if (!confirmed) {
			return;
		}

		try {
			await deleteWallet(id);

			if (type === "cash") {
				setCashWallets((current) => current.filter((wallet) => wallet.id !== id));
			} else {
				setBankConnections((current) => current.filter((wallet) => wallet.id !== id));
			}
		} catch {
			setError("Неуспешно премахване на портфейла.");
		}
	};

	return (
		<div className="finance-page wallets-page">
			<section className="finance-header">
				<div>
					<h1>Портфейли</h1>
					<p>Управлявай кеш портфейлите и банковите връзки на едно място.</p>
				</div>
			</section>

			<section className="wallets-layout">
				<article className="surface-card">
					<div className="surface-card__head">
						<h2>Кеш портфейли</h2>
						<div className="surface-card__head-actions">
							<span className="pill pill--ok">Общо налични: {formatEur(totalCash)}</span>
							<span className="pill pill--ok">Общо спестени: {formatEur(totalSavedCash)}</span>
							<button
								type="button"
								className="button button--primary"
								onClick={() => setIsCashModalOpen(true)}
							>
								Добави
							</button>
						</div>
					</div>

					{loading ? <p className="muted">Зареждане на портфейли...</p> : null}
					{error ? <p className="muted">{error}</p> : null}
					{importSummary ? <p className="muted">{importSummary}</p> : null}

					<div className="wallet-list">
						{cashWallets.map((wallet) => (
							<div key={wallet.id} className="wallet-item">
								<div className="wallet-item__meta">
									<strong>{wallet.name}</strong>
								<p className="wallet-item__amount">
									<span className="wallet-item__label">Налично:</span> {formatEur(wallet.balance)}
									</p>
									<span className="wallet-item__saved">
										Спестени: {formatEur(Number(savedByWallet[wallet.id] ?? 0))}
									</span>
								</div>
								<div className="wallet-item__actions">
									<button
										type="button"
										className="button button--ghost"
										onClick={() => openEditWallet(wallet, "cash")}
									>
										Редактирай
									</button>
									<button
										type="button"
										className="button button--ghost"
										onClick={() => removeWallet(wallet.id, "cash")}
									>
										Премахни
									</button>
								</div>
							</div>
						))}
					</div>
				</article>

				<article className="surface-card">
					<div className="surface-card__head">
						<h2>Карти</h2>
						<div className="surface-card__head-actions">
							<span className="pill pill--ok">Общо налични: {formatEur(totalBank)}</span>
							<span className="pill pill--ok">Общо спестени: {formatEur(totalSavedBank)}</span>
							<button
								type="button"
								className="button button--primary"
								onClick={() => setIsBankModalOpen(true)}
							>
								Добави
							</button>
						</div>
					</div>

					<div className="bank-list">
						{bankConnections.map((bank) => (
							<div key={bank.id} className="bank-item">
								<div className="bank-item__main">
									<span className="bank-logo">{bank.bank.slice(0, 2).toUpperCase()}</span>
									<div>
										<strong>{bank.bank}</strong>
										<p>{bank.account}</p>
									</div>
								</div>

								<div className="bank-item__meta">
									<span className="bank-item__amount">
										<span className="bank-item__label">Налично:</span> {formatEur(bank.balance)}
									</span>
									<span className="bank-item__saved">
										Спестени: {formatEur(Number(savedByWallet[bank.id] ?? 0))}
									</span>
								</div>

								<div className="bank-item__actions">
									<button
										type="button"
										className="button button--ghost"
										onClick={() => openCsvImport(bank.id, bank.name)}
										title="Импорт на CSV"
									>
										CSV
									</button>
									<button type="button" className="button button--ghost" onClick={() => openEditWallet(bank, "bank")}>
										Редактирай
									</button>
									<button type="button" className="button button--ghost" onClick={() => removeWallet(bank.id, "bank")}>
										Премахни
									</button>
								</div>
							</div>
						))}
					</div>
				</article>
			</section>

			{importDraft.isOpen ? (
				<div className="modal-shell" role="dialog" aria-modal="true" aria-label="CSV импорт">
					<div className="surface-card modal-card">
						<div className="surface-card__head">
							<h2>CSV импорт • {importDraft.walletName}</h2>
						</div>

						<div className="filter-grid">
							<label>
								<span>CSV файл</span>
								<input type="file" accept=".csv,text/csv" onChange={handleCsvImportFile} />
							</label>
						</div>

						{importDraft.preview ? (
							<>
								<p className="muted">{formatCsvImportSummary(importDraft.preview)}</p>
								<div className="table-scroll">
									<table>
										<thead>
											<tr>
												<th>Дата</th>
												<th>Описание</th>
												<th>Сума</th>
												<th>Тип</th>
												<th>Категория</th>
												<th>Статус</th>
											</tr>
										</thead>
										<tbody>
											{importDraft.preview.rows.map((row) => (
												<tr key={row.id}>
													<td>
														<input
															type="date"
															value={row.date}
															onChange={(event) => updateImportRow(row.id, "date", event.target.value)}
														/>
													</td>
													<td>
														<input
															type="text"
															value={row.description}
															onChange={(event) => updateImportRow(row.id, "description", event.target.value)}
														/>
													</td>
													<td>
														<input
															type="number"
															step="0.01"
															value={row.amount}
															onChange={(event) => updateImportRow(row.id, "amount", Number(event.target.value))}
														/>
													</td>
													<td>
														<select
															value={row.type}
															onChange={(event) => updateImportRow(row.id, "type", event.target.value)}
														>
															<option value="expense">Разход</option>
															<option value="income">Приход</option>
														</select>
													</td>
													<td>
															{(() => {
																const rowCategories = getCategoriesForType(row.type || "expense");
																const selectedCategory = row.category && rowCategories.includes(row.category) ? row.category : "";

																return (
																	<select
																		value={selectedCategory}
																		onChange={(event) => updateImportRow(row.id, "category", event.target.value)}
																	>
																		<option value="">Избери категория</option>
																		{Array.from(new Set([...rowCategories, ...(selectedCategory ? [selectedCategory] : [])]))
																			.filter((category) => category !== "")
																			.map((category) => (
																				<option key={category} value={category}>
																					{category}
																				</option>
																			))}
																	</select>
																);
															})()}
													</td>
													<td>
														<span className={`pill ${row.status === "valid" ? "pill--ok" : row.status === "duplicate" ? "pill--warn" : "pill--danger"}`}>
															{row.status}
														</span>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</>
						) : null}

						{error ? <p className="muted">{error}</p> : null}

						<div className="modal-actions">
							<button type="button" className="button button--ghost" onClick={closeCsvImport}>
								Отказ
							</button>
							<button
								type="button"
								className="button button--primary"
								onClick={saveCsvImport}
								disabled={isImporting || hasMissingCategoriesForValidRows}
							>
								{isImporting ? "Импортиране..." : "Запиши транзакциите"}
							</button>
						</div>
					</div>
				</div>
			) : null}

			{isCashModalOpen ? (
				<div className="modal-shell" role="dialog" aria-modal="true" aria-label="Добавяне на кеш портфейл">
					<form className="surface-card modal-card" onSubmit={handleAddCashWallet}>
						<div className="surface-card__head">
							<h2>Нов кеш портфейл</h2>
						</div>

						<div className="filter-grid">
							<label>
								<span>Име</span>
								<input
									type="text"
									placeholder="напр. Джобни"
									value={cashDraft.name}
									onChange={(event) => setCashDraft((current) => ({ ...current, name: event.target.value }))}
								/>
							</label>

							<label>
								<span>Начална сума</span>
								<input
									type="number"
									step="0.01"
									min="0"
									placeholder="0.00"
									value={cashDraft.balance}
									onChange={(event) => setCashDraft((current) => ({ ...current, balance: event.target.value }))}
								/>
							</label>
						</div>

						<div className="modal-actions">
							<button type="button" className="button button--ghost" onClick={() => setIsCashModalOpen(false)}>
								Отказ
							</button>
							<button type="submit" className="button button--primary">
								Добави
							</button>
						</div>
					</form>
				</div>
			) : null}

			{isBankModalOpen ? (
				<div className="modal-shell" role="dialog" aria-modal="true" aria-label="Добавяне на карта или банка">
					<form className="surface-card modal-card" onSubmit={handleAddBankWallet}>
						<div className="surface-card__head">
							<h2>Нова карта / банка</h2>
						</div>

						<div className="filter-grid">
							<label>
								<span>Име на карта / банка</span>
								<input
									type="text"
									placeholder="напр. Visa / Raiffeisen"
									value={bankDraft.name}
									onChange={(event) => setBankDraft((current) => ({ ...current, name: event.target.value }))}
								/>
							</label>

							<label>
								<span>Банка</span>
								<input
									type="text"
									placeholder="Име на банка"
									value={bankDraft.bank}
									onChange={(event) => setBankDraft((current) => ({ ...current, bank: event.target.value }))}
								/>
							</label>

							<label>
								<span>Последни 4 цифри</span>
								<input
									type="text"
									placeholder="1234"
									value={bankDraft.account}
									onChange={(event) => setBankDraft((current) => ({ ...current, account: event.target.value }))}
								/>
							</label>

							<label>
								<span>Начална сума</span>
								<input
									type="number"
									step="0.01"
									min="0"
									placeholder="0.00"
									value={bankDraft.balance}
									onChange={(event) => setBankDraft((current) => ({ ...current, balance: event.target.value }))}
								/>
							</label>
						</div>

						<div className="modal-actions">
							<button type="button" className="button button--ghost" onClick={() => setIsBankModalOpen(false)}>
								Отказ
							</button>
							<button type="submit" className="button button--primary">
								Добави
							</button>
						</div>
					</form>
				</div>
			) : null}

			{editingWallet ? (
				<div className="modal-shell" role="dialog" aria-modal="true" aria-label="Редактиране на портфейл">
					<form className="surface-card modal-card" onSubmit={saveEditedWallet}>
						<div className="surface-card__head">
							<h2>{editingWallet.type === "cash" ? "Редактирай кеш портфейл" : "Редактирай карта / банка"}</h2>
						</div>

						<div className="filter-grid">
							<label>
								<span>Име</span>
								<input
									type="text"
									value={editingWallet.name}
									onChange={(event) => setEditingWallet((current) => ({ ...current, name: event.target.value }))}
								/>
							</label>

							{editingWallet.type === "bank" ? (
								<>
									<label>
										<span>Банка</span>
										<input
											type="text"
											value={editingWallet.bank}
											onChange={(event) => setEditingWallet((current) => ({ ...current, bank: event.target.value }))}
										/>
									</label>

									<label>
										<span>Последни 4 цифри</span>
										<input
											type="text"
											value={editingWallet.account}
											onChange={(event) => setEditingWallet((current) => ({ ...current, account: event.target.value }))}
										/>
									</label>
								</>
							) : null}
						</div>

						<div className="modal-actions">
							<button type="button" className="button button--ghost" onClick={closeEditWallet}>
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

export default Wallets;
