import React, { useEffect, useState, useRef } from "react";
import { useUser } from "./App";
import { db, storage } from "./firebase";
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
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import "./Inventory.css";

const CATEGORY_OPTIONS = [
  "All",
  "Cards",
  "Graded Cards",
  "Sealed Product",
  "Supplies",
  "Accessories",
  "Other"
];
const EDITION_OPTIONS = ["1st Edition", "Unlimited", "Shadowless"];
const GRADING_COMPANIES = [
  "",
  "PSA",
  "BGS",
  "CGC",
  "SGC",
  "Other"
];
const CONDITION_OPTIONS = [
  "Gem Mint",
  "Mint",
  "Near Mint",
  "Light Play",
  "Moderate Play",
  "Heavy Play",
  "Damaged",
  "Authentic",
  "Other"
];
const PTCG_API_KEY = "d49129a9-8f4c-4130-968a-cd47501df765";

// ---- Card Details Modal ----
function CardDetailsModal({ card, onClose }) {
  const modalRef = useRef();
  const [cardImg, setCardImg] = useState(
    card.manualImageUrl ||
    card.imageUrl ||
    card.image ||
    card.cardImage ||
    (card.images && (card.images.large || card.images.medium || card.images.small)) ||
    null
  );
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (cardImg || !card.cardName) return;
    let cancelled = false;
    async function fetchImage() {
      setFetching(true);
      try {
        const url = `https://api.pokemontcg.io/v2/cards?q=name:"${encodeURIComponent(card.cardName)}"${card.setName ? ` set.name:"${encodeURIComponent(card.setName)}"` : ""}${card.cardNumber ? ` number:"${encodeURIComponent(card.cardNumber)}"` : ""}`;
        const res = await fetch(url, {
          headers: { "X-Api-Key": PTCG_API_KEY },
        });
        const json = await res.json();
        let foundImg = null;
        if (json.data && json.data.length > 0) {
          const images = json.data[0].images || {};
          foundImg = images.large || images.medium || images.small || null;
        }
        if (!cancelled && foundImg) setCardImg(foundImg);
      } catch {}
      setFetching(false);
    }
    fetchImage();
    return () => { cancelled = true; };
  }, [cardImg, card.cardName, card.setName, card.cardNumber]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.activeElement;
    if (modalRef.current) modalRef.current.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      if (prev) prev.focus();
    };
  }, [onClose]);

  if (!card) return null;
  return (
    <div className="card-modal-backdrop" onClick={onClose}>
      <div
        className="card-modal"
        tabIndex={-1}
        ref={modalRef}
        onClick={e => e.stopPropagation()}
        aria-modal="true"
        role="dialog"
      >
        <div className="card-modal-header">
          <div className="card-modal-title">
            {card.cardName || card.productName}
            {card.setName ? <> <span className="card-modal-set">({card.setName})</span></> : null}
          </div>
          <button className="card-modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div className="card-modal-body">
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            {cardImg && (
              <img
                src={cardImg}
                alt={card.cardName || card.productName}
                className="card-modal-img-large"
                style={{
                  width: "auto",
                  maxWidth: "97%",
                  maxHeight: "420px",
                  borderRadius: 14,
                  boxShadow: "0 2px 22px #00183399",
                  margin: "0 auto 12px auto",
                  display: "block",
                  background: "#1a2c1a",
                }}
                loading="lazy"
              />
            )}
            {fetching && (
              <div style={{ color: "#00b84a", fontSize: 18, margin: 12 }}>Loading card image…</div>
            )}
            {!fetching && !cardImg && (
              <div style={{ color: "#d88", fontSize: 16, margin: 8 }}>No image available for this card.</div>
            )}
          </div>
          <table className="card-modal-table">
            <tbody>
              <tr>
                <td><b>Name</b></td>
                <td>{card.cardName || card.productName}</td>
              </tr>
              {card.setName && (
                <tr>
                  <td><b>Set</b></td>
                  <td>{card.setName}</td>
                </tr>
              )}
              {card.cardNumber && (
                <tr>
                  <td><b>Card Number</b></td>
                  <td>{card.cardNumber}</td>
                </tr>
              )}
              {card.marketValue !== undefined && (
                <tr>
                  <td><b>Market Value</b></td>
                  <td>${Number(card.marketValue).toFixed(2)}</td>
                </tr>
              )}
              {card.acquisitionCost !== undefined && (
                <tr>
                  <td><b>Acquisition Cost</b></td>
                  <td>${Number(card.acquisitionCost).toFixed(2)}</td>
                </tr>
              )}
              {card.condition && (
                <tr>
                  <td><b>Condition</b></td>
                  <td>{card.condition}</td>
                </tr>
              )}
              {card.edition && (
                <tr>
                  <td><b>Edition</b></td>
                  <td>{card.edition}</td>
                </tr>
              )}
              {card.category && (
                <tr>
                  <td><b>Category</b></td>
                  <td>{card.category}</td>
                </tr>
              )}
              {card.gradingCompany && (
                <tr>
                  <td><b>Grading Co.</b></td>
                  <td>{card.gradingCompany}</td>
                </tr>
              )}
              {card.grade && (
                <tr>
                  <td><b>Grade</b></td>
                  <td>{card.grade}</td>
                </tr>
              )}
              {card.dateAdded && (
                <tr>
                  <td><b>Date Added</b></td>
                  <td>{new Date(card.dateAdded).toLocaleDateString()}</td>
                </tr>
              )}
              {card.quantity && (
                <tr>
                  <td><b>Quantity</b></td>
                  <td>{card.quantity}</td>
                </tr>
              )}
              {card.type && (
                <tr>
                  <td><b>Type</b></td>
                  <td>{card.type}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---- Manual Add Modal ----
function ManualAddModal({ onClose, onSave }) {
  const [cardName, setCardName] = useState("");
  const [category, setCategory] = useState("Cards");
  const [gradingCompany, setGradingCompany] = useState("");
  const [grade, setGrade] = useState("");
  const [setName, setSetName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [condition, setCondition] = useState("Near Mint");
  const [edition, setEdition] = useState("");
  const [marketValue, setMarketValue] = useState("");
  const [acquisitionCost, setAcquisitionCost] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  async function handleSave() {
    if (!cardName || !category) {
      alert("Please enter at least a name and category.");
      return;
    }
    let manualImageUrl = "";
    setUploading(true);
    if (imageFile) {
      try {
        const fileRef = storageRef(
          storage,
          `manual-inventory-images/${Date.now()}_${imageFile.name.replace(/[^a-zA-Z0-9.]/g, "_")}`
        );
        await uploadBytes(fileRef, imageFile);
        manualImageUrl = await getDownloadURL(fileRef);
      } catch {
        alert("Failed to upload image. Try again.");
        setUploading(false);
        return;
      }
    }
    onSave({
      cardName,
      category,
      gradingCompany,
      grade,
      setName,
      cardNumber,
      condition,
      edition,
      marketValue: Number(marketValue) || 0,
      acquisitionCost: Number(acquisitionCost) || 0,
      quantity: Number(quantity) || 1,
      dateAdded: new Date().toISOString(),
      manualImageUrl,
    });
    setUploading(false);
    onClose();
  }

  return (
    <div className="card-modal-backdrop" onClick={onClose}>
      <div
        className="card-modal"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        aria-modal="true"
        role="dialog"
        style={{maxWidth: 500}}
      >
        <div className="card-modal-header">
          <div className="card-modal-title">Add Inventory Item Manually</div>
          <button className="card-modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div className="card-modal-body" style={{padding:20}}>
          {/* Picture input and preview */}
          <div style={{marginBottom:12}}>
            <label>
              Photo:{" "}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={e=>{
                  if (e.target.files && e.target.files[0]) setImageFile(e.target.files[0]);
                }}
                style={{marginLeft:10}}
              />
            </label>
            {imagePreview && (
              <div style={{marginTop:8}}>
                <img
                  src={imagePreview}
                  alt="Preview"
                  style={{maxWidth:140, maxHeight:120, borderRadius:10, border:"1px solid #888"}}
                />
              </div>
            )}
          </div>
          <label style={{display:"block", marginBottom:9}}>
            Name:
            <input
              className="inventory-input"
              style={{marginLeft:8, width:"75%"}}
              value={cardName}
              onChange={e=>setCardName(e.target.value)}
            />
          </label>
          <label style={{display:"block", marginBottom:9}}>
            Category:
            <select
              className="inventory-filter-select"
              style={{marginLeft:8, width:"70%"}}
              value={category}
              onChange={e=>setCategory(e.target.value)}
            >
              {CATEGORY_OPTIONS.filter(opt => opt !== "All").map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
          <label style={{display:"block", marginBottom:9}}>
            Grading Company:
            <select
              className="inventory-filter-select"
              style={{marginLeft:8, width:"70%"}}
              value={gradingCompany}
              onChange={e=>setGradingCompany(e.target.value)}
            >
              {GRADING_COMPANIES.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
          <label style={{display:"block", marginBottom:9}}>
            Grade:
            <input
              className="inventory-input"
              style={{marginLeft:8, width:"50%"}}
              value={grade}
              onChange={e=>setGrade(e.target.value)}
              placeholder="e.g. 10, 9.5, Authentic"
            />
          </label>
          <label style={{display:"block", marginBottom:9}}>
            Set Name:
            <input
              className="inventory-input"
              style={{marginLeft:8, width:"75%"}}
              value={setName}
              onChange={e=>setSetName(e.target.value)}
              placeholder="(Optional)"
            />
          </label>
          <label style={{display:"block", marginBottom:9}}>
            Card Number:
            <input
              className="inventory-input"
              style={{marginLeft:8, width:"50%"}}
              value={cardNumber}
              onChange={e=>setCardNumber(e.target.value)}
              placeholder="(Optional)"
            />
          </label>
          <label style={{display:"block", marginBottom:9}}>
            Condition:
            <select
              className="inventory-filter-select"
              style={{marginLeft:8, width:"60%"}}
              value={condition}
              onChange={e=>setCondition(e.target.value)}
            >
              {CONDITION_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
          <label style={{display:"block", marginBottom:9}}>
            Edition:
            <select
              className="inventory-filter-select"
              style={{marginLeft:8, width:"50%"}}
              value={edition}
              onChange={e=>setEdition(e.target.value)}
            >
              <option value="">—</option>
              {EDITION_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
          <label style={{display:"block", marginBottom:9}}>
            Market Value ($):
            <input
              className="inventory-input"
              style={{marginLeft:8, width:"35%"}}
              type="number"
              step="0.01"
              value={marketValue}
              onChange={e=>setMarketValue(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <label style={{display:"block", marginBottom:9}}>
            Acquisition Cost ($):
            <input
              className="inventory-input"
              style={{marginLeft:8, width:"35%"}}
              type="number"
              step="0.01"
              value={acquisitionCost}
              onChange={e=>setAcquisitionCost(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <label style={{display:"block", marginBottom:9}}>
            Quantity:
            <input
              className="inventory-input"
              style={{marginLeft:8, width:"20%"}}
              type="number"
              min="1"
              value={quantity}
              onChange={e=>setQuantity(e.target.value)}
            />
          </label>
          <button
            className="inventory-action-btn"
            style={{marginTop:10, width:120}}
            onClick={handleSave}
            disabled={uploading}
          >
            {uploading ? "Saving..." : "Save"}
          </button>
          <button
            className="inventory-action-btn secondary"
            style={{marginTop:10, marginLeft:10, width:90}}
            onClick={onClose}
            disabled={uploading}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Inventory() {
  const user = useUser();
  const uid = user?.uid;
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [csvError, setCsvError] = useState("");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ marketValue: "", edition: "" });
  const [modalCard, setModalCard] = useState(null);
  const [sortBy, setSortBy] = useState("dateAdded");
  const [sortDir, setSortDir] = useState("desc");
  const [showManualAdd, setShowManualAdd] = useState(false);

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

  // --- Manual Add handler ---
  async function handleManualAddSave(newItem) {
    if (!uid) return;
    const docRef = await addDoc(collection(db, "users", uid, "inventory"), newItem);
    setInventory(prev => [...prev, { ...newItem, id: docRef.id }]);
  }

  // CSV import (replaces inventory)
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

      // Delete ALL existing inventory
      const currentDocs = await getDocs(collection(db, "users", uid, "inventory"));
      const deletePromises = currentDocs.docs.map((d) => deleteDoc(doc(db, "users", uid, "inventory", d.id)));
      await Promise.all(deletePromises);

      // Add all new items
      for (let item of items) {
        await addDoc(collection(db, "users", uid, "inventory"), {
          ...item,
          marketValue: Number(item.marketValue || 0),
          acquisitionCost: Number(item.acquisitionCost || 0),
          condition: item.condition || "",
          edition: EDITION_OPTIONS.includes(item.edition)
            ? item.edition
            : "",
          category: item.category || "Cards",
          gradingCompany: item.gradingCompany || "",
          grade: item.grade || "",
          manualImageUrl: item.manualImageUrl || "",
          quantity: Number(item.quantity) || 1,
          dateAdded: item.dateAdded || new Date().toISOString(),
        });
      }

      // Refresh inventory
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

  // CSV export (includes manual fields and photo)
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
      "category",
      "gradingCompany",
      "grade",
      "manualImageUrl",
      "quantity",
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

  // Filtering & search
  const filtered = inventory
    .filter((item) => {
      if (categoryFilter === "All") return true;
      const cat = (item.category || item.type || "cards").toLowerCase();
      switch (categoryFilter) {
        case "Cards": return cat === "cards" || cat === "card";
        case "Graded Cards": return cat === "graded cards" || cat === "graded";
        case "Sealed Product": return cat === "sealed product" || cat === "sealed";
        case "Supplies": return cat === "supplies";
        case "Accessories": return cat === "accessories";
        default: return true;
      }
    })
    .filter((item) =>
      !search ||
      item.cardName?.toLowerCase().includes(search.toLowerCase()) ||
      item.setName?.toLowerCase().includes(search.toLowerCase()) ||
      item.cardNumber?.toLowerCase().includes(search.toLowerCase())
    );

  const compare = (a, b, key) => {
    if (key === "marketValue" || key === "acquisitionCost") {
      return Number(a[key] || 0) - Number(b[key] || 0);
    }
    if (key === "dateAdded") {
      return new Date(a.dateAdded || 0).getTime() - new Date(b.dateAdded || 0).getTime();
    }
    return (a[key] || "").toString().localeCompare((b[key] || "").toString(), undefined, { sensitivity: "base" });
  };
  const sorted = [...filtered].sort((a, b) => {
    const result = compare(a, b, sortBy);
    return sortDir === "asc" ? result : -result;
  });

  // Summary
  const totalValue = inventory.reduce(
    (sum, c) => sum + (Number(c.marketValue) || 0),
    0
  );
  const totalCards = inventory.filter((c) => (c.category || c.type || "cards").toLowerCase().includes("card")).length;
  const totalSealed = inventory.filter((c) => (c.category || c.type || "").toLowerCase().includes("sealed")).length;

  function handleNameClick(card) { setModalCard(card); }
  function handleModalClose() { setModalCard(null); }

  const COLUMNS = [
    { label: "Name", key: "cardName" },
    { label: "Set", key: "setName" },
    { label: "#", key: "cardNumber" },
    { label: "Market Value", key: "marketValue" },
    { label: "Acq. Cost", key: "acquisitionCost" },
    { label: "Condition", key: "condition" },
    { label: "Edition", key: "edition" },
    { label: "Category", key: "category" },
    { label: "Grading Co.", key: "gradingCompany" },
    { label: "Grade", key: "grade" },
    { label: "Quantity", key: "quantity" },
    { label: "Date Added", key: "dateAdded" },
    { label: "Actions", key: "actions" }
  ];

  function handleSort(key) {
    if (key === "actions") return;
    if (sortBy === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  }
  function sortArrow(key) {
    if (key !== sortBy) return null;
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  return (
    <div className="inventory-root">
      <div className="inventory-header-row">
        <h2 className="inventory-title">Inventory</h2>
        <span className="inventory-subheading">
          All items currently in stock.
        </span>

        {/* --- Manual Add Button --- */}
        <button
          className="inventory-action-btn"
          style={{marginLeft:12, marginRight:12, background:"#287a32"}}
          onClick={()=>setShowManualAdd(true)}
        >
          + Manual Add
        </button>

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

        <select
          className="inventory-filter-select"
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
        >
          {CATEGORY_OPTIONS.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
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
      ) : sorted.length === 0 ? (
        <div className="inventory-empty">
          No items found in inventory.
        </div>
      ) : (
        <table className="inventory-table">
          <thead>
            <tr>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={col.key !== "actions" ? { cursor: "pointer", userSelect: "none", background: col.key === sortBy ? "#263" : undefined } : {}}
                >
                  {col.label}{sortArrow(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr key={item.id} className="card-row">
                <td className="card-name">
                  <span
                    className="card-name-link"
                    tabIndex={0}
                    onClick={() => handleNameClick(item)}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") handleNameClick(item);
                    }}
                  >
                    {item.cardName || item.productName}
                  </span>
                </td>
                <td className="card-set">{item.setName || item.productType}</td>
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
                <td>{item.category}</td>
                <td>{item.gradingCompany}</td>
                <td>{item.grade}</td>
                <td>{item.quantity || 1}</td>
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
                        onClick={() => {
                          const updated = {
                            marketValue: Number(draft.marketValue) || 0,
                            edition: draft.edition,
                          };
                          setInventory((prev) =>
                            prev.map((i) => (i.id === item.id ? { ...i, ...updated } : i))
                          );
                          updateDoc(doc(db, "users", uid, "inventory", item.id), updated);
                          setEditingId(null);
                          setDraft({ marketValue: "", edition: "" });
                        }}
                      >
                        Save
                      </button>
                      <button
                        className="inventory-action-btn secondary inline-cancel-btn"
                        onClick={() => {
                          setEditingId(null);
                          setDraft({ marketValue: "", edition: "" });
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="inventory-action-btn secondary inline-edit-btn"
                        onClick={() => {
                          setEditingId(item.id);
                          setDraft({
                            marketValue: (item.marketValue ?? "").toString(),
                            edition: EDITION_OPTIONS.includes(item.edition)
                              ? item.edition
                              : "",
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="delete-btn"
                        onClick={() => {
                          if (window.confirm("Remove this card from inventory?")) {
                            deleteDoc(doc(db, "users", uid, "inventory", item.id));
                            setInventory((prev) => prev.filter((c) => c.id !== item.id));
                          }
                        }}
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

      {modalCard && (
        <CardDetailsModal card={modalCard} onClose={handleModalClose} />
      )}
      {showManualAdd && (
        <ManualAddModal
          onClose={() => setShowManualAdd(false)}
          onSave={handleManualAddSave}
        />
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
