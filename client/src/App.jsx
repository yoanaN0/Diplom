import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

import Home from "./pages/Home";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import Dashboard from "./pages/Dashboard";
import Goals from "./pages/Goals";
import Transactions from "./pages/Transactions";
import Wallets from "./pages/Wallets";
import Budgets from "./pages/Budgets";
import Settings from "./pages/Settings";
import FinancialTwin from "./pages/FinancialTwin";
import Admin from "./pages/Admin";

import { isAdmin, isAuthenticated, syncAuthState } from "./services/authStorage";

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}

function ProtectedRoute({ children }) {
  return isAuthenticated() ? children : <Navigate to="/login" replace />;
}

function UserRoute({ children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (isAdmin()) {
    return <Navigate to="/admin" replace />;
  }

  return children;
}

function GuestRoute({ children }) {
  return isAuthenticated() ? <Navigate to="/dashboard" replace /> : children;
}

function AdminRoute({ children }) {
  return isAdmin() ? children : <Navigate to="/dashboard" replace />;
}

function App() {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const run = async () => {
      await syncAuthState();
      setAuthReady(true);
    };

    void run();
  }, []);

  if (!authReady) {
    return (
      <BrowserRouter>
        <ScrollToTop />
        <div className="app-shell">
          <Navbar />
          <main className="app-main">
            <div className="surface-card">
              <p className="muted">Зареждане на сесия...</p>
            </div>
          </main>
        </div>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <ScrollToTop />
      <div className="app-shell">
        <Navbar />

        <main className="app-main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route
              path="/login"
              element={(
                <GuestRoute>
                  <Login />
                </GuestRoute>
              )}
            />
            <Route
              path="/register"
              element={(
                <GuestRoute>
                  <Register />
                </GuestRoute>
              )}
            />
            <Route
              path="/verify-email"
              element={(
                <GuestRoute>
                  <VerifyEmail />
                </GuestRoute>
              )}
            />
            <Route
              path="/forgot-password"
              element={(
                <GuestRoute>
                  <ForgotPassword />
                </GuestRoute>
              )}
            />
            <Route
              path="/dashboard"
              element={(
                <UserRoute>
                  <Dashboard />
                </UserRoute>
              )}
            />
            <Route
              path="/goals"
              element={(
                <ProtectedRoute>
                  <Goals />
                </ProtectedRoute>
              )}
            />
            <Route
              path="/transactions"
              element={(
                <ProtectedRoute>
                  <Transactions />
                </ProtectedRoute>
              )}
            />
            <Route
              path="/wallets"
              element={(
                <ProtectedRoute>
                  <Wallets />
                </ProtectedRoute>
              )}
            />
            <Route
              path="/budgets"
              element={(
                <ProtectedRoute>
                  <Budgets />
                </ProtectedRoute>
              )}
            />
            <Route
              path="/financial-twin"
              element={(
                <ProtectedRoute>
                  <FinancialTwin />
                </ProtectedRoute>
              )}
            />
            <Route
              path="/settings"
              element={(
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              )}
            />
            <Route
              path="/admin"
              element={(
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              )}
            />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  );
}

export default App;