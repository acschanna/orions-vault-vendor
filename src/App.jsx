import React, { useState, useEffect, createContext, useContext, useRef } from "react";
import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  addDoc,
  query,
  orderBy,
  updateDoc
} from "firebase/firestore";
import TradeTab from "./TradeTab.jsx";
import Inventory from "./Inventory.jsx";
import CardLookup from "./CardLookup.jsx";
import TradeHistory from "./TradeHistory.jsx";
import ShowHistory from "./ShowHistory.jsx";
import { ShowProvider, useShow } from "./ShowContext";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import "./App.css";

const accentGreen = "#00b84a";
const blueLine = "#85c9ff";
const cardDark = "#181b1e";
const fontFamily = `'Inter', Arial, Helvetica, sans-serif`;

const UserContext = createContext(null);
export const useUser = () => useContext(UserContext);

// --- DB helpers (unchanged) ---
async function getInventory(uid) {
  const invRef = collection(db, "users", uid, "inventory");
  const q = query(invRef, orderBy("dateAdded", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}
async function getUserFields(uid) {
  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) return {};
  return userDoc.data();
}
async function setUserFields(uid, fields) {
  await setDoc(doc(db, "users", uid), fields, { merge: true });
}
async function getDashboardLog(uid) {
  const logRef = collection(db, "users", uid, "dashboardLog");
  const q = query(logRef, orderBy("ts", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}
async function addDashboardLogSample(uid, value, cash) {
  const logRef = collection(db, "users", uid, "dashboardLog");
  await addDoc(logRef, {
    ts: Date.now(),
    value,
    cash,
  });
  const snap = await getDocs(query(logRef, orderBy("ts", "asc")));
  if (snap.docs.length > 48) {
    for (let i = 0; i < snap.docs.length - 48; i++) {
      await snap.docs[i].ref.delete();
    }
  }
}

// --- LOGIN/REGISTER SCREEN ---
function LoginScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    signInWithEmailAndPassword(auth, email, password)
      .catch(() => {
        setError("Invalid email or password.");
        setLoading(false);
      });
  }
  function handleRegister(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    createUserWithEmailAndPassword(auth, email, password)
      .then(async (cred) => {
        await setUserFields(cred.user.uid, {
          cashOnHand: 0,
          pendingCardSales: 0,
        });
        setLoading(false);
      })
      .catch((err) => {
        if (err.code === "auth/email-already-in-use") setError("Email already in use.");
        else setError("Registration error.");
        setLoading(false);
      });
  }
  // --- for fade ---
  const [bgFade, setBgFade] = useState("show-bg");
  useEffect(() => {
    setBgFade("fade-bg");
    setTimeout(() => setBgFade("show-bg"), 50);
  }, []);
  return (
    <div className="login-root">
      <div className={bgFade + " login-bg"} />
      <div className="login-centerer">
        <div className="login-box">
          <img src="/logo.png" alt="logo" className="login-logo" />
          <div className="login-title">Orion's Vault</div>
          <div className="login-subtitle">{mode === "login" ? "Vendor Login" : "Register"}</div>
          <form onSubmit={mode === "login" ? handleLogin : handleRegister}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              autoFocus
              onChange={e => setEmail(e.target.value)}
              className="login-input"
              disabled={loading}
            />
            <input
              placeholder="Password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="login-input"
              disabled={loading}
            />
            {error && <div className="login-error">{error}</div>}
            <button
              type="submit"
              className="login-btn"
              disabled={loading}
            >
              {mode === "login" ? (loading ? "Logging in..." : "Login") : (loading ? "Creating..." : "Create Account")}
            </button>
          </form>
          <div className="login-toggle">
            {mode === "login" ? (
              <>
                Don't have an account?{" "}
                <span className="login-toggle-link" onClick={() => { setMode("register"); setError(""); }}>
                  Register
                </span>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <span className="login-toggle-link" onClick={() => { setMode("login"); setError(""); }}>
                  Login
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- MAIN APP ---
function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Dashboard state
  const [inventory, setInventory] = useState([]);
  const [cashOnHand, setCashOnHand] = useState(0);
  const [pendingCardSales, setPendingCardSales] = useState(0);
  const [dashboardLog, setDashboardLog] = useState([]);
  const [fundsAdjust, setFundsAdjust] = useState("");
  const [fundsError, setFundsError] = useState("");

  // Show Mode state (for modal/button)
  const { showActive, setShowActive } = useShow() || {};
  const [showModeModalOpen, setShowModeModalOpen] = useState(false);
  const [showNameInput, setShowNameInput] = useState("");

  // ==== Graph timeframe selector state ====
  const [graphTimeframe, setGraphTimeframe] = useState("1M");

  // === Dynamic Backgrounds ===
  const backgroundImages = {
    dashboard: "/pokemon-bg.png",
    trade: "/trade-bg.png",
    inventory: "/inventory-bg.png",
    lookup: "/lookup-bg.png",
    history: "/history-bg.png",
    shows: "/shows-bg.png"
  };
  const backgroundImageUrl = backgroundImages[tab] || backgroundImages.dashboard;

  // === Fade Logic ===
  const [bgFade, setBgFade] = useState("show-bg");
  const prevTabRef = useRef(tab);

  useEffect(() => {
    if (prevTabRef.current !== tab) {
      setBgFade("fade-bg");
      setTimeout(() => {
        setBgFade("show-bg");
        prevTabRef.current = tab;
      }, 350);
    }
  }, [tab]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!firebaseUser) {
      setInventory([]);
      setCashOnHand(0);
      setPendingCardSales(0);
      setDashboardLog([]);
      return;
    }
    let cancelled = false;
    async function fetchAll() {
      setLoading(true);
      const inv = await getInventory(firebaseUser.uid);
      if (!cancelled) setInventory(inv);

      const userFields = await getUserFields(firebaseUser.uid);
      if (!cancelled) {
        setCashOnHand(Number(userFields.cashOnHand || 0));
        setPendingCardSales(Number(userFields.pendingCardSales || 0));
      }

      const log = await getDashboardLog(firebaseUser.uid);
      if (!cancelled) setDashboardLog(log);

      setLoading(false);
    }
    fetchAll();
    return () => { cancelled = true; };
  }, [firebaseUser, tab]);

  const inventoryValue = inventory.reduce((sum, c) => sum + (Number(c.marketValue) || 0), 0);

  async function adjustFunds(type) {
    let amt = Number(fundsAdjust);
    if (isNaN(amt) || amt <= 0) {
      setFundsError("Enter a valid amount!");
      return;
    }
    let current = cashOnHand;
    if (type === "subtract" && amt > current) {
      setFundsError("Not enough funds.");
      return;
    }
    let newTotal = type === "add" ? current + amt : current - amt;
    await setUserFields(firebaseUser.uid, { cashOnHand: newTotal });
    setCashOnHand(newTotal);
    setFundsAdjust("");
    setFundsError("");
    await addDashboardLogSample(firebaseUser.uid, inventoryValue, newTotal);
    setDashboardLog(await getDashboardLog(firebaseUser.uid));
  }

  async function clearCardSales() {
    await setUserFields(firebaseUser.uid, { pendingCardSales: 0 });
    setPendingCardSales(0);
    await addDashboardLogSample(firebaseUser.uid, inventoryValue, cashOnHand);
    setDashboardLog(await getDashboardLog(firebaseUser.uid));
  }

  // === SHOW MODE FUNCTIONS ===
  async function startShow() {
    if (!firebaseUser?.uid || !showNameInput.trim()) return;
    const showData = {
      showName: showNameInput,
      startTime: Date.now(),
      endTime: null
    };
    const docRef = await addDoc(collection(db, "users", firebaseUser.uid, "shows"), showData);
    setShowActive({ ...showData, id: docRef.id });
    setShowModeModalOpen(false);
    setShowNameInput("");
  }

  async function endShow() {
    if (!firebaseUser?.uid || !showActive?.id) return;
    await updateDoc(doc(db, "users", firebaseUser.uid, "shows", showActive.id), {
      endTime: Date.now()
    });
    setShowActive(null);
  }

  function handleLogout() {
    signOut(auth);
    setTab("dashboard");
  }

  // ====== Graph Timeframe Filtering Logic ======
  function getTimeframeMs(tf) {
    const day = 24 * 60 * 60 * 1000;
    switch (tf) {
      case "1Y": return 365 * day;
      case "6M": return 183 * day;
      case "3M": return 92 * day;
      case "1M": return 31 * day;
      case "1W": return 7 * day;
      case "1D": return 1 * day;
      default: return 31 * day;
    }
  }
  const now = Date.now();
  const chartData = (dashboardLog.length
    ? dashboardLog.filter(log => log.ts > now - getTimeframeMs(graphTimeframe))
    : [{ ts: now, value: inventoryValue, cash: cashOnHand }]
  ).map(log => ({
    time:
      graphTimeframe === "1D" || graphTimeframe === "1W"
        ? new Date(log.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : new Date(log.ts).toLocaleDateString(),
    Inventory: log.value,
    Cash: log.cash
  }));

  // Responsive: detect mobile with window width
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Navigation Tab List
  const NAV_TABS = [
    { label: "Dashboard", id: "dashboard" },
    { label: "Trade", id: "trade" },
    { label: "Inventory", id: "inventory" },
    { label: "Card Lookup", id: "lookup" },
    { label: "Trade History", id: "history" },
    { label: "Show History", id: "shows" }
  ];

  if (!firebaseUser) {
    return <LoginScreen />;
  }

  return (
    <UserContext.Provider value={firebaseUser}>
      <ShowProvider>
        <div className={`app-bg`}>
          {/* 15% opacity background image layer */}
          <div
            className={bgFade}
            style={{
              position: "fixed",
              zIndex: 0,
              top: 0, left: 0, right: 0, bottom: 0,
              pointerEvents: "none",
              backgroundImage: `url(${backgroundImageUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              opacity: 1.0,
              transition: "opacity 0.5s"
            }}
          />
          <div className="bg-overlay" style={{ position: "relative", zIndex: 1 }}>
            {/* Header */}
            <div className="header">
              <img
                src="/logo.png"
                alt="Orion's Vault Logo"
                className="header-logo"
              />
              <div className="header-title">
                Orion's Vault Vendor Companion
              </div>
              <button
                onClick={handleLogout}
                className="logout-btn"
              >
                Log out
              </button>
            </div>

            {/* Navigation Tabs */}
            {!isMobile ? (
              <div className="tabs">
                {NAV_TABS.map(tabInfo => (
                  <button
                    key={tabInfo.id}
                    className={`tab-btn${tab === tabInfo.id ? " active" : ""}`}
                    onClick={() => setTab(tabInfo.id)}
                  >
                    {tabInfo.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mobile-nav">
                <button
                  className="burger-btn"
                  aria-label="Open navigation menu"
                  onClick={() => setMobileMenuOpen(m => !m)}
                >
                  <span className="burger-icon" />
                </button>
                {mobileMenuOpen && (
                  <div className="mobile-dropdown">
                    {NAV_TABS.map(tabInfo => (
                      <button
                        key={tabInfo.id}
                        className={`mobile-dropdown-item${tab === tabInfo.id ? " active" : ""}`}
                        onClick={() => {
                          setTab(tabInfo.id);
                          setMobileMenuOpen(false);
                        }}
                      >
                        {tabInfo.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Dashboard Graph and Widgets */}
            {tab === "dashboard" && (
              <div className="dashboard-card">
                {/* SHOW MODE BUTTON/MODAL */}
                <div className="show-btn-row">
                  {!showActive ? (
                <button className="trade-modal-btn green-btn show-btn-lg" onClick={() => setShowModeModalOpen(true)}>
                      Start Show
                    </button>
                  ) : (
                    <button className="trade-modal-btn red-btn" onClick={endShow}>
                      End Show{showActive.showName ? ` (${showActive.showName})` : ""}
                    </button>
                  )}
                </div>
                {showModeModalOpen && (
                  <div className="trade-modal-bg">
                    <div className="trade-modal">
                      <div className="trade-modal-title">Start Show Mode</div>
                      <input
                        className="trade-modal-input"
                        type="text"
                        placeholder="Show Name"
                        value={showNameInput}
                        onChange={e => setShowNameInput(e.target.value)}
                        autoFocus
                      />
                      <div className="trade-modal-btn-row">
                        <button className="trade-modal-btn green-btn" onClick={startShow} disabled={!showNameInput.trim()}>
                          Start
                        </button>
                        <button className="trade-modal-cancel-btn" onClick={() => setShowModeModalOpen(false)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* --- Dashboard Widgets --- */}
                <div className="dashboard-widgets">
                  <div className="dashboard-widget cash-widget">
                    <div className="dashboard-widget-title">Cash on Hand</div>
                    <div className="dashboard-widget-value">
                      ${cashOnHand.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="dashboard-widget inv-widget">
                    <div className="dashboard-widget-title">Inventory Value</div>
                    <div className="dashboard-widget-value">
                      ${inventoryValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="dashboard-widget pending-widget">
                    <div className="dashboard-widget-title">Pending Card Sales</div>
                    <div className="dashboard-widget-value">
                      ${pendingCardSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <button className="clear-card-btn" onClick={clearCardSales}>
                      Clear Card Transactions
                    </button>
                  </div>
                </div>
                <div className="funds-adjust-box">
                  <div className="funds-title">Adjust Funds</div>
                  <div className="funds-row">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={fundsAdjust || ""}
                      onChange={e => {
                        setFundsAdjust(e.target.value);
                        setFundsError("");
                      }}
                      className="funds-input"
                      placeholder="Amount"
                    />
                    <span className="funds-dollar">$</span>
                  </div>
                  {fundsError && <div className="funds-error">{fundsError}</div>}
                  <button className="green-btn funds-btn" onClick={() => adjustFunds("add")}>
                    Add Funds
                  </button>
                  <button className="red-btn funds-btn" onClick={() => adjustFunds("subtract")}>
                    Subtract Funds
                  </button>
                </div>
                <div className="dashboard-graph-controls">
                  {["1Y", "6M", "3M", "1M", "1W", "1D"].map(tf => (
                    <button
                      key={tf}
                      className={`graph-btn${graphTimeframe === tf ? " active" : ""}`}
                      onClick={() => setGraphTimeframe(tf)}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
                <div className="dashboard-trend-title">
                  Value Trend ({graphTimeframe} Selected)
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  {chartData.length === 0 ? (
                    <div style={{ color: "#aaa", padding: 40, textAlign: "center" }}>No data for selected range.</div>
                  ) : (
                    <LineChart data={chartData}>
                      <CartesianGrid stroke="#232" strokeDasharray="4" />
                      <XAxis dataKey="time" tick={{ fill: "#cfc" }} />
                      <YAxis tick={{ fill: "#cfc" }} domain={["auto", "auto"]} />
                      <Tooltip
                        contentStyle={{
                          background: cardDark,
                          border: "1px solid #233",
                          color: "#fff",
                        }}
                        labelStyle={{ color: "#fff" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="Inventory"
                        name="Inventory Value"
                        stroke={blueLine}
                        strokeWidth={3}
                        dot={{ fill: blueLine }}
                      />
                      <Line
                        type="monotone"
                        dataKey="Cash"
                        name="Cash on Hand"
                        stroke={accentGreen}
                        strokeWidth={3}
                        dot={{ fill: accentGreen }}
                      />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}

            {/* Tab Content */}
            <div className="tab-content">
              {tab === "dashboard" && (
                <div style={{ color: "#fff" }}>
                  <h2 style={{ color: accentGreen, marginTop: 0 }}>
                    Welcome to Orion's Vault Vendor Companion
                  </h2>
                  <p>
                    Use the tabs above to manage your inventory, lookup cards, or
                    start a trade.
                  </p>
                  <div style={{ color: "#aaa", fontSize: 15, marginTop: 28 }}>
                    <b>Logged in as:</b> {firebaseUser.email}
                  </div>
                </div>
              )}
              {tab === "trade" && <TradeTab />}
              {tab === "inventory" && <Inventory />}
              {tab === "lookup" && <CardLookup />}
              {tab === "history" && <TradeHistory />}
              {tab === "shows" && <ShowHistory />}
            </div>
          </div>
        </div>
      </ShowProvider>
    </UserContext.Provider>
  );
}

export default App;
