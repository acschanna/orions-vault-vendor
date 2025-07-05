import React, { useState, useEffect, useRef } from "react";
import { useUser } from "./App";
import { db } from "./firebase";
import {
  collection,
  query,
  orderBy,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

// --- Style & User Helpers ---
const accentGreen = "#00b84a";
const cardDark = "#181b1e";
const fontFamily = `'Inter', Arial, Helvetica, sans-serif`;
const API_KEY = 'd49129a9-8f4c-4130-968a-cd47501df765';

// Sets that have 1st/Unlimited editions
const SETS_WITH_EDITION = [
  "base1", "base2", "jungle", "fossil", "teamrocket", "gymheroes", "gymchallenge",
  "neoGenesis", "neoDiscovery", "neoRevelation", "neoDestiny", "legendarycollection"
];

// CSV helpers (same as before)
function toCsvValue(v) {
  if (typeof v !== "string") v = String(v);
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}
function fromCsvRow(row) {
  // Very basic CSV, split by comma unless quoted
  const reg = /("([^"]|"")*"|[^,]*)(,|$)/g;
  let match, result = [];
  while ((match = reg.exec(row))) {
    let val = match[1];
    if (val[0] === '"') val = val.slice(1, -1).replace(/""/g, '"');
    result.push(val);
    if (match[3] === "") break;
  }
  return result;
}

// Firebase CRUD for inventory
async function fetchInventory(uid) {
  const invRef = collection(db, "users", uid, "inventory");
  const q = query(invRef, orderBy("dateAdded", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}
async function addInventory(uid, card) {
  const invRef = collection(db, "users", uid, "inventory");
  await addDoc(invRef, {
    ...card,
    dateAdded: card.dateAdded || new Date().toISOString(),
    createdAt: serverTimestamp(),
  });
}
async function updateInventory(uid, cardId, card) {
  const cardRef = doc(db, "users", uid, "inventory", cardId);
  await updateDoc(cardRef, { ...card });
}
async function deleteInventory(uid, cardId) {
  const cardRef = doc(db, "users", uid, "inventory", cardId);
  await deleteDoc(cardRef);
}

// Bulk import
async function importCsvToInventory(uid, csvRows, setProgress) {
  const invRef = collection(db, "users", uid, "inventory");
  const batch = writeBatch(db);
  let added = 0;
  for (let i = 0; i < csvRows.length; ++i) {
    const card = csvRows[i];
    const newDoc = doc(invRef); // random id
    batch.set(newDoc, {
      ...card,
      dateAdded: card.dateAdded || new Date().toISOString(),
      createdAt: serverTimestamp(),
    });
    added++;
    if (setProgress && i % 10 === 0) setProgress(`${added} cards queued...`);
  }
  await batch.commit();
  if (setProgress) setProgress(`${added} cards imported!`);
  return added;
}

// -- Helper: should this card get edition editing? --
function supportsEdition(card) {
  if (!card?.setName) return false;
  // Check setName by fuzzy match (for imports) or set.id for consistent cards
  const normalized = card.setName.replace(/\s+/g, "").toLowerCase();
  return SETS_WITH_EDITION.some(id =>
    normalized.includes(id.replace(/[^a-z0-9]/gi, "").toLowerCase())
  );
}

// --- Price refresh logic ---
async function getCurrentMarketValue(card) {
  if (!card?.tcgPlayerId) return card.marketValue;
  let url = `https://api.pokemontcg.io/v2/cards/${card.tcgPlayerId}`;
  try {
    const res = await fetch(url, { headers: { 'X-Api-Key': API_KEY } });
    const data = await res.json();
    if (!data.data) return card.marketValue;
    const prices = data.data.tcgplayer?.prices;
    if (!prices) return card.marketValue;
    if (supportsEdition(card) && card.edition === "firstEdition") {
      return (
        prices["1stEdition"]?.market ??
        prices["1stEditionHolofoil"]?.market ??
        prices["1stEditionNormal"]?.market ??
        card.marketValue
      );
    } else {
      return (
        prices.normal?.market ??
        prices.holofoil?.market ??
        prices.reverseHolofoil?.market ??
        card.marketValue
      );
    }
  } catch {
    return card.marketValue;
  }
}

function Inventory() {
  const user = useUser();
  const uid = user?.uid;

  // Main state
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState({});
  const [inlineEditIdx, setInlineEditIdx] = useState(null);
  const [inlineEditValue, setInlineEditValue] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [importResult, setImportResult] = useState("");
  const [importProgress, setImportProgress] = useState("");
  const [refreshing, setRefreshing] = useState(false); // New for price refresh
  const [refreshProgress, setRefreshProgress] = useState(""); // New for price refresh
  const fileRef = useRef();

  // Load from Firestore on mount or user change
  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    fetchInventory(uid).then(inv => {
      setInventory(inv);
      setLoading(false);
    });
  }, [uid]);

  // Reload inventory
  const refresh = () => {
    if (!uid) return;
    setLoading(true);
    fetchInventory(uid).then(inv => {
      setInventory(inv);
      setLoading(false);
    });
  };

  // --- Refresh Inventory Prices ---
  async function refreshInventoryPrices() {
    if (!uid) return;
    setRefreshing(true);
    setRefreshProgress("Checking latest prices...");
    // Get all inventory docs
    const snap = await getDocs(collection(db, "users", uid, "inventory"));
    let i = 0;
    for (let docSnap of snap.docs) {
      i++;
      setRefreshProgress(`Updating ${i} of ${snap.size}...`);
      const card = docSnap.data();
      const newPrice = await getCurrentMarketValue(card);
      if (Math.abs(Number(newPrice) - Number(card.marketValue)) > 0.01) {
        await updateDoc(doc(db, "users", uid, "inventory", docSnap.id), {
          marketValue: newPrice,
          lastMarketValue: card.marketValue,
          lastMarketValueUpdate: new Date().toISOString()
        });
      }
    }
    setRefreshProgress("");
    setRefreshing(false);
    refresh();
    alert("Inventory prices refreshed!");
  }

  // --- Edit modal handlers (edition edit support) ---
  function startEdit(card) {
    setEditing(card);
    setEditData({ ...card });
  }
  function handleEditChange(field, value) {
    setEditData((data) => ({ ...data, [field]: value }));
  }
  async function saveEdit() {
    if (!uid || !editing) return;
    await updateInventory(uid, editing.id, editData);
    setEditing(null);
    setEditData({});
    setTimeout(refresh, 100);
  }
  function cancelEdit() {
    setEditing(null);
    setEditData({});
  }

  // Inline market value edit handlers
  function startInlineEdit(idx, value) {
    setInlineEditIdx(idx);
    setInlineEditValue(value !== undefined && value !== null ? value : "");
  }
  async function saveInlineEdit(idx) {
    if (!uid || !inventory[idx]) return;
    let val = Number(inlineEditValue);
    if (isNaN(val) || val < 0) val = 0;
    await updateInventory(uid, inventory[idx].id, {
      ...inventory[idx],
      marketValue: val,
    });
    setInlineEditIdx(null);
    setInlineEditValue("");
    setTimeout(refresh, 100);
  }
  function cancelInlineEdit() {
    setInlineEditIdx(null);
    setInlineEditValue("");
  }

  // Delete handlers
  function confirmDelete(id) {
    setDeleteId(id);
  }
  async function doDelete() {
    if (!uid || !deleteId) return;
    await deleteInventory(uid, deleteId);
    setDeleteId(null);
    setTimeout(refresh, 100);
  }

  // CSV Export (add edition to export)
  function exportCsv() {
    const fields = [
      "id",
      "setName",
      "cardName",
      "cardNumber",
      "condition",
      "edition", // <-- new
      "marketValue",
      "acquisitionCost",
      "dateAdded"
    ];
    const rows = [fields.join(",")];
    inventory.forEach(card => {
      rows.push(fields.map(f => toCsvValue(card[f] || "")).join(","));
    });
    const csv = rows.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory_export_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  // CSV Import
  function importCsv(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(evt) {
      const lines = evt.target.result.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { setImportResult("File has no rows!"); return; }
      const fields = [
        "id",
        "setName",
        "cardName",
        "cardNumber",
        "condition",
        "edition", // <-- new
        "marketValue",
        "acquisitionCost",
        "dateAdded"
      ];
      let cards = [];
      for (let i=1; i<lines.length; ++i) {
        let vals = fromCsvRow(lines[i]);
        let obj = {};
        for (let j=0; j<fields.length; ++j) obj[fields[j]] = vals[j] || "";
        cards.push(obj);
      }
      setImportProgress("Importing...");
      await importCsvToInventory(uid, cards, setImportProgress);
      setImportResult(`Imported ${cards.length} card(s)!`);
      setImportProgress("");
      setTimeout(refresh, 600);
      fileRef.current.value = "";
      setTimeout(() => setImportResult(""), 2500);
    };
    reader.readAsText(file);
  }

  // Format date
  function niceDate(dt) {
    if (!dt) return "";
    try {
      const d = new Date(dt);
      return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dt;
    }
  }

  // ---- UI ----
  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        background: cardDark,
        borderRadius: 16,
        boxShadow: "0 2px 12px #121b1277",
        padding: 28,
        minHeight: 300,
        fontFamily,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ color: accentGreen, marginTop: 0, fontWeight: 800, fontSize: 28 }}>
          Inventory
        </h2>
        <div>
          <button style={btnExport} onClick={exportCsv} disabled={loading || !inventory.length}>Export CSV</button>
          <input
            type="file"
            accept=".csv"
            ref={fileRef}
            style={{ display: "none" }}
            onChange={importCsv}
          />
          <button style={btnImport} onClick={() => fileRef.current.click()} disabled={loading}>Import CSV</button>
        </div>
      </div>
      <button
        style={{
          background: accentGreen,
          color: "#181b1e",
          fontWeight: 700,
          borderRadius: 7,
          padding: "8px 20px",
          marginBottom: 20,
          fontSize: 15,
          cursor: refreshing ? "not-allowed" : "pointer"
        }}
        onClick={refreshInventoryPrices}
        disabled={refreshing}
      >
        {refreshing ? (refreshProgress || "Refreshing...") : "Refresh Inventory Prices"}
      </button>
      {importProgress && (
        <div style={{
          color: "#fff",
          background: "#00aaff",
          padding: "7px 22px",
          marginBottom: 12,
          borderRadius: 8,
          fontWeight: 600,
          width: "fit-content"
        }}>{importProgress}</div>
      )}
      {importResult && (
        <div style={{
          color: "#fff",
          background: accentGreen,
          padding: "7px 22px",
          marginBottom: 12,
          borderRadius: 8,
          fontWeight: 600,
          width: "fit-content"
        }}>{importResult}</div>
      )}
      {loading ? (
        <div style={{ color: accentGreen, padding: 40, textAlign: "center" }}>Loading inventory...</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 18 }}>
            <thead>
              <tr style={{ background: "#18241d" }}>
                <th style={thStyle}>Set</th>
                <th style={thStyle}>Card Name</th>
                <th style={thStyle}>Number</th>
                <th style={thStyle}>Condition</th>
                <th style={thStyle}>Edition</th>
                <th style={thStyle}>Market Value</th>
                <th style={thStyle}>Acquisition Cost</th>
                <th style={thStyle}>Date Added</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {inventory.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ color: "#ddd", textAlign: "center", padding: 36 }}>
                    No cards in inventory yet.
                  </td>
                </tr>
              ) : (
                inventory.map((card, idx) => (
                  <tr key={card.id}>
                    <td style={tdStyle}>{card.setName || ""}</td>
                    <td style={tdStyle}>{card.cardName}</td>
                    <td style={tdStyle}>{card.cardNumber}</td>
                    <td style={tdStyle}>{card.condition}</td>
                    {/* --- Edition column --- */}
                    <td style={tdStyle}>
                      {supportsEdition(card) ? (
                        <span style={{ color: card.edition === "firstEdition" ? "#b6b4fd" : "#eaffae" }}>
                          {card.edition === "firstEdition" ? "1st Edition" : "Unlimited"}
                        </span>
                      ) : (
                        <span style={{ color: "#a3ffb4" }}>-</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, color: accentGreen }}>
                      {inlineEditIdx === idx ? (
                        <form
                          onSubmit={e => { e.preventDefault(); saveInlineEdit(idx); }}
                          style={{ display: "flex", alignItems: "center", gap: 7 }}
                        >
                          <input
                            type="number"
                            step="0.01"
                            value={inlineEditValue}
                            onChange={e => setInlineEditValue(e.target.value)}
                            style={{
                              width: 70,
                              padding: 5,
                              background: "#202526",
                              color: "#fff",
                              border: `1.5px solid ${accentGreen}`,
                              borderRadius: 6,
                              fontSize: 15
                            }}
                            autoFocus
                          />
                          <button
                            type="submit"
                            style={{
                              background: accentGreen,
                              color: "#181b1e",
                              border: "none",
                              borderRadius: 6,
                              padding: "2px 10px",
                              fontWeight: 700,
                              cursor: "pointer"
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={cancelInlineEdit}
                            style={{
                              background: "#333",
                              color: "#fff",
                              border: "none",
                              borderRadius: 6,
                              padding: "2px 9px",
                              fontWeight: 700,
                              cursor: "pointer"
                            }}
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <span>
                          ${Number(card.marketValue || 0).toFixed(2)}{" "}
                          <button
                            onClick={() => startInlineEdit(idx, card.marketValue)}
                            style={{
                              marginLeft: 7,
                              background: "none",
                              border: "none",
                              color: "#d5ffa9",
                              fontSize: 16,
                              cursor: "pointer"
                            }}
                            title="Edit value"
                          >✎</button>
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, color: "#8cd4aa" }}>${Number(card.acquisitionCost || 0).toFixed(2)}</td>
                    <td style={tdStyle}>{niceDate(card.dateAdded)}</td>
                    <td style={tdStyle}>
                      <button
                        style={btnEdit}
                        onClick={() => startEdit(card)}
                      >
                        Edit
                      </button>
                      <button
                        style={btnDelete}
                        onClick={() => confirmDelete(card.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div style={modalOverlay} onClick={cancelEdit}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: accentGreen, fontWeight: 700, fontSize: 22 }}>Edit Card</h3>
            <div style={{ margin: "12px 0" }}>
              <Input label="Set" value={editData.setName} onChange={v => handleEditChange("setName", v)} />
              <Input label="Card Name" value={editData.cardName} onChange={v => handleEditChange("cardName", v)} />
              <Input label="Number" value={editData.cardNumber} onChange={v => handleEditChange("cardNumber", v)} />
              <div style={{ marginBottom: 10 }}>
                <label style={inputLabel}>Condition:</label>
                <select
                  value={editData.condition}
                  onChange={e => handleEditChange("condition", e.target.value)}
                  style={inputStyle}
                >
                  <option value="NM">NM</option>
                  <option value="LP">LP</option>
                  <option value="MP">MP</option>
                  <option value="HP">HP</option>
                  <option value="DMG">DMG</option>
                </select>
              </div>
              {supportsEdition(editData) && (
                <div style={{ marginBottom: 10 }}>
                  <label style={inputLabel}>Edition:</label>
                  <select
                    value={editData.edition || "unlimited"}
                    onChange={e => handleEditChange("edition", e.target.value)}
                    style={inputStyle}
                  >
                    <option value="unlimited">Unlimited</option>
                    <option value="firstEdition">1st Edition</option>
                  </select>
                </div>
              )}
              <Input
                label="Market Value"
                type="number"
                value={editData.marketValue}
                onChange={v => handleEditChange("marketValue", v)}
                prefix="$"
              />
              <Input
                label="Acquisition Cost"
                type="number"
                value={editData.acquisitionCost}
                onChange={v => handleEditChange("acquisitionCost", v)}
                prefix="$"
              />
              <Input
                label="Date Added"
                value={editData.dateAdded}
                onChange={v => handleEditChange("dateAdded", v)}
              />
            </div>
            <div style={{ textAlign: "right", marginTop: 20 }}>
              <button
                style={btnSave}
                onClick={saveEdit}
              >Save</button>
              <button
                style={btnCancel}
                onClick={cancelEdit}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation */}
      {deleteId && (
        <div style={modalOverlay} onClick={() => setDeleteId(null)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: "#f56565", fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Delete Card?</h3>
            <div style={{ marginBottom: 16, color: "#fff" }}>
              Are you sure you want to delete this card from inventory?
            </div>
            <div style={{ textAlign: "right" }}>
              <button
                style={btnDelete}
                onClick={doDelete}
              >Delete</button>
              <button
                style={btnCancel}
                onClick={() => setDeleteId(null)}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Simple styled input for edit modal
function Input({ label, value, onChange, type = "text", prefix = "" }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={inputLabel}>{label}:</label>
      <input
        type={type}
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        style={inputStyle}
      />
      {prefix && <span style={{ color: "#aaa", marginLeft: 6 }}>{prefix}</span>}
    </div>
  );
}

// Styles (identical to your original app)
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
  maxWidth: 220,
  wordBreak: "break-all"
};
const btnEdit = {
  background: "#223",
  color: "#fff",
  border: "1px solid #33c669",
  borderRadius: 5,
  fontWeight: 700,
  padding: "4px 14px",
  marginRight: 4,
  cursor: "pointer",
  fontSize: 14
};
const btnDelete = {
  background: "#a22",
  color: "#fff",
  border: "none",
  borderRadius: 5,
  fontWeight: 700,
  padding: "4px 14px",
  marginRight: 4,
  cursor: "pointer",
  fontSize: 14
};
const btnSave = {
  background: accentGreen,
  color: "#181b1e",
  border: "none",
  borderRadius: 6,
  fontWeight: 800,
  padding: "7px 20px",
  fontSize: 16,
  cursor: "pointer",
  marginRight: 8,
};
const btnCancel = {
  background: "#23262a",
  color: "#fff",
  padding: "7px 20px",
  border: `1.5px solid #444`,
  borderRadius: 6,
  fontWeight: 700,
  fontSize: 16,
  cursor: "pointer"
};
const btnExport = {
  background: accentGreen,
  color: "#181b1e",
  border: "none",
  borderRadius: 7,
  fontWeight: 700,
  padding: "8px 20px",
  fontSize: 15,
  cursor: "pointer",
  marginRight: 12,
};
const btnImport = {
  background: "#223",
  color: "#fff",
  border: `1px solid ${accentGreen}`,
  borderRadius: 7,
  fontWeight: 700,
  padding: "8px 20px",
  fontSize: 15,
  cursor: "pointer",
};
const inputLabel = { color: "#baffda", marginRight: 8, fontWeight: 600, minWidth: 90, display: "inline-block" };
const inputStyle = {
  padding: 7,
  borderRadius: 5,
  border: "1px solid #444",
  background: "#181b1e",
  color: "#fff",
  minWidth: 170,
  fontSize: 15,
  marginRight: 2
};
const modalOverlay = {
  position: "fixed",
  top: 0, left: 0, width: "100vw", height: "100vh",
  background: "rgba(20,30,20,.97)",
  zIndex: 9999,
  display: "flex", alignItems: "center", justifyContent: "center"
};
const modalBox = {
  background: "#181f19",
  color: "#fff",
  border: `2px solid ${accentGreen}`,
  borderRadius: 15,
  minWidth: 320,
  maxWidth: 420,
  padding: 32,
  boxShadow: "0 8px 44px #00b84a28"
};

export default Inventory;
