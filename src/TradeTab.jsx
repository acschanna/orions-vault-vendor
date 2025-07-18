import React, { useState, useEffect, useContext } from "react";
import { useUser } from "./App";
import { db, storage } from "./firebase";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { ShowContext } from "./ShowContext";
import "./TradeTab.css";

const CATEGORY_OPTIONS = [
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

const accentGreen = "#00b84a";
const API_KEY = import.meta.env.VITE_POKEMON_TCG_API_KEY;

const SETS_WITH_EDITION = [
  "base1", "base2", "jungle", "fossil", "teamrocket",
  "gymheroes", "gymchallenge", "neoGenesis", "neoDiscovery",
  "neoRevelation", "neoDestiny", "legendarycollection"
];

function cardHasEditionOptions(card) {
  if (!card || !card.set || !SETS_WITH_EDITION.includes(card.set.id)) return false;
  const prices = card.tcgplayer?.prices;
  return Boolean(
    prices?.["1stEdition"] ||
    prices?.["1stEditionHolofoil"] ||
    prices?.["1stEditionNormal"]
  );
}

function ManualAddModal({ onClose, onSave, side }) {
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
  const [productType, setProductType] = useState("Booster Box");
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

  function isSealed() {
    return category === "Sealed Product";
  }
  function isGraded() {
    return category === "Graded Cards";
  }

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
    if (!isSealed()) {
      onSave({
        id: "manual_" + Date.now(),
        cardName,
        category,
        gradingCompany: isGraded() ? gradingCompany : "",
        grade: isGraded() ? grade : "",
        setName,
        cardNumber,
        condition,
        edition,
        marketValue: Number(marketValue) || 0,
        acquisitionCost: Number(acquisitionCost) || 0,
        quantity: Number(quantity) || 1,
        manualImageUrl,
        type: "card"
      });
    } else {
      onSave({
        id: "sealed_manual_" + Date.now(),
        productName: cardName,
        setName,
        productType,
        quantity: Number(quantity) || 1,
        marketValue: Number(marketValue) || 0,
        acquisitionCost: Number(acquisitionCost) || 0,
        condition,
        manualImageUrl,
        category,
        type: "sealed"
      });
    }
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
        style={{ maxWidth: 500 }}
      >
        <div className="card-modal-header">
          <div className="card-modal-title">Manual Add ({side === "vendor" ? "Vendor" : "Customer"})</div>
          <button className="card-modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div className="card-modal-body" style={{ padding: 20 }}>
          <div style={{ marginBottom: 12 }}>
            <label>
              Photo:{" "}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={e => {
                  if (e.target.files && e.target.files[0]) setImageFile(e.target.files[0]);
                }}
                style={{ marginLeft: 10 }}
              />
            </label>
            {imagePreview && (
              <div style={{ marginTop: 8 }}>
                <img
                  src={imagePreview}
                  alt="Preview"
                  style={{ maxWidth: 140, maxHeight: 120, borderRadius: 10, border: "1px solid #888" }}
                />
              </div>
            )}
          </div>
          <label style={{ display: "block", marginBottom: 9 }}>
            {isSealed() ? "Product Name:" : "Name:"}
            <input
              className="inventory-input"
              style={{ marginLeft: 8, width: "75%" }}
              value={cardName}
              onChange={e => setCardName(e.target.value)}
            />
          </label>
          <label style={{ display: "block", marginBottom: 9 }}>
            Category:
            <select
              className="inventory-filter-select"
              style={{ marginLeft: 8, width: "70%" }}
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              {CATEGORY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
          {isSealed() ? (
            <>
              <label style={{ display: "block", marginBottom: 9 }}>
                Set Name:
                <input
                  className="inventory-input"
                  style={{ marginLeft: 8, width: "75%" }}
                  value={setName}
                  onChange={e => setSetName(e.target.value)}
                  placeholder="(Optional)"
                />
              </label>
              <label style={{ display: "block", marginBottom: 9 }}>
                Product Type:
                <select
                  className="inventory-filter-select"
                  style={{ marginLeft: 8, width: "60%" }}
                  value={productType}
                  onChange={e => setProductType(e.target.value)}
                >
                  <option>Booster Box</option>
                  <option>Booster Pack</option>
                  <option>ETB</option>
                  <option>Tin</option>
                  <option>Deck</option>
                  <option>Other</option>
                </select>
              </label>
              <label style={{ display: "block", marginBottom: 9 }}>
                Condition:
                <select
                  className="inventory-filter-select"
                  style={{ marginLeft: 8, width: "60%" }}
                  value={condition}
                  onChange={e => setCondition(e.target.value)}
                >
                  <option>Sealed</option>
                  <option>Damaged</option>
                </select>
              </label>
              <label style={{ display: "block", marginBottom: 9 }}>
                Quantity:
                <input
                  className="inventory-input"
                  style={{ marginLeft: 8, width: "20%" }}
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                />
              </label>
              <label style={{ display: "block", marginBottom: 9 }}>
                Market Value ($):
                <input
                  className="inventory-input"
                  style={{ marginLeft: 8, width: "35%" }}
                  type="number"
                  step="0.01"
                  value={marketValue}
                  onChange={e => setMarketValue(e.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label style={{ display: "block", marginBottom: 9 }}>
                Acquisition Cost ($):
                <input
                  className="inventory-input"
                  style={{ marginLeft: 8, width: "35%" }}
                  type="number"
                  step="0.01"
                  value={acquisitionCost}
                  onChange={e => setAcquisitionCost(e.target.value)}
                  placeholder="0.00"
                />
              </label>
            </>
          ) : (
            <>
              {isGraded() && (
                <>
                  <label style={{ display: "block", marginBottom: 9 }}>
                    Grading Company:
                    <select
                      className="inventory-filter-select"
                      style={{ marginLeft: 8, width: "70%" }}
                      value={gradingCompany}
                      onChange={e => setGradingCompany(e.target.value)}
                    >
                      {GRADING_COMPANIES.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </label>
                  <label style={{ display: "block", marginBottom: 9 }}>
                    Grade:
                    <input
                      className="inventory-input"
                      style={{ marginLeft: 8, width: "50%" }}
                      value={grade}
                      onChange={e => setGrade(e.target.value)}
                      placeholder="e.g. 10, 9.5, Authentic"
                    />
                  </label>
                </>
              )}
              <label style={{ display: "block", marginBottom: 9 }}>
                Set Name:
                <input
                  className="inventory-input"
                  style={{ marginLeft: 8, width: "75%" }}
                  value={setName}
                  onChange={e => setSetName(e.target.value)}
                  placeholder="(Optional)"
                />
              </label>
              <label style={{ display: "block", marginBottom: 9 }}>
                Card Number:
                <input
                  className="inventory-input"
                  style={{ marginLeft: 8, width: "50%" }}
                  value={cardNumber}
                  onChange={e => setCardNumber(e.target.value)}
                  placeholder="(Optional)"
                />
              </label>
              <label style={{ display: "block", marginBottom: 9 }}>
                Condition:
                <select
                  className="inventory-filter-select"
                  style={{ marginLeft: 8, width: "60%" }}
                  value={condition}
                  onChange={e => setCondition(e.target.value)}
                >
                  {CONDITION_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </label>
              <label style={{ display: "block", marginBottom: 9 }}>
                Edition:
                <select
                  className="inventory-filter-select"
                  style={{ marginLeft: 8, width: "50%" }}
                  value={edition}
                  onChange={e => setEdition(e.target.value)}
                >
                  <option value="">—</option>
                  {EDITION_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </label>
              <label style={{ display: "block", marginBottom: 9 }}>
                Market Value ($):
                <input
                  className="inventory-input"
                  style={{ marginLeft: 8, width: "35%" }}
                  type="number"
                  step="0.01"
                  value={marketValue}
                  onChange={e => setMarketValue(e.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label style={{ display: "block", marginBottom: 9 }}>
                Acquisition Cost ($):
                <input
                  className="inventory-input"
                  style={{ marginLeft: 8, width: "35%" }}
                  type="number"
                  step="0.01"
                  value={acquisitionCost}
                  onChange={e => setAcquisitionCost(e.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label style={{ display: "block", marginBottom: 9 }}>
                Quantity:
                <input
                  className="inventory-input"
                  style={{ marginLeft: 8, width: "20%" }}
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                />
              </label>
            </>
          )}
          <button
            className="inventory-action-btn"
            style={{ marginTop: 10, width: 120, background: "#008afc", color: "#fff" }}
            onClick={handleSave}
            disabled={uploading}
          >
            {uploading ? "Saving..." : "Save"}
          </button>
          <button
            className="inventory-action-btn secondary"
            style={{ marginTop: 10, marginLeft: 10, width: 90 }}
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

export default function TradeTab() {
  const user = useUser();
  const uid = user?.uid;
  const { showActive } = useContext(ShowContext);

  const [trade, setTrade] = useState({
    vendor: { cards: [], sealed: [], cash: 0, cashType: "cash" },
    customer: { cards: [], sealed: [], cash: 0, cashType: "cash" }
  });

  // Customer Trade Value Percentage State
  const [customerTradePercentage, setCustomerTradePercentage] = useState(70);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  const [showVendorManualAdd, setShowVendorManualAdd] = useState(false);
  const [showCustomerManualAdd, setShowCustomerManualAdd] = useState(false);

  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorSearchResults, setVendorSearchResults] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);

  const [cashOnHand, setCashOnHand] = useState(0);

  // ----------- CardLookup Style Customer Card Lookup -----------
  const [showCustomerLookup, setShowCustomerLookup] = useState(false);
  const [lookupType, setLookupType] = useState("name");
  const [lookupName, setLookupName] = useState("");
  const [lookupNumber, setLookupNumber] = useState("");
  const [lookupSetTotal, setLookupSetTotal] = useState("");
  const [lookupResults, setLookupResults] = useState([]);
  const [allNumberResults, setAllNumberResults] = useState([]);
  const [lookupSelectedCard, setLookupSelectedCard] = useState(null);
  const [lookupShowModal, setLookupShowModal] = useState(false);
  const [lookupCondition, setLookupCondition] = useState("NM");
  const [lookupEdition, setLookupEdition] = useState("unlimited");
  const [lookupNotes, setLookupNotes] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupPage, setLookupPage] = useState(1);
  const [lookupTotalCount, setLookupTotalCount] = useState(0);
  const LOOKUP_PAGE_SIZE = 8;

  const [sets, setSets] = useState([]);
  const [setsLoading, setSetsLoading] = useState(false);

  useEffect(() => {
    if (!uid) return;
    async function fetchAll() {
      setInventoryLoading(true);
      const invSnap = await getDocs(collection(db, "users", uid, "inventory"));
      setInventory(invSnap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      const userSnap = await getDoc(doc(db, "users", uid));
      const d = userSnap.data() || {};
      setCashOnHand(Number(d.cashOnHand || 0));
      setInventoryLoading(false);
    }
    fetchAll();
  }, [uid]);

  useEffect(() => {
    if (!vendorSearch) {
      setVendorSearchResults([]);
      return;
    }
    setVendorSearchResults(
      inventory.filter(item =>
        (item.cardName?.toLowerCase().includes(vendorSearch.toLowerCase()) ||
          item.setName?.toLowerCase().includes(vendorSearch.toLowerCase()) ||
          item.cardNumber?.toLowerCase().includes(vendorSearch.toLowerCase()))
        && !trade.vendor.cards.find(c => c.id === item.id)
        && !trade.vendor.sealed.find(c => c.id === item.id)
      )
    );
  }, [vendorSearch, inventory, trade.vendor.cards, trade.vendor.sealed]);

  function addVendorFromInventory(id) {
    const item = inventory.find(c => c.id === id);
    if (!item) return;
    if (item.type === "sealed") {
      setTrade(prev => ({
        ...prev,
        vendor: { ...prev.vendor, sealed: [...prev.vendor.sealed, { ...item, origin: "inventory" }] }
      }));
    } else {
      setTrade(prev => ({
        ...prev,
        vendor: {
          ...prev.vendor,
          cards: [...prev.vendor.cards, { ...item, value: item.marketValue, origin: "inventory" }]
        }
      }));
    }
    setVendorSearch("");
  }
  function removeVendorCard(id) {
    setTrade(prev => ({
      ...prev,
      vendor: {
        ...prev.vendor,
        cards: prev.vendor.cards.filter(c => c.id !== id)
      }
    }));
  }
  function removeVendorSealed(id) {
    setTrade(prev => ({
      ...prev,
      vendor: {
        ...prev.vendor,
        sealed: prev.vendor.sealed.filter(c => c.id !== id)
      }
    }));
  }
  function setVendorCash(val) {
    if (isNaN(val)) return;
    setTrade(prev => ({
      ...prev,
      vendor: {
        ...prev.vendor,
        cash: Math.max(0, Math.floor(Number(val)))
      }
    }));
  }
  function setVendorCashType(val) {
    setTrade(prev => ({
      ...prev,
      vendor: {
        ...prev.vendor,
        cashType: val
      }
    }));
  }
  function handleVendorManualAddSave(item) {
    if (item.type === "sealed") {
      setTrade(prev => ({
        ...prev,
        vendor: {
          ...prev.vendor,
          sealed: [...prev.vendor.sealed, item]
        }
      }));
    } else {
      setTrade(prev => ({
        ...prev,
        vendor: {
          ...prev.vendor,
          cards: [...prev.vendor.cards, item]
        }
      }));
    }
  }

  function removeCustomerCard(id) {
    setTrade(prev => ({
      ...prev,
      customer: {
        ...prev.customer,
        cards: prev.customer.cards.filter(c => c.id !== id)
      }
    }));
  }
  function removeCustomerSealed(id) {
    setTrade(prev => ({
      ...prev,
      customer: {
        ...prev.customer,
        sealed: prev.customer.sealed.filter(c => c.id !== id)
      }
    }));
  }
  function setCustomerCash(val) {
    if (isNaN(val)) return;
    setTrade(prev => ({
      ...prev,
      customer: {
        ...prev.customer,
        cash: Math.max(0, Math.floor(Number(val)))
      }
    }));
  }
  function setCustomerCashType(val) {
    setTrade(prev => ({
      ...prev,
      customer: {
        ...prev.customer,
        cashType: val
      }
    }));
  }
  function handleCustomerManualAddSave(item) {
    if (item.type === "sealed") {
      setTrade(prev => ({
        ...prev,
        customer: {
          ...prev.customer,
          sealed: [...prev.customer.sealed, item]
        }
      }));
    } else {
      setTrade(prev => ({
        ...prev,
        customer: {
          ...prev.customer,
          cards: [...prev.customer.cards, item]
        }
      }));
    }
  }

  useEffect(() => {
    if (!showCustomerLookup) return;
    if (sets.length > 0) return;
    setSetsLoading(true);
    fetch('https://api.pokemontcg.io/v2/sets', {
      headers: { 'X-Api-Key': API_KEY }
    })
      .then(r => r.json())
      .then(data => setSets(data.data.sort((a, b) => (b.releaseDate > a.releaseDate ? 1 : -1))))
      .catch(() => setSets([]))
      .finally(() => setSetsLoading(false));
  }, [showCustomerLookup]);

  const doLookup = async (curPage = 1) => {
    setLookupLoading(true);
    setLookupResults([]);
    setLookupSelectedCard(null);
    setLookupShowModal(false);
    setLookupTotalCount(0);
    let url;

    if (lookupType === "name") {
      url = `https://api.pokemontcg.io/v2/cards?q=name:"${encodeURIComponent(
        lookupName
      )}"&page=${curPage}&pageSize=${LOOKUP_PAGE_SIZE}`;
      try {
        const response = await fetch(url, { headers: { "X-Api-Key": API_KEY } });
        const data = await response.json();
        setLookupResults(data.data || []);
        setLookupTotalCount(data.totalCount || 0);
        setAllNumberResults([]);
      } catch {
        setLookupResults([]);
        setLookupTotalCount(0);
        setAllNumberResults([]);
      }
      setLookupLoading(false);
    } else if (lookupType === "number") {
      if (!lookupNumber) {
        setLookupLoading(false);
        return;
      }
      url = `https://api.pokemontcg.io/v2/cards?q=number:"${encodeURIComponent(
        lookupNumber
      )}"&page=1&pageSize=250`;
      try {
        const response = await fetch(url, { headers: { "X-Api-Key": API_KEY } });
        const data = await response.json();
        setAllNumberResults(data.data || []);
        setLookupResults((data.data || []).slice(0, LOOKUP_PAGE_SIZE));
        setLookupTotalCount((data.data || []).length);
      } catch {
        setLookupResults([]);
        setLookupTotalCount(0);
        setAllNumberResults([]);
      }
      setLookupLoading(false);
    } else if (lookupType === "numberSetTotal") {
      if (!lookupNumber || !lookupSetTotal) {
        setLookupLoading(false);
        return;
      }
      url = `https://api.pokemontcg.io/v2/cards?q=number:"${encodeURIComponent(
        lookupNumber
      )}"&page=1&pageSize=250`;
      try {
        const response = await fetch(url, { headers: { "X-Api-Key": API_KEY } });
        const data = await response.json();
        const filtered = (data.data || []).filter(card =>
          card.set && String(card.set.printedTotal) === String(lookupSetTotal)
        );
        setLookupResults(filtered.slice(0, LOOKUP_PAGE_SIZE));
        setLookupTotalCount(filtered.length);
        setAllNumberResults(filtered);
      } catch {
        setLookupResults([]);
        setLookupTotalCount(0);
        setAllNumberResults([]);
      }
      setLookupLoading(false);
    }
  };

  useEffect(() => {
    if (
      (lookupType === "number" && allNumberResults.length > 0) ||
      (lookupType === "numberSetTotal" && allNumberResults.length > 0)
    ) {
      setLookupResults(allNumberResults.slice((lookupPage - 1) * LOOKUP_PAGE_SIZE, lookupPage * LOOKUP_PAGE_SIZE));
      setLookupTotalCount(allNumberResults.length);
    }
  }, [lookupPage, allNumberResults, lookupType]);

  useEffect(() => {
    setLookupPage(1);
    setLookupResults([]);
    setLookupSelectedCard(null);
    setLookupShowModal(false);
    setLookupTotalCount(0);
    setAllNumberResults([]);
  }, [lookupType, lookupName, lookupNumber, lookupSetTotal]);

  const nextLookupPage = () => {
    if (lookupPage * LOOKUP_PAGE_SIZE < lookupTotalCount) {
      setLookupPage(lookupPage + 1);
      if (lookupType === "name") doLookup(lookupPage + 1);
    }
  };
  const prevLookupPage = () => {
    if (lookupPage > 1) {
      setLookupPage(lookupPage - 1);
      if (lookupType === "name") doLookup(lookupPage - 1);
    }
  };

  function addCustomerLookupCard(card) {
    let price =
      cardHasEditionOptions(card) && lookupEdition === "firstEdition"
        ? card.tcgplayer?.prices?.["1stEdition"]?.market ||
          card.tcgplayer?.prices?.["1stEditionHolofoil"]?.market ||
          card.tcgplayer?.prices?.["1stEditionNormal"]?.market ||
          0
        : card.tcgplayer?.prices?.normal?.market ||
          card.tcgplayer?.prices?.holofoil?.market ||
          card.tcgplayer?.prices?.reverseHolofoil?.market ||
          0;
    setTrade(prev => ({
      ...prev,
      customer: {
        ...prev.customer,
        cards: [
          ...prev.customer.cards,
          {
            id: card.id + "_" + Date.now(),
            cardName: card.name,
            setName: card.set?.name,
            cardNumber: card.number,
            tcgPlayerId: card.id,
            images: card.images,
            value: price,
            edition: cardHasEditionOptions(card) ? lookupEdition : "unlimited",
            condition: lookupCondition,
            notes: lookupNotes,
            origin: "lookup"
          }
        ]
      }
    }));
    setShowCustomerLookup(false);
    setLookupName("");
    setLookupNumber("");
    setLookupSetTotal("");
    setLookupResults([]);
    setLookupCondition("NM");
    setLookupEdition("unlimited");
    setLookupNotes("");
    setLookupPage(1);
    setLookupTotalCount(null);
    setLookupSelectedCard(null);
    setLookupShowModal(false);
  }

  function clearTrade() {
    setTrade({
      vendor: { cards: [], sealed: [], cash: 0, cashType: "cash" },
      customer: { cards: [], sealed: [], cash: 0, cashType: "cash" }
    });
    setConfirmError("");
  }

  async function confirmTrade() {
    if (!uid) return;
    setConfirmError("");

    const totalVendor = trade.vendor.cards.reduce((a, c) => a + Number(c.value || 0), 0)
      + trade.vendor.sealed.reduce((a, c) => a + Number(c.value || 0), 0)
      + Number(trade.vendor.cash || 0);

    // Apply customer trade value percentage:
    const rawCustomerTotal = trade.customer.cards.reduce((a, c) => a + Number(c.value || 0), 0)
      + trade.customer.sealed.reduce((a, c) => a + Number(c.value || 0), 0)
      + Number(trade.customer.cash || 0);
    const totalCustomer = (rawCustomerTotal * (customerTradePercentage / 100));

    if (totalVendor === 0 && totalCustomer === 0) {
      setConfirmError("Cannot confirm empty trade.");
      return;
    }
    if (trade.vendor.cash > cashOnHand) {
      setConfirmError("You don't have enough cash on hand!");
      return;
    }

    const tradeRecord = {
      ...trade,
      date: new Date().toISOString(),
      vendorEmail: user.email,
      valueVendor: totalVendor,
      valueCustomer: totalCustomer,
      customerTradePercentage,
      showId: showActive?.id || null,
      showName: showActive?.showName || null,
    };
    const historyRef = collection(db, "users", uid, "tradeHistory");
    await setDoc(doc(historyRef), tradeRecord);

    for (let c of trade.vendor.cards) {
      if (c.origin === "inventory" && c.id) {
        try { await deleteDoc(doc(db, "users", uid, "inventory", c.id)); } catch {}
      }
    }
    for (let c of trade.vendor.sealed) {
      if (c.origin === "inventory" && c.id) {
        try { await deleteDoc(doc(db, "users", uid, "inventory", c.id)); } catch {}
      }
    }

    try {
      const totalVendorAcqCost =
        trade.vendor.cards.reduce((a, c) => a + Number(c.acquisitionCost || c.value || 0), 0) +
        trade.vendor.sealed.reduce((a, c) => a + Number(c.acquisitionCost || c.value || 0), 0) +
        Number(trade.vendor.cash || 0) -
        Number(trade.customer.cash || 0);

      const totalCustomerMarketValue =
        trade.customer.cards.reduce((a, c) => a + Number(c.value || 0), 0) +
        trade.customer.sealed.reduce((a, c) => a + Number(c.value || 0), 0);

      const safeTotalCustomerMarketValue = totalCustomerMarketValue > 0 ? totalCustomerMarketValue : 1;

      for (let card of trade.customer.cards) {
        const percentOfTrade = Number(card.value || 0) / safeTotalCustomerMarketValue;
        const acqCost = percentOfTrade * totalVendorAcqCost;
        await addDoc(collection(db, "users", uid, "inventory"), {
          type: "card",
          setName: card.setName,
          cardName: card.cardName,
          cardNumber: card.cardNumber,
          tcgPlayerId: card.tcgPlayerId,
          images: card.images || undefined,
          marketValue: card.value,
          acquisitionCost: acqCost,
          edition: card.edition || "unlimited",
          condition: card.condition,
          notes: card.notes,
          dateAdded: new Date().toISOString(),
        });
      }
      for (let prod of trade.customer.sealed) {
        const percentOfTrade = Number(prod.value || 0) / safeTotalCustomerMarketValue;
        const acqCost = percentOfTrade * totalVendorAcqCost;
        await addDoc(collection(db, "users", uid, "inventory"), {
          type: "sealed",
          productName: prod.productName,
          setName: prod.setName,
          productType: prod.productType,
          quantity: prod.quantity,
          marketValue: prod.value,
          acquisitionCost: acqCost,
          condition: prod.condition,
          dateAdded: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("Error adding traded-in inventory:", err);
    }

    if (trade.vendor.cash > 0 || trade.customer.cash > 0) {
      const cashAfter = cashOnHand - Number(trade.vendor.cash || 0) + Number(trade.customer.cash || 0);
      await setDoc(doc(db, "users", uid), { cashOnHand: cashAfter }, { merge: true });
      setCashOnHand(cashAfter);
    }

    clearTrade();
    setConfirmOpen(false);
    alert("Trade completed and logged!");
    const invSnap = await getDocs(collection(db, "users", uid, "inventory"));
    setInventory(invSnap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
  }

  const vendorTotal =
    trade.vendor.cards.reduce((sum, c) => sum + Number(c.value || 0), 0) +
    trade.vendor.sealed.reduce((sum, c) => sum + Number(c.value || 0), 0) +
    Number(trade.vendor.cash || 0);

  const rawCustomerTotal =
    trade.customer.cards.reduce((sum, c) => sum + Number(c.value || 0), 0) +
    trade.customer.sealed.reduce((sum, c) => sum + Number(c.value || 0), 0) +
    Number(trade.customer.cash || 0);

  const customerTotal = (rawCustomerTotal * (customerTradePercentage / 100));

  return (
    <>
      <div className="trade-tab-root">
        <h2 className="trade-tab-title">Trade Builder</h2>
        <div className="trade-value-percentage-row" style={{ margin: "0 0 18px 0", display: "flex", alignItems: "center", gap: "18px" }}>
          <label style={{ fontWeight: 600 }}>
            Customer Trade Value Percentage:&nbsp;
            <input
              type="range"
              min="40"
              max="100"
              step="1"
              value={customerTradePercentage}
              onChange={e => setCustomerTradePercentage(Number(e.target.value))}
              style={{ verticalAlign: "middle", width: 130 }}
            />
            <input
              type="number"
              min="40"
              max="100"
              value={customerTradePercentage}
              onChange={e => {
                let val = Number(e.target.value);
                if (isNaN(val)) val = 70;
                if (val < 40) val = 40;
                if (val > 100) val = 100;
                setCustomerTradePercentage(val);
              }}
              style={{
                width: 52,
                textAlign: "center",
                fontWeight: 700,
                fontSize: 16,
                marginLeft: 8,
                marginRight: 2,
                borderRadius: 5,
                border: "1px solid #aaa",
                background: "#111",
                color: "#fff"
              }}
            />%
          </label>
          <span style={{ color: "#aaa", fontSize: 14 }}>
            (This controls the offer amount vs. customer's market value. Default is 70%)
          </span>
        </div>
        <div className="trade-row">
          <div className="trade-side vendor-side-box">
            <div className="trade-side-title">Your Side (Vendor)</div>
            <div className="trade-side-controls">
              <button
                className="trade-side-btn"
                style={{ background: "#008afc", color: "#fff" }}
                onClick={() => setShowVendorManualAdd(true)}
              >
                + Manual Add
              </button>
              <button className="trade-side-btn cancel" onClick={clearTrade}>Clear Trade</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <input
                className="inventory-input"
                placeholder="Search your inventory"
                value={vendorSearch}
                onChange={e => setVendorSearch(e.target.value)}
                style={{ width: "98%", marginBottom: 10 }}
                onKeyDown={e => { if (e.key === "Enter") { if (vendorSearchResults.length > 0) addVendorFromInventory(vendorSearchResults[0].id); } }}
              />
              {inventoryLoading && <div style={{ color: accentGreen }}>Loading inventory...</div>}
              {vendorSearch && (
                <table className="trade-side-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Set/Product</th>
                      <th>#/Qty</th>
                      <th>Market Value</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendorSearchResults.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ color: "#aaa", textAlign: "center" }}>No results found.</td>
                      </tr>
                    )}
                    {vendorSearchResults.map(item => (
                      <tr key={item.id}>
                        <td className={item.type === "sealed" ? "sealed-name" : "item-name"}>
                          {item.cardName || item.productName}
                        </td>
                        <td className={item.type === "sealed" ? "sealed-details" : "item-details"}>
                          {item.setName || item.productType}
                        </td>
                        <td>{item.cardNumber || item.quantity || ""}</td>
                        <td className="item-value">
                          ${Number(item.marketValue || 0).toFixed(2)}
                        </td>
                        <td>
                          <button
                            className="trade-side-btn"
                            style={{ padding: "3px 10px", fontSize: 14, marginLeft: 0 }}
                            onClick={() => addVendorFromInventory(item.id)}
                          >
                            +
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div style={{ marginTop: 12 }}>
              <table className="trade-side-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Set/Product</th>
                    <th>#/Qty</th>
                    <th>Value</th>
                    <th>Cond.</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {trade.vendor.cards.map((card) => (
                    <tr key={card.id}>
                      <td className="item-name">{card.cardName}</td>
                      <td className="item-details">{card.setName || ""}</td>
                      <td>{card.cardNumber || ""}</td>
                      <td className="item-value">${Number(card.value || card.marketValue || 0).toFixed(2)}</td>
                      <td className="item-cond">{card.condition}</td>
                      <td>
                        <button
                          className="item-remove-btn"
                          onClick={() => removeVendorCard(card.id)}
                        >
                          ❌
                        </button>
                      </td>
                    </tr>
                  ))}
                  {trade.vendor.sealed.map((prod) => (
                    <tr key={prod.id}>
                      <td className="sealed-name">{prod.productName}</td>
                      <td className="sealed-details">{prod.productType || ""}</td>
                      <td>{prod.quantity || ""}</td>
                      <td className="item-value">${Number(prod.value || prod.marketValue || 0).toFixed(2)}</td>
                      <td className="item-cond">{prod.condition}</td>
                      <td>
                        <button
                          className="item-remove-btn"
                          onClick={() => removeVendorSealed(prod.id)}
                        >
                          ❌
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="trade-side-total">
              Total: ${vendorTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div>
              <label className="trade-cash-label">
                Cash:
                <input
                  type="number"
                  min="0"
                  className="trade-cash-input"
                  value={trade.vendor.cash}
                  onChange={e => setVendorCash(e.target.value)}
                />
                <select
                  className="trade-cash-select"
                  value={trade.vendor.cashType}
                  onChange={e => setVendorCashType(e.target.value)}
                >
                  <option value="cash">Cash</option>
                  <option value="venmo">Venmo</option>
                  <option value="paypal">PayPal</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <span style={{ color: "#ccc", fontSize: 13, marginLeft: 10 }}>
                (Cash on hand: ${cashOnHand.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
              </span>
            </div>
          </div>
          <div className="trade-side vendor-side-box">
            <div className="trade-side-title">Customer Side</div>
            <div className="trade-side-controls">
              <button
                className="trade-side-btn"
                style={{ background: "#008afc", color: "#fff" }}
                onClick={() => setShowCustomerManualAdd(true)}
              >
                + Manual Add
              </button>
              <button className="trade-side-btn" style={{ background: "#198c47" }} onClick={() => setShowCustomerLookup(true)}>
                Lookup Pokémon Card
              </button>
            </div>
            <div>
              <table className="trade-side-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Set/Product</th>
                    <th>#/Qty</th>
                    <th>Value</th>
                    <th>Cond.</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {trade.customer.cards.map((card) => (
                    <tr key={card.id}>
                      <td className="item-name">{card.cardName}</td>
                      <td className="item-details">{card.setName || ""}</td>
                      <td>{card.cardNumber || ""}</td>
                      <td className="item-value">${Number(card.value || card.marketValue || 0).toFixed(2)}</td>
                      <td className="item-cond">{card.condition}</td>
                      <td>
                        <button
                          className="item-remove-btn"
                          onClick={() => removeCustomerCard(card.id)}
                        >
                          ❌
                        </button>
                      </td>
                    </tr>
                  ))}
                  {trade.customer.sealed.map((prod) => (
                    <tr key={prod.id}>
                      <td className="sealed-name">{prod.productName}</td>
                      <td className="sealed-details">{prod.productType || ""}</td>
                      <td>{prod.quantity || ""}</td>
                      <td className="item-value">${Number(prod.value || prod.marketValue || 0).toFixed(2)}</td>
                      <td className="item-cond">{prod.condition}</td>
                      <td>
                        <button
                          className="item-remove-btn"
                          onClick={() => removeCustomerSealed(prod.id)}
                        >
                          ❌
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="trade-side-total">
              Raw Total: ${rawCustomerTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<br />
              <span style={{ color: "#85c9ff" }}>
                Offer ({customerTradePercentage}%): <b>${customerTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
              </span>
            </div>
            <div>
              <label className="trade-cash-label">
                Cash:
                <input
                  type="number"
                  min="0"
                  className="trade-cash-input"
                  value={trade.customer.cash}
                  onChange={e => setCustomerCash(e.target.value)}
                />
                <select
                  className="trade-cash-select"
                  value={trade.customer.cashType}
                  onChange={e => setCustomerCashType(e.target.value)}
                >
                  <option value="cash">Cash</option>
                  <option value="venmo">Venmo</option>
                  <option value="paypal">PayPal</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 30 }}>
          <button className="trade-modal-btn" onClick={() => setConfirmOpen(true)}>
            Confirm & Log Trade
          </button>
        </div>
        {confirmOpen && (
          <div className="trade-modal-bg">
            <div className="trade-modal">
              <div className="trade-modal-title">Confirm Trade</div>
              {confirmError && <div className="trade-modal-error">{confirmError}</div>}
              <div>
                <b>Vendor Total:</b> ${vendorTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<br />
                <b>Customer Raw Total:</b> ${rawCustomerTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<br />
                <b>Customer Offer ({customerTradePercentage}%):</b> <span style={{ color: "#85c9ff" }}>${customerTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div style={{ marginTop: 18 }}>
                <button className="trade-modal-btn" onClick={confirmTrade}>Confirm</button>
                <button className="trade-modal-cancel-btn" onClick={() => setConfirmOpen(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {showVendorManualAdd && (
          <ManualAddModal
            onClose={() => setShowVendorManualAdd(false)}
            onSave={handleVendorManualAddSave}
            side="vendor"
          />
        )}
        {showCustomerManualAdd && (
          <ManualAddModal
            onClose={() => setShowCustomerManualAdd(false)}
            onSave={handleCustomerManualAddSave}
            side="customer"
          />
        )}
        {showCustomerLookup && (
          <div className="trade-lookup-modal-bg">
            <div className="trade-lookup-modal">
              <div className="trade-modal-title">Lookup Pokémon Card</div>
              <select
                value={lookupType}
                onChange={e => setLookupType(e.target.value)}
                style={{ width: "93%", padding: 9, marginBottom: 10 }}
              >
                <option value="name">Search by Name</option>
                <option value="number">Search by Number</option>
                <option value="numberSetTotal">Search by Number + Set Total</option>
              </select>
              {lookupType === "name" && (
                <input
                  className="trade-modal-input"
                  placeholder="Card Name (e.g., Charizard)"
                  value={lookupName}
                  onChange={e => setLookupName(e.target.value)}
                  style={{ width: "93%", padding: 9, marginBottom: 10 }}
                  onKeyDown={e => e.key === "Enter" && doLookup(1)}
                />
              )}
              {lookupType === "number" && (
                <input
                  className="trade-modal-input"
                  placeholder="Card Number (e.g., 4)"
                  value={lookupNumber}
                  onChange={e => setLookupNumber(e.target.value)}
                  style={{ width: "93%", padding: 9, marginBottom: 10 }}
                  onKeyDown={e => e.key === "Enter" && doLookup(1)}
                />
              )}
              {lookupType === "numberSetTotal" && (
                <div style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: 10
                }}>
                  <input
                    className="trade-modal-input"
                    placeholder="Card Number (e.g., 4)"
                    value={lookupNumber}
                    onChange={e => setLookupNumber(e.target.value)}
                    style={{ width: "45%", padding: 9 }}
                    onKeyDown={e => e.key === "Enter" && doLookup(1)}
                  />
                  <input
                    className="trade-modal-input"
                    placeholder="Set Total (e.g., 102)"
                    value={lookupSetTotal}
                    onChange={e => setLookupSetTotal(e.target.value)}
                    style={{ width: "45%", padding: 9 }}
                    onKeyDown={e => e.key === "Enter" && doLookup(1)}
                  />
                </div>
              )}
              <button
                className="trade-modal-btn"
                onClick={() => { setLookupPage(1); doLookup(1); }}
                disabled={lookupLoading}
              >
                Lookup
              </button>
              <button className="trade-modal-cancel-btn" onClick={() => setShowCustomerLookup(false)}>
                Cancel
              </button>
              {lookupLoading && (
                <div style={{ color: accentGreen, marginTop: 10 }}>Loading...</div>
              )}
              <div style={{ marginTop: 12 }}>
                {lookupResults.length > 0 && (
                  <div className="card-lookup-results" style={{ display: "flex", flexWrap: "wrap" }}>
                    {lookupResults.map(card => (
                      <div key={card.id} className="card-lookup-card" style={{ margin: 10 }}>
                        <img
                          src={card.images?.small}
                          alt={card.name}
                          className="card-lookup-card-image"
                          style={{ width: 120, height: 168, objectFit: "cover", borderRadius: 8 }}
                        />
                        <div className="card-lookup-card-name">{card.name}</div>
                        <div className="card-lookup-card-set">{card.set?.name}</div>
                        <div className="card-lookup-card-number" style={{ fontWeight: 600, fontSize: 18, color: accentGreen }}>
                          #{card.number}
                          {card.set && typeof card.set.printedTotal === "number" && card.set.printedTotal > 0
                            ? `/${card.set.printedTotal}`
                            : "/???"}
                        </div>
                        <button
                          className="card-lookup-card-viewbtn"
                          onClick={() => {
                            setLookupSelectedCard(card);
                            setLookupEdition("unlimited");
                            setLookupCondition("NM");
                            setLookupNotes("");
                            setLookupShowModal(true);
                          }}
                        >
                          View
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {lookupResults.length === 0 && !lookupLoading && (
                  <div style={{ color: "#aaa", marginTop: 12 }}>No cards found.</div>
                )}
                {lookupResults.length > 0 && (
                  <div className="card-lookup-pagination" style={{ textAlign: "center", marginTop: 16 }}>
                    <button className="card-lookup-pagination-btn" onClick={prevLookupPage} disabled={lookupPage === 1}>Prev</button>
                    <span style={{ color: "#fff", fontWeight: "bold" }}> Page {lookupPage} </span>
                    <button className="card-lookup-pagination-btn" onClick={nextLookupPage} disabled={lookupPage * LOOKUP_PAGE_SIZE >= lookupTotalCount}>Next</button>
                  </div>
                )}
              </div>
              {lookupShowModal && lookupSelectedCard && (
                <div className="card-lookup-modal-bg" style={{ zIndex: 40 }} onClick={() => { setLookupShowModal(false); setLookupSelectedCard(null); }}>
                  <div className="card-lookup-modal" onClick={e => e.stopPropagation()}>
                    <div style={{ textAlign: "center" }}>
                      <img
                        src={lookupSelectedCard.images.large || lookupSelectedCard.images.small}
                        alt={lookupSelectedCard.name}
                        className="card-lookup-modal-image"
                        style={{ width: 230, borderRadius: 10, marginBottom: 10 }}
                      />
                    </div>
                    <div className="card-lookup-modal-title">{lookupSelectedCard.name}</div>
                    <div className="card-lookup-modal-set">
                      {lookupSelectedCard.set.name}
                      {" • "}
                      <b>
                        {lookupSelectedCard.number}
                        {lookupSelectedCard.set && typeof lookupSelectedCard.set.printedTotal === "number" && lookupSelectedCard.set.printedTotal > 0
                          ? `/${lookupSelectedCard.set.printedTotal}`
                          : "/???"}
                      </b>
                    </div>
                    <div className="card-lookup-modal-rarity">
                      <b style={{ color: "#fff" }}>Rarity:</b>{" "}
                      <span>{lookupSelectedCard.rarity || "N/A"}</span>
                    </div>
                    <div className="card-lookup-modal-price">
                      <b style={{ color: "#fff" }}>TCGPlayer Price:</b>{" "}
                      <span>
                        {(() => {
                          const p =
                            cardHasEditionOptions(lookupSelectedCard) &&
                            lookupEdition === "firstEdition"
                              ? lookupSelectedCard.tcgplayer?.prices?.["1stEdition"]?.market ||
                                lookupSelectedCard.tcgplayer?.prices?.["1stEditionHolofoil"]?.market ||
                                lookupSelectedCard.tcgplayer?.prices?.["1stEditionNormal"]?.market ||
                                0
                              : lookupSelectedCard.tcgplayer?.prices?.normal?.market ||
                                lookupSelectedCard.tcgplayer?.prices?.holofoil?.market ||
                                lookupSelectedCard.tcgplayer?.prices?.reverseHolofoil?.market ||
                                0;
                          return p
                            ? p.toLocaleString("en-US", {
                                style: "currency",
                                currency: "USD",
                              })
                            : "N/A";
                        })()}
                      </span>
                    </div>
                    <div className="card-lookup-modal-fields" style={{ margin: "14px 0" }}>
                      <label style={{ color: "#fff", marginRight: 12 }}>
                        Condition:&nbsp;
                        <select
                          value={lookupCondition}
                          onChange={e => setLookupCondition(e.target.value)}
                          style={{ marginRight: 10 }}
                        >
                          <option value="NM">Near Mint (NM)</option>
                          <option value="LP">Light Play (LP)</option>
                          <option value="MP">Moderate Play (MP)</option>
                          <option value="HP">Heavy Play (HP)</option>
                          <option value="DMG">Damaged</option>
                        </select>
                      </label>
                      {cardHasEditionOptions(lookupSelectedCard) && (
                        <label style={{ color: "#fff", marginRight: 12 }}>
                          Edition:&nbsp;
                          <select
                            value={lookupEdition}
                            onChange={e => setLookupEdition(e.target.value)}
                          >
                            <option value="unlimited">Unlimited</option>
                            <option value="firstEdition">1st Edition</option>
                          </select>
                        </label>
                      )}
                      <label style={{ color: "#fff", marginRight: 12 }}>
                        Notes:&nbsp;
                        <input
                          type="text"
                          value={lookupNotes}
                          onChange={e => setLookupNotes(e.target.value)}
                          placeholder="(Optional)"
                          style={{ width: 140 }}
                        />
                      </label>
                    </div>
                    <div className="card-lookup-modal-btns" style={{ marginBottom: 10 }}>
                      <button
                        className="card-lookup-add-inv"
                        onClick={() => addCustomerLookupCard(lookupSelectedCard)}
                      >
                        Add to Trade
                      </button>
                      <button
                        className="card-lookup-cancel-btn"
                        onClick={() => { setLookupShowModal(false); setLookupSelectedCard(null); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
