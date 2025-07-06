import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import { useUser } from "./App";
import { collection, query, orderBy, getDocs } from "firebase/firestore";

const accentGreen = "#00b84a";
const cardDark = "#181b1e";
const fontFamily = `'Inter', Arial, Helvetica, sans-serif`;

export default function TradeHistory() {
  const user = useUser();
  const uid = user?.uid;
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    const fetchTrades = async () => {
      const q = query(collection(db, "users", uid, "tradeHistory"), orderBy("date", "desc"));
      const snap = await getDocs(q);
      setTrades(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      setLoading(false);
    };
    fetchTrades();
  }, [uid]);

  return (
    <div style={{
      maxWidth: 980,
      margin: "0 auto",
      background: cardDark,
      borderRadius: 16,
      padding: 28,
      minHeight: 300,
      fontFamily
    }}>
      <h2 style={{ color: accentGreen, marginTop: 0, fontWeight: 800 }}>Trade History</h2>
      {loading ? (
        <div style={{ color: accentGreen, padding: 40, textAlign: "center" }}>Loading trades...</div>
      ) : trades.length === 0 ? (
        <div style={{ color: "#aaa", fontSize: 18, textAlign: "center", margin: 36 }}>
          No trades found yet.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 18 }}>
          <thead>
            <tr style={{ background: "#162815" }}>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Vendor Side</th>
              <th style={thStyle}>Customer Side</th>
            </tr>
          </thead>
          <tbody>
            {trades.map(trade => (
              <tr key={trade.id}>
                <td style={tdStyle}>{new Date(trade.date).toLocaleString()}</td>
                <td style={tdStyle}>
                  {trade.vendor?.cards?.length
                    ? trade.vendor.cards.map(c => (
                        <div key={c.id}>
                          {c.cardName} {c.cardNumber ? `#${c.cardNumber}` : ""}
                          {c.value ? ` ($${Number(c.value).toFixed(2)})` : ""}
                        </div>
                      ))
                    : "-"}
                  {trade.vendor?.cash
                    ? <div style={{ color: accentGreen }}>+${trade.vendor.cash} {trade.vendor.cashType}</div>
                    : ""}
                </td>
                <td style={tdStyle}>
                  {trade.customer?.cards?.length
                    ? trade.customer.cards.map(c => (
                        <div key={c.id}>
                          {c.cardName} {c.cardNumber ? `#${c.cardNumber}` : ""}
                          {c.value ? ` ($${Number(c.value).toFixed(2)})` : ""}
                        </div>
                      ))
                    : "-"}
                  {trade.customer?.cash
                    ? <div style={{ color: accentGreen }}>+${trade.customer.cash} {trade.customer.cashType}</div>
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const thStyle = {
  color: "#caffea",
  fontWeight: 700,
  padding: "13px 7px",
  fontSize: 16,
  borderBottom: "1.5px solid #184828",
  letterSpacing: ".5px",
  background: "#1c2d20",
};
const tdStyle = {
  color: "#fff",
  padding: "10px 7px",
  fontSize: 15,
  textAlign: "left",
  borderBottom: "1px solid #192822",
  maxWidth: 260,
  wordBreak: "break-all"
};
