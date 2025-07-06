import React, { useState, useEffect, createContext, useContext } from "react";
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
  serverTimestamp,
} from "firebase/firestore";
import TradeTab from "./TradeTab.jsx";
import Inventory from "./Inventory.jsx";
import CardLookup from "./CardLookup.jsx";
import TradeHistory from "./TradeHistory.jsx"; // <--- NEW
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// --- Styles and helpers ---
const accentGreen = "#00b84a";
const blueLine = "#85c9ff";
const bgBlack = "#111314";
const cardDark = "#181b1e";
const fontFamily = `'Inter', Arial, Helvetica, sans-serif`;

// --- User Context for all children ---
const UserContext = createContext(null);
export const useUser = () => useContext(UserContext);

// --- Cloud DB helpers ---
async function getUserDoc(uid) {
  return doc(db, "users", uid);
}
async function getInventory(uid) {
  const invRef = collection(db, "users", uid, "inventory");
  const q = query(invRef, orderBy("dateAdded", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}
async function saveInventory(uid, inventory) {
  const invRef = collection(db, "users", uid, "inventory");
  const oldSnap = await getDocs(invRef);
  for (const docu of oldSnap.docs) await docu.ref.delete();
  for (const card of inventory) {
    const { id, ...rest } = card;
    await addDoc(invRef, rest);
  }
}
async function addInventoryCard(uid, card) {
  const invRef = collection(db, "users", uid, "inventory");
  await addDoc(invRef, card);
}
async function deleteInventoryCard(uid, cardId) {
  const cardRef = doc(db, "users", uid, "inventory", cardId);
  await cardRef.delete();
}
async function updateInventoryCard(uid, cardId, data) {
  const cardRef = doc(db, "users", uid, "inventory", cardId);
  await updateDoc(cardRef, data);
}
async function getUserFields(uid) {
  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) return {};
  return userDoc.data();
}
async function setUserFields(uid, fields) {
  await setDoc(doc(db, "users", uid), fields, { merge: true });
}

// --- Dashboard Log helpers ---
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

// --- Login/Register screen ---
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
      .catch((err) => {
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
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: bgBlack
    }}>
      <div style={{
        background: cardDark,
        padding: 36,
        borderRadius: 16,
        boxShadow: "0 2px 32px #0e1f13",
        minWidth: 350,
        maxWidth: 380,
        border: `2.5px solid ${accentGreen}80`
      }}>
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
  );
}

// --- MAIN APP ---
function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);

  // Cloud dashboard state
  const [inventory, setInventory] = useState([]);
  const [cashOnHand, setCashOnHand] = useState(0);
  const [pendingCardSales, setPendingCardSales] = useState(0);
  const [dashboardLog, setDashboardLog] = useState([]);
  const [fundsAdjust, setFundsAdjust] = useState("");
  const [fundsError, setFundsError] = useState("");

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
    return <LoginScreen />;
  }

  return (
    <UserContext.Provider value={firebaseUser}>
      <div
        style={{
          minHeight: "100vh",
          background: bgBlack,
          fontFamily,
          color: "#fff",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "24px 0 12px 0",
            textAlign: "center",
            position: "relative"
          }}
        >
          <img
            src="/logo.png"
            alt="Orion's Vault Logo"
            style={{ width: 250, marginBottom: 8 }}
          />
          <div
            style={{
              fontWeight: 800,
              fontSize: 32,
              letterSpacing: ".5px",
              color: accentGreen,
              marginTop: 5,
            }}
          >
            Orion's Vault Vendor Companion
          </div>
          <button
            onClick={handleLogout}
            style={{
              position: "absolute", top: 30, right: 38,
              background: "#222", color: accentGreen, border: "none",
              borderRadius: 7, padding: "7px 18px", fontWeight: 700, fontSize: 15, cursor: "pointer"
            }}
          >
            Log out
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 30,
            margin: "30px 0 24px 0",
          }}
        >
          <button
            style={{
              background: tab === "dashboard" ? accentGreen : cardDark,
              color: tab === "dashboard" ? "#181b1e" : "#fff",
              border: "none",
              borderRadius: 7,
              padding: "8px 24px",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 18,
            }}
            onClick={() => setTab("dashboard")}
          >
            Dashboard
          </button>
          <button
            style={{
              background: tab === "trade" ? accentGreen : cardDark,
              color: tab === "trade" ? "#181b1e" : "#fff",
              border: "none",
              borderRadius: 7,
              padding: "8px 24px",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 18,
            }}
            onClick={() => setTab("trade")}
          >
            Trade
          </button>
          <button
            style={{
              background: tab === "inventory" ? accentGreen : cardDark,
              color: tab === "inventory" ? "#181b1e" : "#fff",
              border: "none",
              borderRadius: 7,
              padding: "8px 24px",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 18,
            }}
            onClick={() => setTab("inventory")}
          >
            Inventory
          </button>
          <button
            style={{
              background: tab === "lookup" ? accentGreen : cardDark,
              color: tab === "lookup" ? "#181b1e" : "#fff",
              border: "none",
              borderRadius: 7,
              padding: "8px 24px",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 18,
            }}
            onClick={() => setTab("lookup")}
          >
            Card Lookup
          </button>
          <button
            style={{
              background: tab === "history" ? accentGreen : cardDark,
              color: tab === "history" ? "#181b1e" : "#fff",
              border: "none",
              borderRadius: 7,
              padding: "8px 24px",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 18,
            }}
            onClick={() => setTab("history")}
          >
            Trade History
          </button>
        </div>

        {/* Dashboard Graph and Widgets */}
        {tab === "dashboard" && (
          <div
            style={{
              background: cardDark,
              borderRadius: 14,
              margin: "0 auto",
              marginBottom: 28,
              maxWidth: 820,
              padding: 32,
              boxShadow: "0 2px 18px #0e1f13",
            }}
          >
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
          </div>
        )}

        {/* Tab Content */}
        <div
          style={{
            background: cardDark,
            borderRadius: 14,
            maxWidth: 1200,
            margin: "0 auto",
            minHeight: 260,
            marginBottom: 40,
            boxShadow: "0 2px 12px #121b1277",
            padding: 24,
          }}
        >
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
    </UserContext.Provider>
  );
}

export default App;
