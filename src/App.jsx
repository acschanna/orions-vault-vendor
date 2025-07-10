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
  updateDoc,
  addDoc,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import TradeTab from "./TradeTab.jsx";
import Inventory from "./Inventory.jsx";
import CardLookup from "./CardLookup.jsx";
import TradeHistory from "./TradeHistory.jsx";
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
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        minWidth: "100vw",
        fontFamily,
        color: "#fff",
        backgroundColor: "#181b1e"
      }}
    >
      {/* 15% opacity login bg layer */}
      <div
        className={bgFade}
        style={{
          position: "fixed",
          zIndex: 0,
          top: 0, left: 0, right: 0, bottom: 0,
          pointerEvents: "none",
          backgroundImage: 'url("/login-bg.png")',
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          opacity: 0.15,
          transition: "opacity 0.5s"
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <div
          style={{
            background: cardDark,
            padding: 36,
            borderRadius: 16,
            boxShadow: "0 2px 32px #0e1f13",
            minWidth: 350,
            maxWidth: 380,
            border: `2.5px solid ${accentGreen}80`
          }}
        >
          <img src="/logo.png" alt="logo" style={{ width: 250, margin: "0 auto 10px", display: "block" }} />
          <div style={{ fontWeight: 800, fontSize: 28, color: accentGreen, textAlign: "center" }}>Orion's Vault</div>
          <div style={{ fontWeight: 600, fontSize: 18, color: "#fff", marginBottom: 22, textAlign: "center" }}>{mode === "login" ? "Vendor Login" : "Register"}</div>
          <form onSubmit={mode === "login" ? handleLogin : handleRegister}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              autoFocus
              onChange={e => setEmail(e.target.value)}
              style={{
                width: "100%", padding: 12, fontSize: 18, borderRadius: 7, border: "1.5px solid #444", background: "#191f18", color: "#fff", marginBottom: 18
              }}
              disabled={loading}
            />
            <input
              placeholder="Password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                width: "100%", padding: 12, fontSize: 18, borderRadius: 7, border: "1.5px solid #444", background: "#191f18", color: "#fff", marginBottom: 14
              }}
              disabled={loading}
            />
            {error && <div style={{ color: "#f55", marginBottom: 10, fontWeight: 600 }}>{error}</div>}
            <button type="submit" style={{
              background: accentGreen, color: "#181b1e", border: "none", borderRadius: 7, fontWeight: 800, fontSize: 19, width: "100%", padding: "12px 0", marginBottom: 10, cursor: "pointer"
            }} disabled={loading}>
              {mode === "login" ? (loading ? "Logging in..." : "Login") : (loading ? "Creating..." : "Create Account")}
            </button>
          </form>
          <div style={{ color: "#bbb", fontSize: 15, marginTop: 8, textAlign: "center" }}>
            {mode === "login" ? (
              <>
                Don't have an account?{" "}
                <span style={{ color: accentGreen, cursor: "pointer", fontWeight: 700 }} onClick={() => { setMode("register"); setError(""); }}>
                  Register
                </span>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <span style={{ color: accentGreen, cursor: "pointer", fontWeight: 700 }} onClick={() => { setMode("login"); setError(""); }}>
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

  // Dashboard state
  const [inventory, setInventory] = useState([]);
  const [cashOnHand, setCashOnHand] = useState(0);
  const [pendingCardSales, setPendingCardSales] = useState(0);
  const [dashboardLog, setDashboardLog] = useState([]);
  const [fundsAdjust, setFundsAdjust] = useState("");
  const [fundsError, setFundsError] = useState("");

  // === Show Mode State ===
  const [showModeModalOpen, setShowModeModalOpen] = useState(false);
  const [showNameInput, setShowNameInput] = useState("");
  const [showActive, setShowActive] = useState(null);

  // === Dynamic Backgrounds ===
  const backgroundImages = {
    dashboard: "/pokemon-bg.png",
    trade: "/trade-bg.png",
    inventory: "/inventory-bg.png",
    lookup: "/lookup-bg.png",
    history: "/history-bg.png"
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

      // Show mode: fetch active show
      const showsQ = query(
        collection(db, "users", firebaseUser.uid, "shows"),
        where("endTime", "==", null)
      );
      const showsSnap = await getDocs(showsQ);
      if (!cancelled) {
        if (!showsSnap.empty) {
          setShowActive({ ...showsSnap.docs[0].data(), id: showsSnap.docs[0].id });
        } else {
          setShowActive(null);
        }
      }

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

  // === Show Mode logic ===
  async function startShow() {
    if (!firebaseUser || !showNameInput.trim()) return;
    const docRef = await addDoc(collection(db, "users", firebaseUser.uid, "shows"), {
      showName: showNameInput.trim(),
      startTime: new Date().toISOString(),
      endTime: null,
    });
    setShowActive({
      id: docRef.id,
      showName: showNameInput.trim(),
      startTime: new Date().toISOString(),
      endTime: null,
    });
    setShowModeModalOpen(false);
    setShowNameInput("");
  }

  async function endShow() {
    if (!firebaseUser || !showActive) return;
    await setDoc(
      doc(db, "users", firebaseUser.uid, "shows", showActive.id),
      { endTime: new Date().toISOString() },
      { merge: true }
    );
    setShowActive(null);
  }

  const chartData = (dashboardLog.length
    ? dashboardLog
    : [{ ts: Date.now(), value: inventoryValue, cash: cashOnHand }]
  ).map(log => ({
    time: new Date(log.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    Inventory: log.value,
    Cash: log.cash
  }));

  function handleLogout() {
    signOut(auth);
    setTab("dashboard");
  }

  if (!firebaseUser) {
    // LOGIN SCREEN BACKGROUND!
    return <LoginScreen />;
  }

  return (
    <UserContext.Provider value={firebaseUser}>
      <div
        className={`app-bg`}
        style={{
          position: "relative",
          minHeight: "100vh",
          minWidth: "100vw",
          fontFamily,
          color: "#fff",
          backgroundColor: "#111314"
        }}
      >
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
          <div className="tabs">
            <button
              className={`tab-btn${tab === "dashboard" ? " active" : ""}`}
              onClick={() => setTab("dashboard")}
            >
              Dashboard
            </button>
            <button
              className={`tab-btn${tab === "trade" ? " active" : ""}`}
              onClick={() => setTab("trade")}
            >
              Trade
            </button>
            <button
              className={`tab-btn${tab === "inventory" ? " active" : ""}`}
              onClick={() => setTab("inventory")}
            >
              Inventory
            </button>
            <button
              className={`tab-btn${tab === "lookup" ? " active" : ""}`}
              onClick={() => setTab("lookup")}
            >
              Card Lookup
            </button>
            <button
              className={`tab-btn${tab === "history" ? " active" : ""}`}
              onClick={() => setTab("history")}
            >
              Trade History
            </button>
          </div>

          {/* Dashboard Graph and Widgets */}
          {tab === "dashboard" && (
            <div className="dashboard-card">
              <>
                {/* --- Show Mode Button --- */}
                <div style={{ margin: "14px 0 10px 0", textAlign: "center" }}>
                  {!showActive && (
                    <button
                      className="show-mode-btn"
                      onClick={() => setShowModeModalOpen(true)}
                      style={{
                        background: "#222",
                        color: "#00b84a",
                        fontWeight: 700,
                        border: "2px solid #00b84a",
                        borderRadius: 9,
                        fontSize: 18,
                        padding: "12px 38px",
                        cursor: "pointer",
                        margin: "0 auto",
                        transition: "background 0.14s, color 0.14s, border 0.14s",
                      }}
                    >
                      Start Show Mode
                    </button>
                  )}
                  {showActive && (
                    <button
                      className="show-mode-btn end"
                      onClick={endShow}
                      style={{
                        background: "#f4453c",
                        color: "#fff",
                        fontWeight: 700,
                        border: "2px solid #b20000",
                        borderRadius: 9,
                        fontSize: 18,
                        padding: "12px 38px",
                        cursor: "pointer",
                        margin: "0 auto",
                        transition: "background 0.14s, color 0.14s, border 0.14s",
                      }}
                    >
                      End Show{showActive.showName ? ` (${showActive.showName})` : ""}
                    </button>
                  )}
                </div>

                {/* Show Mode Modal */}
                {showModeModalOpen && (
                  <div className="trade-modal-bg">
                    <div className="trade-modal" style={{ minWidth: 340, maxWidth: 410 }}>
                      <div className="trade-modal-title">Start Show Mode</div>
                      <input
                        className="trade-modal-input"
                        type="text"
                        placeholder="Show Name"
                        value={showNameInput}
                        onChange={e => setShowNameInput(e.target.value)}
                      />
                      <button
                        className="trade-modal-btn"
                        onClick={startShow}
                        disabled={!showNameInput.trim()}
                      >
                        Confirm
                      </button>
                      <button
                        className="trade-modal-cancel-btn"
                        onClick={() => setShowModeModalOpen(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* --- Dashboard Widgets --- */}
                <div
                  style={{
                    display: "flex",
                    gap: 48,
                    justifyContent: "center",
                    marginBottom: 22,
                    flexWrap: "wrap"
                  }}
                >
                  <div style={{
                    background: "#162815",
                    color: accentGreen,
                    padding: "24px 36px",
                    borderRadius: 12,
                    minWidth: 170,
                    textAlign: "center",
                    fontWeight: 700,
                    fontSize: 21,
                    boxShadow: "0 2px 10px #001e1940",
                    border: `2px solid ${accentGreen}55`,
                    marginBottom: 10
                  }}>
                    <div style={{ fontSize: 15, color: "#b5ffe1" }}>Cash on Hand</div>
                    <div style={{ fontSize: 32, marginTop: 6 }}>
                      ${cashOnHand.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div style={{
                    background: "#181f23",
                    color: accentGreen,
                    padding: "24px 36px",
                    borderRadius: 12,
                    minWidth: 170,
                    textAlign: "center",
                    fontWeight: 700,
                    fontSize: 21,
                    boxShadow: "0 2px 10px #001e1940",
                    border: `2px solid ${accentGreen}55`,
                    marginBottom: 10
                  }}>
                    <div style={{ fontSize: 15, color: "#b5dfff" }}>Inventory Value</div>
                    <div style={{ fontSize: 32, marginTop: 6 }}>
                      ${inventoryValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div style={{
                    background: "#1c2338",
                    color: "#4ec6ff",
                    padding: "24px 36px",
                    borderRadius: 12,
                    minWidth: 170,
                    textAlign: "center",
                    fontWeight: 700,
                    fontSize: 21,
                    boxShadow: "0 2px 10px #001e1940",
                    border: `2px solid #4ec6ff55`,
                    marginBottom: 10
                  }}>
                    <div style={{ fontSize: 15, color: "#b5dfff" }}>Pending Card Sales</div>
                    <div style={{ fontSize: 32, marginTop: 6 }}>
                      ${pendingCardSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <button
                      style={{
                        background: "#1c2338",
                        color: "#3e86cf",
                        border: "none",
                        borderRadius: 6,
                        padding: "7px 18px",
                        fontWeight: 700,
                        fontSize: 15,
                        cursor: "pointer",
                        marginTop: 10
                      }}
                      onClick={clearCardSales}
                    >
                      Clear Card Transactions
                    </button>
                  </div>
                </div>
                <div style={{
                  background: "#202c20",
                  borderRadius: 12,
                  padding: "22px 32px",
                  margin: "24px auto 0",
                  textAlign: "center",
                  maxWidth: 350,
                  border: `2px solid ${accentGreen}40`
                }}>
                  <div style={{ color: accentGreen, fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
                    Adjust Funds
                  </div>
                  <div style={{ display: "flex", gap: 12, justifyContent: "center", alignItems: "center", marginBottom: 12 }}>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={fundsAdjust || ""}
                      onChange={e => {
                        setFundsAdjust(e.target.value);
                        setFundsError("");
                      }}
                      style={{
                        padding: 9,
                        fontSize: 18,
                        borderRadius: 8,
                        border: "1.5px solid #444",
                        background: "#191f18",
                        color: "#fff",
                        width: 100
                      }}
                      placeholder="Amount"
                    />
                    <span style={{ color: "#fff", fontSize: 19 }}>$</span>
                  </div>
                  {fundsError && <div style={{ color: "#ff8888", fontWeight: 700, marginBottom: 6 }}>{fundsError}</div>}
                  <button
                    style={{
                      background: accentGreen,
                      color: "#181b1e",
                      border: "none",
                      borderRadius: 7,
                      fontWeight: 700,
                      padding: "8px 28px",
                      fontSize: 17,
                      cursor: "pointer",
                      marginRight: 8
                    }}
                    onClick={() => adjustFunds("add")}
                  >
                    Add Funds
                  </button>
                  <button
                    style={{
                      background: "#b72222",
                      color: "#fff",
                      border: "none",
                      borderRadius: 7,
                      fontWeight: 700,
                      padding: "8px 16px",
                      fontSize: 17,
                      cursor: "pointer",
                      marginLeft: 8
                    }}
                    onClick={() => adjustFunds("subtract")}
                  >
                    Subtract Funds
                  </button>
                </div>
                <div
                  style={{
                    fontWeight: 600,
                    color: accentGreen,
                    fontSize: 20,
                    marginBottom: 12,
                    marginTop: 40
                  }}
                >
                  Value Trend (Last 24 Hours)
                </div>
                <ResponsiveContainer width="100%" height={260}>
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
                </ResponsiveContainer>
              </>
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
          </div>
        </div>
      </div>
    </UserContext.Provider>
  );
}

export default App;
