import React, { useEffect, useState } from "react";
import { useUser } from "./App";
import { db } from "./firebase";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import "./TradeHistory.css";

const accentGreen = "#00b84a";

export default function TradeHistory() {
  const user = useUser();
  const uid = user?.uid;

  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [exporting, setExporting] = useState(false);

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
    // CSV headers
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
    ];
    // Map each trade to a row
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
      trade.customer?.cashType || ""
    ]);
    // Assemble CSV
    const csv = [
      headers.join(","),
      ...rows.map(row =>
        row.map(val => `"${(val ?? "").toString().replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    // Download
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

            <button className="trade-history-modal-btn" onClick={() => setSelectedTrade(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
