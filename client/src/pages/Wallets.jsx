import { useEffect, useMemo, useState } from "react";

import { formatEur } from "../services/financeData";
import { transactionsChangedEvent } from "../services/transactionsApi";
import { createWallet, deleteWallet, getWallets, updateWallet } from "../services/walletsApi";

function Wallets() {
	const [cashWallets, setCashWallets] = useState([]);
	const [bankConnections, setBankConnections] = useState([]);
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
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		const loadWallets = async () => {
			setLoading(true);
			setError("");

			try {
				const items = await getWallets();
				setCashWallets(items.filter((item) => item.walletType === "cash"));
				setBankConnections(items.filter((item) => item.walletType === "bank"));
			} catch {
				setError("Неуспешно зареждане на портфейлите.");
			} finally {
				setLoading(false);
			}
		};

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
				lastSync: new Date().toISOString(),
				daysToReconnect: 90,
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
							<span className="pill pill--ok">Общо: {formatEur(totalCash)}</span>
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

					<div className="wallet-list">
						{cashWallets.map((wallet) => (
							<div key={wallet.id} className="wallet-item">
								<div>
									<strong>{wallet.name}</strong>
									<p>{formatEur(wallet.balance)}</p>
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
							<span className="pill pill--ok">Общо: {formatEur(totalBank)}</span>
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
									<span>{formatEur(bank.balance)}</span>
								</div>

								<div className="bank-item__actions">
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
