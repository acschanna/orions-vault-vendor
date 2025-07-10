// src/Inventory.jsx
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

const EDITION_OPTIONS = ["1st Edition", "Unlimited", "Shadowless"];
const PTCG_API_KEY = "d49129a9-8f4c-4130-968a-cd47501df765";

export default function Inventory() {
  const user = useUser();
  const uid = user?.uid;
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [csvError, setCsvError] = useState("");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");

  // Inline-edit state
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ marketValue: "", edition: "" });

  // Fetch inventory
  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    (async () => {
      const q = query(
        collection(db, "users", uid, "inventory"),
        orderBy("dateAdded", "asc")
      );
      const snap = await getDocs(q);
      setInventory(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setLoading(false);
    })();
  }, [uid]);

  // CSV import (includes edition)
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
        const cols = row.split(",");
        const itm = {};
        headers.forEach((h, i) => (itm[h.trim()] = cols[i]?.trim()));
        return itm;
      });
      for (let item of items) {
        await addDoc(collection(db, "users", uid, "inventory"), {
          ...item,
          marketValue: Number(item.marketValue || 0),
          acquisitionCost: Number(item.acquisitionCost || 0),
          condition: item.condition || "",
          edition: EDITION_OPTIONS.includes(item.edition)
            ? item.edition
            : "",
          dateAdded: item.dateAdded || new Date().toISOString(),
        });
      }
      // refresh
      const snap = await getDocs(
        query(
          collection(db, "users", uid, "inventory"),
          orderBy("dateAdded", "asc")
        )
      );
      setInventory(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    } catch (err) {
      setCsvError("Import failed: " + err.message);
    }
    setImporting(false);
  };

  // CSV export (includes edition)
  const handleExportCSV = () => {
    setExporting(true);
    const headers = [
      "cardName",
      "setName",
      "cardNumber",
      "marketValue",
      "acquisitionCost",
      "condition",
      "edition",
      "dateAdded",
    ];
    const rows = [headers.join(",")];
    inventory.forEach((item) => {
      const row = headers
        .map((h) => `"${(item[h] ?? "").toString().replace(/"/g, '""')}"`)
        .join(",");
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

  // Update prices via Pokémon TCG API
  const handleUpdatePrices = async () => {
    if (!window.confirm("Fetch latest prices for all cards?")) return;
    setUpdatingPrices(true);
    for (let item of inventory) {
      try {
        const res = await fetch(
          `https://api.pokemontcg.io/v2/cards?q=name:"${encodeURIComponent(
            item.cardName
          )}" set.name:"${encodeURIComponent(
            item.setName
          )}" number:"${encodeURIComponent(item.cardNumber)}"`,
          {
            headers: { "X-Api-Key": PTCG_API_KEY },
          }
        );
        const json = await res.json();
        const price =
          json.data?.[0]?.cardmarket?.prices?.averageSellPrice ??
          item.marketValue;
        await updateDoc(
          doc(db, "users", uid, "inventory", item.id),
          { marketValue: price }
        );
      } catch (err) {
        console.error("Price update failed for", item.id, err);
      }
    }
    // refresh inventory
    const snap = await getDocs(
      query(
        collection(db, "users", uid, "inventory"),
        orderBy("dateAdded", "asc")
      )
    );
    setInventory(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    setUpdatingPrices(false);
  };

  // Delete card
  const handleDelete = async (id) => {
    if (!window.confirm("Remove this card from inventory?")) return;
    await deleteDoc(doc(db, "users", uid, "inventory", id));
    setInventory((prev) => prev.filter((c) => c.id !== id));
  };

  // Start inline edit
  const startEdit = (item) => {
    setEditingId(item.id);
    setDraft({
      marketValue: (item.marketValue ?? "").toString(),
      edition: EDITION_OPTIONS.includes(item.edition)
        ? item.edition
        : "",
    });
  };

  // Cancel inline edit
  const cancelEdit = () => {
    setEditingId(null);
    setDraft({ marketValue: "", edition: "" });
  };

  // Save inline edit
  const saveEdit = async (id) => {
    const updated = {
      marketValue: Number(draft.marketValue) || 0,
      edition: draft.edition,
    };
    setInventory((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...updated } : i))
    );
    await updateDoc(
      doc(db, "users", uid, "inventory", id),
      updated
    );
    cancelEdit();
  };

  // Filtering & search
  const filtered = inventory
    .filter((item) =>
      !filter ||
      (filter === "cards" && item.type !== "sealed") ||
      (filter === "sealed" && item.type === "sealed")
    )
    .filter((item) =>
      !search ||
      item.cardName?.toLowerCase().includes(search.toLowerCase()) ||
      item.setName?.toLowerCase().includes(search.toLowerCase()) ||
      item.cardNumber?.toLowerCase().includes(search.toLowerCase())
    );

  // Summary stats
  const totalValue = inventory.reduce(
    (sum, c) => sum + (Number(c.marketValue) || 0),
    0
  );
  const totalCards = inventory.filter((c) => c.type !== "sealed").length;
  const totalSealed = inventory.filter((c) => c.type === "sealed").length;

  return (
    <div className="inventory-root">
      <div className="inventory-header-row">
        <h2 className="inventory-title">Inventory</h2>
        <span className="inventory-subheading">
          All items currently in stock.
        </span>

        <label className="inventory-action-btn">
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

        <button
          className="inventory-action-btn"
          onClick={handleUpdatePrices}
          disabled={updatingPrices}
        >
          {updatingPrices ? "Updating…" : "Update Prices"}
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
      ) : filtered.length === 0 ? (
        <div className="inventory-empty">
          No items found in inventory.
        </div>
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
              <th>Edition</th>
              <th>Date Added</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td className="card-name">
                  {item.cardName || item.productName}
                </td>
                <td className="card-set">
                  {item.setName || item.productType}
                </td>
                <td>{item.cardNumber || item.quantity}</td>
                <td>
                  {editingId === item.id ? (
                    <input
                      type="text"
                      className="inventory-input inline-edit-input"
                      value={draft.marketValue}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          marketValue: e.target.value,
                        }))
                      }
                    />
                  ) : (
                    `$${Number(item.marketValue || 0).toFixed(2)}`
                  )}
                </td>
                <td className="acquisition-cost">
                  ${Number(item.acquisitionCost || 0).toFixed(2)}
                </td>
                <td className="condition">{item.condition}</td>
                <td>
                  {editingId === item.id ? (
                    <select
                      className="inventory-filter-select inline-edit-select"
                      value={draft.edition}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          edition: e.target.value,
                        }))
                      }
                    >
                      <option value="">—</option>
                      {EDITION_OPTIONS.map((ed) => (
                        <option key={ed} value={ed}>
                          {ed}
                        </option>
                      ))}
                    </select>
                  ) : (
                    item.edition || "—"
                  )}
                </td>
                <td>
                  {item.dateAdded
                    ? new Date(item.dateAdded).toLocaleDateString()
                    : ""}
                </td>
                <td>
                  {editingId === item.id ? (
                    <>
                      <button
                        className="inventory-action-btn inline-save-btn"
                        onClick={() => saveEdit(item.id)}
                      >
                        Save
                      </button>
                      <button
                        className="inventory-action-btn secondary inline-cancel-btn"
                        onClick={cancelEdit}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="inventory-action-btn secondary inline-edit-btn"
                        onClick={() => startEdit(item)}
                      >
                        Edit
                      </button>
                      <button
                        className="delete-btn"
                        onClick={() => handleDelete(item.id)}
                      >
                        ❌
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="inventory-summary-row">
        <div className="inventory-summary-box">
          <div className="inventory-summary-title">
            Inventory Value
          </div>
          <div className="inventory-summary-value">
            ${totalValue.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>
        <div className="inventory-summary-box">
          <div className="inventory-summary-title">Cards</div>
          <div className="inventory-summary-value">
            {totalCards}
          </div>
        </div>
        <div className="inventory-summary-box">
          <div className="inventory-summary-title">Sealed</div>
          <div className="inventory-summary-value">
            {totalSealed}
          </div>
        </div>
      </div>
    </div>
  );
}
