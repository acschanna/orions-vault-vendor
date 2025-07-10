import React, { useEffect, useState } from "react";
import { useUser } from "./App";
import { db } from "./firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
  addDoc,
  setDoc,
  doc,
  deleteDoc,
  getDoc,
} from "firebase/firestore";
import "./TradeHistory.css";

const accentGreen = "#00b84a";

export default function TradeHistory() {
  const user = useUser();
  const uid = user?.uid;

  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [reversing, setReversing] = useState(false);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    async function fetchTrades() {
      const q = query(collection(db, "users", uid, "tradeHistory"), orderBy("date", "desc"));
      const snap = await getDocs(q);
      setTrades(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setLoading(false);
    }
    fetchTrades();
  }, [uid]);

  // --- CSV Export Function ---
  function exportCSV() {
    setExporting(true);
    const headers = [
      "Date",
      "Vendor Value",
      "Customer Value",
      "Vendor Cards",
      "Vendor Sealed",
      "Customer Cards",
      "Customer Sealed",
      "Vendor Cash",
      "Vendor Cash Type",
      "Customer Cash",
      "Customer Cash Type",
      "Reversed",
    ];
    const rows = trades.map(trade => [
      trade.date ? new Date(trade.date).toLocaleString() : "",
      Number(trade.valueVendor || 0).toFixed(2),
      Number(trade.valueCustomer || 0).toFixed(2),
      trade.vendor?.cards?.map(c =>
        `${c.cardName} (${c.setName || ""} #${c.cardNumber || ""}, $${Number(c.value || 0).toFixed(2)}, ${c.condition})`
      ).join(" | "),
      trade.vendor?.sealed?.map(s =>
        `${s.productName} (${s.productType || ""}, Qty:${s.quantity || ""}, $${Number(s.value || 0).toFixed(2)}, ${s.condition})`
      ).join(" | "),
      trade.customer?.cards?.map(c =>
        `${c.cardName} (${c.setName || ""} #${c.cardNumber || ""}, $${Number(c.value || 0).toFixed(2)}, ${c.condition})`
      ).join(" | "),
      trade.customer?.sealed?.map(s =>
        `${s.productName} (${s.productType || ""}, Qty:${s.quantity || ""}, $${Number(s.value || 0).toFixed(2)}, ${s.condition})`
      ).join(" | "),
      Number(trade.vendor?.cash || 0).toFixed(2),
      trade.vendor?.cashType || "",
      Number(trade.customer?.cash || 0).toFixed(2),
      trade.customer?.cashType || "",
      trade.reversed ? "Yes" : "",
    ]);
    const csv = [
      headers.join(","),
      ...rows.map(row =>
        row.map(val => `"${(val ?? "").toString().replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trade_history.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setExporting(false);
  }

  // --- Reverse Trade Logic ---
  async function handleReverseTrade(trade) {
    if (trade.reversed) return;
    if (!window.confirm("Are you sure you want to reverse this trade? This action cannot be undone!")) return;
    setReversing(true);

    try {
      // 1. Add vendor cards/sealed BACK to inventory (if originally from inventory)
      for (const card of trade.vendor?.cards || []) {
        if (card.origin === "inventory" && card.id) {
          await addDoc(collection(db, "users", uid, "inventory"), {
            type: "card",
            setName: card.setName,
            cardName: card.cardName,
            cardNumber: card.cardNumber,
            tcgPlayerId: card.tcgPlayerId,
            ...(card.images ? { images: card.images } : {}),
            marketValue: card.value,
            acquisitionCost: card.acquisitionCost ?? card.value ?? 0,
            condition: card.condition,
            dateAdded: new Date().toISOString(),
          });
        }
      }
      for (const prod of trade.vendor?.sealed || []) {
        if (prod.origin === "inventory" && prod.id) {
          await addDoc(collection(db, "users", uid, "inventory"), {
            type: "sealed",
            productName: prod.productName,
            setName: prod.setName,
            productType: prod.productType,
            quantity: prod.quantity,
            ...(prod.images ? { images: prod.images } : {}),
            marketValue: prod.value,
            acquisitionCost: prod.acquisitionCost ?? prod.value ?? 0,
            condition: prod.condition,
            dateAdded: new Date().toISOString(),
          });
        }
      }

      // 2. Remove customer cards/sealed from inventory (if they were added)
      const invSnap = await getDocs(collection(db, "users", uid, "inventory"));
      const inventory = invSnap.docs.map(d => ({ ...d.data(), docId: d.id }));

      for (const card of trade.customer?.cards || []) {
        const match = inventory.find(i =>
          i.type === "card" &&
          i.cardName === card.cardName &&
          i.setName === card.setName &&
          i.cardNumber === card.cardNumber &&
          i.tcgPlayerId === card.tcgPlayerId &&
          i.condition === card.condition &&
          Math.abs(Number(i.marketValue) - Number(card.value)) < 0.01
        );
        if (match) {
          await deleteDoc(doc(db, "users", uid, "inventory", match.docId));
        }
      }
      for (const prod of trade.customer?.sealed || []) {
        const match = inventory.find(i =>
          i.type === "sealed" &&
          i.productName === prod.productName &&
          i.setName === prod.setName &&
          i.productType === prod.productType &&
          Number(i.quantity) === Number(prod.quantity) &&
          Math.abs(Number(i.marketValue) - Number(prod.value)) < 0.01
        );
        if (match) {
          await deleteDoc(doc(db, "users", uid, "inventory", match.docId));
        }
      }

      // 3. Adjust cash on hand (reverse the cash transaction)
      const userSnap = await getDoc(doc(db, "users", uid));
      const currentCash = Number(userSnap.data()?.cashOnHand || 0);
      const newCash =
        currentCash +
        Number(trade.vendor?.cash || 0) -
        Number(trade.customer?.cash || 0);
      await setDoc(doc(db, "users", uid), { cashOnHand: newCash }, { merge: true });

      // 4. Mark the trade as reversed in tradeHistory
      await setDoc(
        doc(db, "users", uid, "tradeHistory", trade.id),
        { reversed: true, reversedDate: new Date().toISOString() },
        { merge: true }
      );

      setSelectedTrade({ ...trade, reversed: true, reversedDate: new Date().toISOString() });
      setTrades(trades.map(t => (t.id === trade.id ? { ...t, reversed: true } : t)));
      alert("Trade reversed and inventory/cash restored.");
    } catch (err) {
      alert("Error reversing trade: " + err.message);
    }
    setReversing(false);
  }

  return (
    <div className="trade-history-root">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 className="trade-history-title" style={{ marginBottom: 0 }}>Trade History</h2>
        <button
          className="th-btn"
          style={{ marginRight: 10, minWidth: 132, fontSize: 15 }}
          onClick={exportCSV}
          disabled={exporting || loading || trades.length === 0}
        >
          {exporting ? "Exporting..." : "Export to CSV"}
        </button>
      </div>
      {loading ? (
        <div style={{ color: accentGreen, textAlign: "center", marginTop: 22 }}>Loading trade history...</div>
      ) : trades.length === 0 ? (
        <div className="trade-history-empty">No trades found.</div>
      ) : (
        <table className="trade-history-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Vendor Value</th>
              <th>Customer Value</th>
              <th>Details</th>
              <th>Reversed</th>
            </tr>
          </thead>
          <tbody>
            {trades.map(trade => (
              <tr key={trade.id}>
                <td className="th-date">
                  {trade.date ? new Date(trade.date).toLocaleString() : ""}
                </td>
                <td className="th-val">
                  ${Number(trade.valueVendor || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="th-customer">
                  ${Number(trade.valueCustomer || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td>
                  <button className="th-btn" onClick={() => setSelectedTrade(trade)}>View</button>
                </td>
                <td style={{ color: trade.reversed ? "#f4453c" : "#00b84a", fontWeight: "bold" }}>
                  {trade.reversed ? "Yes" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Modal for trade details */}
      {selectedTrade && (
        <div className="trade-history-modal-bg" onClick={() => setSelectedTrade(null)}>
          <div className="trade-history-modal" onClick={e => e.stopPropagation()}>
            <div className="trade-history-modal-title">Trade Details</div>
            <div style={{ color: "#aaa", marginBottom: 6, fontSize: 14 }}>
              <b>Date:</b> {selectedTrade.date ? new Date(selectedTrade.date).toLocaleString() : "N/A"}
            </div>
            <div style={{ color: "#00b84a", marginBottom: 6, fontWeight: 700 }}>
              Vendor Value: ${Number(selectedTrade.valueVendor || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div style={{ color: "#b5dfff", marginBottom: 8, fontWeight: 700 }}>
              Customer Value: ${Number(selectedTrade.valueCustomer || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            {selectedTrade.reversed && (
              <div style={{ color: "#f4453c", fontWeight: 700, marginBottom: 12 }}>
                Trade has been reversed{selectedTrade.reversedDate ? " (" + new Date(selectedTrade.reversedDate).toLocaleString() + ")" : ""}.
              </div>
            )}

            <div className="trade-history-modal-section-title">Vendor Cards</div>
            {selectedTrade.vendor?.cards?.length > 0 ? (
              <table className="trade-history-modal-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Set</th>
                    <th>#</th>
                    <th>Value</th>
                    <th>Cond.</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTrade.vendor.cards.map((card, i) => (
                    <tr key={card.id || i}>
                      <td>{card.cardName}</td>
                      <td>{card.setName || ""}</td>
                      <td>{card.cardNumber || ""}</td>
                      <td>${Number(card.value || 0).toFixed(2)}</td>
                      <td>{card.condition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: "#aaa", fontSize: 13 }}>None</div>
            )}

            <div className="trade-history-modal-section-title">Vendor Sealed</div>
            {selectedTrade.vendor?.sealed?.length > 0 ? (
              <table className="trade-history-modal-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Qty</th>
                    <th>Value</th>
                    <th>Cond.</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTrade.vendor.sealed.map((prod, i) => (
                    <tr key={prod.id || i}>
                      <td>{prod.productName}</td>
                      <td>{prod.productType || ""}</td>
                      <td>{prod.quantity || ""}</td>
                      <td>${Number(prod.value || 0).toFixed(2)}</td>
                      <td>{prod.condition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: "#aaa", fontSize: 13 }}>None</div>
            )}

            <div className="trade-history-modal-section-title">Customer Cards</div>
            {selectedTrade.customer?.cards?.length > 0 ? (
              <table className="trade-history-modal-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Set</th>
                    <th>#</th>
                    <th>Value</th>
                    <th>Cond.</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTrade.customer.cards.map((card, i) => (
                    <tr key={card.id || i}>
                      <td>{card.cardName}</td>
                      <td>{card.setName || ""}</td>
                      <td>{card.cardNumber || ""}</td>
                      <td>${Number(card.value || 0).toFixed(2)}</td>
                      <td>{card.condition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: "#aaa", fontSize: 13 }}>None</div>
            )}

            <div className="trade-history-modal-section-title">Customer Sealed</div>
            {selectedTrade.customer?.sealed?.length > 0 ? (
              <table className="trade-history-modal-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Qty</th>
                    <th>Value</th>
                    <th>Cond.</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTrade.customer.sealed.map((prod, i) => (
                    <tr key={prod.id || i}>
                      <td>{prod.productName}</td>
                      <td>{prod.productType || ""}</td>
                      <td>{prod.quantity || ""}</td>
                      <td>${Number(prod.value || 0).toFixed(2)}</td>
                      <td>{prod.condition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: "#aaa", fontSize: 13 }}>None</div>
            )}

            <div style={{ marginTop: 16, fontWeight: 600 }}>
              <span style={{ color: "#00b84a" }}>
                Vendor Cash: ${Number(selectedTrade.vendor?.cash || 0).toFixed(2)} ({selectedTrade.vendor?.cashType || "cash"})
              </span>
              <br />
              <span style={{ color: "#b5dfff" }}>
                Customer Cash: ${Number(selectedTrade.customer?.cash || 0).toFixed(2)} ({selectedTrade.customer?.cashType || "cash"})
              </span>
            </div>
            <div style={{ marginTop: 24 }}>
              <button
                className="trade-history-modal-btn"
                onClick={() => setSelectedTrade(null)}
                disabled={reversing}
                style={{ marginRight: 14 }}
              >
                Close
              </button>
              <button
                className="trade-history-modal-btn"
                style={{
                  background: "#f4453c",
                  color: "#fff",
                  marginLeft: 0,
                  opacity: selectedTrade.reversed || reversing ? 0.6 : 1,
                  cursor: selectedTrade.reversed || reversing ? "not-allowed" : "pointer",
                }}
                disabled={selectedTrade.reversed || reversing}
                onClick={() => handleReverseTrade(selectedTrade)}
              >
                {reversing ? "Reversing..." : selectedTrade.reversed ? "Trade Reversed" : "Reverse Trade"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
