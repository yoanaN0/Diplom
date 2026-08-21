import { useCallback, useEffect, useState } from "react";

import {
  createTransaction,
  getTransactions,
  transactionsChangedEvent,
  updateTransaction,
} from "../services/transactionsApi";

export function useTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const next = await getTransactions();
      setTransactions(next);
    } catch {
      setError("Неуспешно зареждане на транзакциите.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleChanged = () => {
      void refresh();
    };

    const handleStorage = (event) => {
      if (event.key === "finly.transactions.v1") {
        void refresh();
      }
    };

    window.addEventListener(transactionsChangedEvent, handleChanged);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(transactionsChangedEvent, handleChanged);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refresh]);

  const add = useCallback(async (payload) => {
    setError("");
    try {
      const next = await createTransaction(payload);
      setTransactions(next);
      return true;
    } catch {
      setError("Неуспешно създаване на транзакция.");
      return false;
    }
  }, []);

  const edit = useCallback(async (id, payload) => {
    setError("");
    try {
      const next = await updateTransaction(id, payload);
      setTransactions(next);
      return true;
    } catch {
      setError("Неуспешно обновяване на транзакция.");
      return false;
    }
  }, []);

  return { transactions, loading, error, refresh, add, edit };
}
