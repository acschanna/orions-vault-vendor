import React, { useEffect, useState } from "react";
import { useUser } from "./App";
import { db } from "./firebase";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  query,
  orderBy,
} from "firebase/firestore";
import "./Inventory.css";

const accentGreen = "#00b84a";

export default function Inventory() {
  const user = useUser();
  const uid = user?.uid;
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [csvError, setCsvError] = useState("");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");

  // Fetch inventory from Firestore
  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    const fetchInventory = async () => {
      const q = query(collection(db, "users", uid, "inventory"), orderBy("dateAdded", "asc"));
      const snap = await getDocs(q);
      setInventory(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setLoading(false);
    };
    fetchInventory();
  }, [uid]);

  // CSV import
  const handleImportCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    setCsvError("");
    try {
      const text = await file.text();
      const rows = text.trim().split("\n");
      if (rows.length < 2) throw new Error("CSV missing data.");
      const headers = rows[0].split(",");
      const items = rows.slice(1).map((row) => {
        const values = row.split(",");
        const item = {};
        headers.forEach((h, i) => {
          item[h.trim()] = values[i]?.trim();
        });
        return item;
      });
      // Add each item to Firestore
      for (let item of items) {
        await addDoc(collection(db, "users", uid, "inventory"), {
          ...item,
          marketValue: Number(item.marketValue || 0),
          acquisitionCost: Number(item.acquisitionCost || 0),
          dateAdded: item.dateAdded || new Date().toISOString(),
        });
      }
      // Refresh
      const snap = await getDocs(collection(db, "users", uid, "inventory"));
      setInventory(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    } catch (err) {
      setCsvError("Import failed: " + err.message);
    }
    setImporting(false);
  };

  // CSV export
  const handleExportCSV = () => {
    setExporting(true);
    const headers = [
      "cardName",
      "setName",
      "cardNumber",
      "marketValue",
      "acquisitionCost",
      "condition",
      "dateAdded",
    ];
    const rows = [headers.join(",")];
    inventory.forEach((item) => {
      const row = headers.map((h) => `"${(item[h] ?? "").toString().replace(/"/g, '""')}"`).join(",");
      rows.push(row);
    });
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setExporting(false);
  };

  // Delete card
  const handleDelete = async (id) => {
    if (!window.confirm("Remove this card from inventory?")) return;
    await deleteDoc(doc(db, "users", uid, "inventory", id));
    setInventory((prev) => prev.filter((c) => c.id !== id));
  };

  // Table filtering/search
  const filteredInventory = inventory
    .filter((item) =>
      !filter ||
      (filter === "cards" && item.type !== "sealed") ||
      (filter === "sealed" && item.type === "sealed")
    )
    .filter((item) =>
      !search ||
      (item.cardName?.toLowerCase().includes(search.toLowerCase()) ||
        item.setName?.toLowerCase().includes(search.toLowerCase()) ||
        item.cardNumber?.toLowerCase().includes(search.toLowerCase()))
    );

  // Inventory stats
  const totalValue = inventory.reduce((sum, c) => sum + (Number(c.marketValue) || 0), 0);
  const totalCards = inventory.filter((c) => c.type !== "sealed").length;
  const totalSealed = inventory.filter((c) => c.type === "sealed").length;

  return (
    <div className="inventory-root">
      <div className="inventory-header-row">
        <h2 className="inventory-title">Inventory</h2>
        <span className="inventory-subheading">All items currently in stock.</span>
        <label className="inventory-action-btn" style={{ marginTop: 0 }}>
          Import CSV
          <input
            type="file"
            accept=".csv"
            onChange={handleImportCSV}
            style={{ display: "none" }}
            disabled={importing}
          />
        </label>
        <button
          className="inventory-action-btn secondary"
          onClick={handleExportCSV}
          disabled={exporting}
        >
          Export CSV
        </button>
        <select
          className="inventory-filter-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All</option>
          <option value="cards">Cards Only</option>
          <option value="sealed">Sealed Only</option>
        </select>
        <input
          className="inventory-input"
          placeholder="Search by name, set, or #"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {csvError && <div className="inventory-error">{csvError}</div>}
      {loading ? (
        <div className="inventory-loading">Loading inventory...</div>
      ) : filteredInventory.length === 0 ? (
        <div className="inventory-empty">No items found in inventory.</div>
      ) : (
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Set</th>
              <th>#</th>
              <th>Market Value</th>
              <th>Acq. Cost</th>
              <th>Condition</th>
              <th>Date Added</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredInventory.map((item) => (
              <tr key={item.id}>
                <td className="card-name">{item.cardName || item.productName}</td>
                <td className="card-set">{item.setName || item.productType || ""}</td>
                <td>{item.cardNumber || item.quantity || ""}</td>
                <td className="market-value">
                  ${Number(item.marketValue || 0).toFixed(2)}
                </td>
                <td className="acquisition-cost">
                  ${Number(item.acquisitionCost || 0).toFixed(2)}
                </td>
                <td className="condition">{item.condition}</td>
                <td>
                  {item.dateAdded
                    ? new Date(item.dateAdded).toLocaleDateString()
                    : ""}
                </td>
                <td>
                  <button
                    className="delete-btn"
                    onClick={() => handleDelete(item.id)}
                  >
                    ❌
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Summary Stats */}
      <div className="inventory-summary-row">
        <div className="inventory-summary-box">
          <div className="inventory-summary-title">Inventory Value</div>
          <div className="inventory-summary-value">
            ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="inventory-summary-box">
          <div className="inventory-summary-title">Cards</div>
          <div className="inventory-summary-value">{totalCards}</div>
        </div>
        <div className="inventory-summary-box">
          <div className="inventory-summary-title">Sealed</div>
          <div className="inventory-summary-value">{totalSealed}</div>
        </div>
      </div>
    </div>
  );
}
