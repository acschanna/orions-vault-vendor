import React, { useState, useEffect } from "react";
import { useUser } from "./App";
import { db } from "./firebase";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import "./TradeHistory.css";

export default function ShowHistory() {
  const user = useUser();
  const uid = user?.uid;
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedShow, setSelectedShow] = useState(null);
  const [showStats, setShowStats] = useState(null);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    async function fetchShows() {
      const q = query(collection(db, "users", uid, "shows"), orderBy("startTime", "desc"));
      const snap = await getDocs(q);
      setShows(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setLoading(false);
    }
    fetchShows();
  }, [uid]);

  function fmt(ts) {
    if (!ts) return "N/A";
    return new Date(ts).toLocaleString();
  }

  // When user opens show, calculate stats
  async function loadShowStats(show) {
    setSelectedShow(show);
    setShowStats(null);
    const tradesQ = query(collection(db, "users", uid, "tradeHistory"));
    const tradesSnap = await getDocs(tradesQ);
    const showTrades = tradesSnap.docs
      .map((d) => d.data())
      .filter((trade) => trade.showId === show.id);
    let valueIn = 0, valueOut = 0, cashIn = 0, cashOut = 0;
    showTrades.forEach(trade => {
      valueIn += Number(trade.customer?.cards?.reduce((s, c) => s + Number(c.value || 0), 0) || 0)
               + Number(trade.customer?.sealed?.reduce((s, c) => s + Number(c.value || 0), 0) || 0);
      valueOut += Number(trade.vendor?.cards?.reduce((s, c) => s + Number(c.value || 0), 0) || 0)
                + Number(trade.vendor?.sealed?.reduce((s, c) => s + Number(c.value || 0), 0) || 0);
      cashIn += Number(trade.customer?.cash || 0);
      cashOut += Number(trade.vendor?.cash || 0);
    });
    let pendingSales = 0;
    try {
      // Only import getDoc and doc if not already imported
      const { getDoc, doc } = await import("firebase/firestore");
      const userDocSnap = await getDoc(doc(db, "users", uid));
      if (userDocSnap.exists()) {
        pendingSales = Number(userDocSnap.data().pendingCardSales || 0);
      }
    } catch (e) {}
    setShowStats({
      valueIn, valueOut, cashIn, cashOut, tradeCount: showTrades.length, pendingSales
    });
  }

  return (
    <div className="tab-content">
      <h2 className="trade-history-title">Show History</h2>
      {loading ? (
        <div style={{ color: "#00b84a", textAlign: "center", marginTop: 22 }}>Loading show history...</div>
      ) : shows.length === 0 ? (
        <div className="trade-history-empty">No shows found.</div>
      ) : (
        <table className="trade-history-table">
          <thead>
            <tr>
              <th>Show Name</th>
              <th>Start</th>
              <th>End</th>
              <th>Trades</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {shows.map(show => (
              <tr key={show.id}>
                <td>{show.showName}</td>
                <td>{fmt(show.startTime)}</td>
                <td>{fmt(show.endTime)}</td>
                <td></td>
                <td>
                  <button className="th-btn" onClick={() => loadShowStats(show)}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Show Details Modal */}
      {selectedShow && (
        <div className="trade-history-modal-bg" onClick={() => setSelectedShow(null)}>
          <div className="trade-history-modal" onClick={e => e.stopPropagation()}>
            <div className="trade-history-modal-title">{selectedShow.showName}</div>
            <div style={{ color: "#aaa", marginBottom: 6, fontSize: 14 }}>
              <b>Started:</b> {fmt(selectedShow.startTime)}<br />
              <b>Ended:</b> {fmt(selectedShow.endTime)}
            </div>
            {showStats === null ? (
              <div style={{ color: "#00b84a", margin: "14px 0" }}>Calculating stats...</div>
            ) : (
              <div style={{ color: "#fff", marginBottom: 12, fontSize: 17 }}>
                <b>Trade Count:</b> {showStats.tradeCount}<br />
                <b>Value In:</b> ${showStats.valueIn.toLocaleString(undefined, { minimumFractionDigits: 2 })}<br />
                <b>Value Out:</b> ${showStats.valueOut.toLocaleString(undefined, { minimumFractionDigits: 2 })}<br />
                <b>Cash In:</b> ${showStats.cashIn.toLocaleString(undefined, { minimumFractionDigits: 2 })}<br />
                <b>Cash Out:</b> ${showStats.cashOut.toLocaleString(undefined, { minimumFractionDigits: 2 })}<br />
                <b>Pending Card Sales:</b> ${showStats.pendingSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            )}
            <button className="trade-history-modal-btn" onClick={() => setSelectedShow(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
