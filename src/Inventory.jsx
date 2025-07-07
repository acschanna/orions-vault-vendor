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
  setDoc,
} from "firebase/firestore";

const accentGreen = "#00b84a";
const cardDark = "#181b1e";
const fontFamily = `'Inter', Arial, Helvetica, sans-serif`;
const API_KEY = 'd49129a9-8f4c-4130-968a-cd47501df765';
const CARDS_PER_PAGE = 25;

const SETS_WITH_EDITION = [
  "base1", "base2", "jungle", "fossil", "teamrocket", "gymheroes", "gymchallenge",
  "neoGenesis", "neoDiscovery", "neoRevelation", "neoDestiny", "legendarycollection"
];

function toCsvValue(v) {
  if (typeof v !== "string") v = String(v);
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}
function fromCsvRow(row) {
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

async function fetchInventory(uid) {
  const invRef = collection(db, "users", uid, "inventory");
  const q = query(invRef, orderBy("dateAdded", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}
async function updateInventory(uid, cardId, card) {
  const cardRef = doc(db, "users", uid, "inventory", cardId);
  await updateDoc(cardRef, { ...card });
}
async function deleteInventory(uid, cardId) {
  const cardRef = doc(db, "users", uid, "inventory", cardId);
  await deleteDoc(cardRef);
}
async function addInventory(uid, card) {
  const invRef = collection(db, "users", uid, "inventory");
  await addDoc(invRef, {
    ...card,
    dateAdded: card.dateAdded || new Date().toISOString(),
    createdAt: serverTimestamp(),
  });
}
async function importCsvToInventory(uid, csvRows, setProgress) {
  const invRef = collection(db, "users", uid, "inventory");
  const batch = writeBatch(db);
  let added = 0;
  for (let i = 0; i < csvRows.length; ++i) {
    const card = csvRows[i];
    const newDoc = doc(invRef);
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

function supportsEdition(card) {
  if (!card?.setName) return false;
  const normalized = card.setName.replace(/\s+/g, "").toLowerCase();
  return SETS_WITH_EDITION.some(id =>
    normalized.includes(id.replace(/[^a-z0-9]/gi, "").toLowerCase())
  );
}

function EditionIcon({ edition }) {
  if (!edition) return <span style={{ color: "#bbb" }}>-</span>;
  if (edition === "firstEdition") return <span title="1st Edition" style={{
    display: "inline-block", background: "#a7a2f7", color: "#23143d", borderRadius: "6px",
    fontWeight: 700, fontSize: 13, padding: "2px 7px", marginLeft: 5
  }}>1st</span>;
  if (edition === "unlimited") return <span title="Unlimited" style={{
    display: "inline-block", background: "#d4fba7", color: "#1a3112", borderRadius: "6px",
    fontWeight: 700, fontSize: 13, padding: "2px 7px", marginLeft: 5
  }}>U</span>;
  return <span style={{ color: "#bbb" }}>-</span>;
}

function Inventory() {
  const user = useUser();
  const uid = user?.uid;
  const fileRef = useRef();

  const [inventory, setInventory] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState({});
  const [inlineEditIdx, setInlineEditIdx] = useState(null);
  const [inlineEditValue, setInlineEditValue] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [undoCard, setUndoCard] = useState(null);
  const [undoTimeout, setUndoTimeout] = useState(null);
  const [bulkSelected, setBulkSelected] = useState([]);
  const [importResult, setImportResult] = useState("");
  const [importProgress, setImportProgress] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState("");
  const [sortField, setSortField] = useState("dateAdded");
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState("");
  const [filterEdition, setFilterEdition] = useState("");
  const [filterSet, setFilterSet] = useState("");
  const [filterValueMin, setFilterValueMin] = useState("");
  const [filterValueMax, setFilterValueMax] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    fetchInventory(uid).then(inv => {
      setInventory(inv);
      setLoading(false);
    });
  }, [uid]);

  useEffect(() => {
    let arr = [...inventory];
    if (search.trim()) {
      arr = arr.filter(c =>
        (c.cardName || "").toLowerCase().includes(search.toLowerCase()) ||
        (c.setName || "").toLowerCase().includes(search.toLowerCase())
      );
    }
    if (filterEdition) arr = arr.filter(c => (c.edition || "") === filterEdition);
    if (filterSet) arr = arr.filter(c => (c.setName || "") === filterSet);
    if (filterValueMin) arr = arr.filter(c => Number(c.marketValue) >= Number(filterValueMin));
    if (filterValueMax) arr = arr.filter(c => Number(c.marketValue) <= Number(filterValueMax));
    arr.sort((a, b) => {
      let valA = a[sortField] ?? "", valB = b[sortField] ?? "";
      if (sortField === "marketValue" || sortField === "acquisitionCost") {
        valA = Number(valA); valB = Number(valB);
      } else if (typeof valA === "string") {
        valA = valA.toLowerCase(); valB = valB.toLowerCase();
      }
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
    setFiltered(arr);
    setPage(1);
  }, [inventory, search, filterEdition, filterSet, filterValueMin, filterValueMax, sortField, sortAsc]);

  const uniqueSets = Array.from(new Set(inventory.map(card => card.setName).filter(Boolean))).sort();
  const paginated = filtered.slice((page - 1) * CARDS_PER_PAGE, page * CARDS_PER_PAGE);
  const numPages = Math.ceil(filtered.length / CARDS_PER_PAGE);

  function handleSort(field) {
    if (sortField === field) setSortAsc(a => !a);
    else {
      setSortField(field);
      setSortAsc(field === "marketValue" || field === "acquisitionCost" ? false : true);
    }
  }

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
    setEditing(null); setEditData({});
    setTimeout(refresh, 100);
  }
  function cancelEdit() {
    setEditing(null);
    setEditData({});
  }

  function startInlineEdit(idx, value) {
    setInlineEditIdx(idx);
    setInlineEditValue(value !== undefined && value !== null ? value : "");
  }
  async function saveInlineEdit(idx) {
    if (!uid || !paginated[idx]) return;
    let val = Number(inlineEditValue);
    if (isNaN(val) || val < 0) val = 0;
    await updateInventory(uid, paginated[idx].id, {
      ...paginated[idx],
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

  function confirmDelete(id) {
    setDeleteId(id);
  }
  async function doDelete() {
    if (!uid || !deleteId) return;
    const card = inventory.find(c => c.id === deleteId);
    setUndoCard({ ...card });
    setUndoTimeout(setTimeout(() => setUndoCard(null), 8000));
    await deleteInventory(uid, deleteId);
    setDeleteId(null);
    setTimeout(refresh, 150);
  }
  async function undoDelete() {
    if (!uid || !undoCard) return;
    await setDoc(doc(db, "users", uid, "inventory", undoCard.id), undoCard);
    setUndoCard(null);
    clearTimeout(undoTimeout);
    setTimeout(refresh, 100);
  }

  function toggleBulk(cardId) {
    setBulkSelected(selected =>
      selected.includes(cardId)
        ? selected.filter(id => id !== cardId)
        : [...selected, cardId]
    );
  }
  function selectAllVisible() {
    setBulkSelected(paginated.map(c => c.id));
  }
  function clearBulk() {
    setBulkSelected([]);
  }
  async function bulkDelete() {
    if (!uid || !bulkSelected.length) return;
    for (const id of bulkSelected) await deleteInventory(uid, id);
    setBulkSelected([]); setTimeout(refresh, 400);
  }
  async function bulkSetEdition(edition) {
    if (!uid || !bulkSelected.length) return;
    for (const id of bulkSelected) {
      const card = inventory.find(c => c.id === id);
      if (supportsEdition(card)) await updateInventory(uid, id, { ...card, edition });
    }
    setBulkSelected([]); setTimeout(refresh, 400);
  }
  function bulkExport() {
    const fields = [
      "id", "setName", "cardName", "cardNumber", "condition", "edition",
      "marketValue", "acquisitionCost", "dateAdded"
    ];
    const rows = [fields.join(",")];
    inventory.filter(c => bulkSelected.includes(c.id)).forEach(card => {
      rows.push(fields.map(f => toCsvValue(card[f] || "")).join(","));
    });
    const csv = rows.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory_bulk_export_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    setBulkSelected([]);
  }

  function exportCsv() {
    const fields = [
      "id", "setName", "cardName", "cardNumber", "condition", "edition",
      "marketValue", "acquisitionCost", "dateAdded"
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
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  async function importCsv(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(evt) {
      const lines = evt.target.result.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { setImportResult("File has no rows!"); return; }
      const fields = [
        "id", "setName", "cardName", "cardNumber", "condition", "edition",
        "marketValue", "acquisitionCost", "dateAdded"
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

  function niceDate(dt) {
    if (!dt) return "";
    try {
      const d = new Date(dt);
      return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dt;
    }
  }

  // -- Price Refresh --
  async function refreshInventoryPrices() {
    if (!uid) return;
    setRefreshing(true);
    setRefreshProgress("Checking latest prices...");
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
    setTimeout(() => setRefreshProgress(""), 1200);
    setTimeout(refresh, 600);
    alert("Inventory prices refreshed!");
  }

  // Fetch current market value from PokémonTCG.io
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
      {/* Top bar */}
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
      {/* Search and Filter Bar */}
      <div style={{
        margin: "16px 0 6px", display: "flex", alignItems: "center", flexWrap: "wrap",
        gap: 10, background: "#19231c", padding: "14px 14px 10px 14px", borderRadius: 9
      }}>
        <input
          style={{ ...inputStyle, width: 190, minWidth: 0, fontSize: 16, background: "#121413" }}
          placeholder="Search name or set"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") setPage(1);
          }}
        />

        <select style={{ ...inputStyle, minWidth: 110 }}
          value={filterSet}
          onChange={e => setFilterSet(e.target.value)}
        >
          <option value="">All Sets</option>
          {uniqueSets.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={{ ...inputStyle, minWidth: 110 }}
          value={filterEdition}
          onChange={e => setFilterEdition(e.target.value)}
        >
          <option value="">All Editions</option>
          <option value="firstEdition">1st Edition</option>
          <option value="unlimited">Unlimited</option>
        </select>
        <input
          type="number"
          style={{ ...inputStyle, width: 86, minWidth: 0 }}
          placeholder="Min $"
          value={filterValueMin}
          onChange={e => setFilterValueMin(e.target.value)}
        />
        <input
          type="number"
          style={{ ...inputStyle, width: 86, minWidth: 0 }}
          placeholder="Max $"
          value={filterValueMax}
          onChange={e => setFilterValueMax(e.target.value)}
        />
        <button style={btnClear} onClick={() => {
          setSearch(""); setFilterEdition(""); setFilterSet(""); setFilterValueMin(""); setFilterValueMax("");
        }}>Clear</button>
      </div>
      {/* Bulk Actions Bar */}
      {bulkSelected.length > 0 && (
        <div style={{
          margin: "0 0 9px", background: "#172a1e", padding: 9, borderRadius: 7,
          color: "#ddffd7", fontWeight: 600, display: "flex", alignItems: "center", gap: 14
        }}>
          <span>{bulkSelected.length} selected</span>
          <button style={btnDelete} onClick={bulkDelete}>Delete</button>
          <button style={btnExport} onClick={bulkExport}>Export</button>
          <button style={btnClear} onClick={() => bulkSetEdition("firstEdition")}>Set 1st Ed</button>
          <button style={btnClear} onClick={() => bulkSetEdition("unlimited")}>Set Unlimited</button>
          <button style={btnClear} onClick={clearBulk}>Clear</button>
        </div>
      )}
      {/* Refresh Prices */}
      <button
        style={{
          background: accentGreen,
          color: "#181b1e",
          fontWeight: 700,
          borderRadius: 7,
          padding: "8px 20px",
          marginBottom: 14,
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
          color: "#fff", background: "#00aaff", padding: "7px 22px", marginBottom: 12,
          borderRadius: 8, fontWeight: 600, width: "fit-content"
        }}>{importProgress}</div>
      )}
      {importResult && (
        <div style={{
          color: "#fff", background: accentGreen, padding: "7px 22px", marginBottom: 12,
          borderRadius: 8, fontWeight: 600, width: "fit-content"
        }}>{importResult}</div>
      )}
      {undoCard && (
        <div style={{
          margin: "0 0 14px", background: "#293c1e", padding: 12, borderRadius: 8, fontWeight: 600,
          color: "#f3ffc4", display: "flex", alignItems: "center", gap: 13
        }}>
          Deleted "{undoCard.cardName}" from {undoCard.setName}.
          <button style={btnSave} onClick={undoDelete}>Undo</button>
        </div>
      )}
      {loading ? (
        <div style={{ color: accentGreen, padding: 40, textAlign: "center" }}>Loading inventory...</div>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
              <thead>
                <tr style={{ background: "#18241d" }}>
                  <th style={thStyle}>
                    <input type="checkbox"
                      checked={paginated.length && bulkSelected.length === paginated.length}
                      onChange={e => e.target.checked ? selectAllVisible() : clearBulk()}
                    />
                  </th>
                  <th style={thStyle} onClick={() => handleSort("setName")}>Set</th>
                  <th style={thStyle} onClick={() => handleSort("cardName")}>Card Name</th>
                  <th style={thStyle} onClick={() => handleSort("cardNumber")}>Number</th>
                  <th style={thStyle} onClick={() => handleSort("condition")}>Condition</th>
                  <th style={thStyle} onClick={() => handleSort("edition")}>Edition</th>
                  <th style={thStyle} onClick={() => handleSort("marketValue")}>Market Value</th>
                  <th style={thStyle} onClick={() => handleSort("acquisitionCost")}>Acquisition Cost</th>
                  <th style={thStyle} onClick={() => handleSort("dateAdded")}>Date Added</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ color: "#ddd", textAlign: "center", padding: 36 }}>
                      No cards in inventory yet.
                    </td>
                  </tr>
                ) : (
                  paginated.map((card, idx) => (
                    <tr key={card.id}>
                      <td style={tdStyle}>
                        <input
                          type="checkbox"
                          checked={bulkSelected.includes(card.id)}
                          onChange={() => toggleBulk(card.id)}
                        />
                      </td>
                      <td style={tdStyle}>{card.setName || ""}</td>
                      <td style={tdStyle}>{card.cardName}</td>
                      <td style={tdStyle}>{card.cardNumber}</td>
                      <td style={tdStyle}>{card.condition}</td>
                      <td style={tdStyle}>
                        {supportsEdition(card)
                          ? <EditionIcon edition={card.edition || ""} />
                          : <span style={{ color: "#a3ffb4" }}>-</span>
                        }
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
          {/* Pagination */}
          {numPages > 1 && (
            <div style={{ textAlign: "center", marginTop: 15 }}>
              <button
                style={btnPageNav}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >Prev</button>
              <span style={{ margin: "0 14px", color: "#fff", fontWeight: 700 }}>
                Page {page} of {numPages}
              </span>
              <button
                style={btnPageNav}
                onClick={() => setPage(p => Math.min(numPages, p + 1))}
                disabled={page === numPages}
              >Next</button>
            </div>
          )}
        </>
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
                    value={editData.edition ?? ""}
                    onChange={e => handleEditChange("edition", e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">(empty)</option>
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

const thStyle = {
  color: "#caffea", fontWeight: 700, padding: "13px 7px", fontSize: 16,
  borderBottom: "1.5px solid #184828", letterSpacing: ".5px", background: "#1c2d20",
};
const tdStyle = {
  color: "#fff", padding: "10px 7px", fontSize: 15, textAlign: "left",
  borderBottom: "1px solid #192822", maxWidth: 220, wordBreak: "break-all"
};
const btnEdit = {
  background: "#223", color: "#fff", border: "1px solid #33c669", borderRadius: 5,
  fontWeight: 700, padding: "4px 14px", marginRight: 4, cursor: "pointer", fontSize: 14
};
const btnDelete = {
  background: "#a22", color: "#fff", border: "none", borderRadius: 5, fontWeight: 700,
  padding: "4px 14px", marginRight: 4, cursor: "pointer", fontSize: 14
};
const btnSave = {
  background: accentGreen, color: "#181b1e", border: "none", borderRadius: 6,
  fontWeight: 800, padding: "7px 20px", fontSize: 16, cursor: "pointer", marginRight: 8,
};
const btnCancel = {
  background: "#23262a", color: "#fff", padding: "7px 20px", border: `1.5px solid #444`,
  borderRadius: 6, fontWeight: 700, fontSize: 16, cursor: "pointer"
};
const btnExport = {
  background: accentGreen, color: "#181b1e", border: "none", borderRadius: 7,
  fontWeight: 700, padding: "8px 20px", fontSize: 15, cursor: "pointer", marginRight: 12,
};
const btnImport = {
  background: "#223", color: "#fff", border: `1px solid ${accentGreen}`,
  borderRadius: 7, fontWeight: 700, padding: "8px 20px", fontSize: 15, cursor: "pointer",
};
const btnClear = {
  background: "#233", color: "#fff", border: `1px solid #888`, borderRadius: 7,
  fontWeight: 700, padding: "8px 16px", fontSize: 14, cursor: "pointer",
};
const btnPageNav = {
  background: "#333", color: "#caffea", border: `1px solid #222`, borderRadius: 7,
  fontWeight: 700, padding: "7px 18px", fontSize: 15, cursor: "pointer",
};
const inputLabel = { color: "#baffda", marginRight: 8, fontWeight: 600, minWidth: 90, display: "inline-block" };
const inputStyle = {
  padding: 7, borderRadius: 5, border: "1px solid #444",
  background: "#181b1e", color: "#fff", minWidth: 140, fontSize: 15, marginRight: 2
};
const modalOverlay = {
  position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
  background: "rgba(20,30,20,.97)", zIndex: 9999, display: "flex",
  alignItems: "center", justifyContent: "center"
};
const modalBox = {
  background: "#181f19", color: "#fff", border: `2px solid ${accentGreen}`,
  borderRadius: 15, minWidth: 320, maxWidth: 420, padding: 32, boxShadow: "0 8px 44px #00b84a28"
};

export default Inventory;
