import React, { useState, useEffect, useContext } from "react";
import { useUser } from "./App";
import { db } from "./firebase";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
} from "firebase/firestore";
import { ShowContext } from "./ShowContext";
import "./TradeTab.css";

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

export default function TradeTab() {
  const user = useUser();
  const uid = user?.uid;

  // Import showActive from ShowContext
  const { showActive } = useContext(ShowContext);

  // Trade state
  const [trade, setTrade] = useState({
    vendor: { cards: [], sealed: [], cash: 0, cashType: "cash" },
    customer: { cards: [], sealed: [], cash: 0, cashType: "cash" }
  });

  // Confirm modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  // Vendor manual add
  const [showVendorManual, setShowVendorManual] = useState(false);
  const [manualVendor, setManualVendor] = useState({ name: "", value: "", condition: "NM" });

  // Vendor sealed add
  const [showVendorSealed, setShowVendorSealed] = useState(false);
  const [manualVendorSealed, setManualVendorSealed] = useState({
    productName: "", setName: "", productType: "Booster Box", quantity: 1, value: "", condition: "Sealed"
  });

  // Vendor inventory search
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorSearchResults, setVendorSearchResults] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);

  // Vendor cash
  const [cashOnHand, setCashOnHand] = useState(0);

  // Customer manual add
  const [showCustomerManual, setShowCustomerManual] = useState(false);
  const [manualCustomer, setManualCustomer] = useState({ name: "", value: "", condition: "NM" });

  // Customer sealed add
  const [showCustomerSealed, setShowCustomerSealed] = useState(false);
  const [manualCustomerSealed, setManualCustomerSealed] = useState({
    productName: "", setName: "", productType: "Booster Box", quantity: 1, value: "", condition: "Sealed"
  });

  // --- CardLookup-Style Customer Card Lookup State ---
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

  // Set list for set total lookup (load only once)
  const [sets, setSets] = useState([]);
  const [setsLoading, setSetsLoading] = useState(false);

  // Card preview (for + button, as before)
  const [cardPreview, setCardPreview] = useState(null);

  // Fetch user inventory and cash
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

  // Vendor inventory search results
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

  // Vendor handlers
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
    setVendorSearch(""); // Clear search
  }
  function addManualVendorCard() {
    if (!manualVendor.name || !manualVendor.value || isNaN(manualVendor.value)) return;
    setTrade(prev => ({
      ...prev,
      vendor: {
        ...prev.vendor,
        cards: [
          ...prev.vendor.cards,
          {
            id: "manual_" + Date.now(),
            cardName: manualVendor.name,
            condition: manualVendor.condition,
            value: Number(manualVendor.value),
            origin: "manual"
          }
        ]
      }
    }));
    setManualVendor({ name: "", value: "", condition: "NM" });
    setShowVendorManual(false);
  }
  function addManualVendorSealed() {
    if (!manualVendorSealed.productName || !manualVendorSealed.value || isNaN(manualVendorSealed.value)) return;
    setTrade(prev => ({
      ...prev,
      vendor: {
        ...prev.vendor,
        sealed: [
          ...prev.vendor.sealed,
          {
            id: "sealed_manual_" + Date.now(),
            ...manualVendorSealed,
            value: Number(manualVendorSealed.value),
            origin: "manual",
            type: "sealed"
          }
        ]
      }
    }));
    setManualVendorSealed({ productName: "", setName: "", productType: "Booster Box", quantity: 1, value: "", condition: "Sealed" });
    setShowVendorSealed(false);
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

  // Customer handlers
  function addManualCustomerCard() {
    if (!manualCustomer.name || !manualCustomer.value || isNaN(manualCustomer.value)) return;
    setTrade(prev => ({
      ...prev,
      customer: {
        ...prev.customer,
        cards: [
          ...prev.customer.cards,
          {
            id: "manual_" + Date.now(),
            cardName: manualCustomer.name,
            condition: manualCustomer.condition,
            value: Number(manualCustomer.value),
            origin: "manual"
          }
        ]
      }
    }));
    setManualCustomer({ name: "", value: "", condition: "NM" });
    setShowCustomerManual(false);
  }
  function addManualCustomerSealed() {
    if (!manualCustomerSealed.productName || !manualCustomerSealed.value || isNaN(manualCustomerSealed.value)) return;
    setTrade(prev => ({
      ...prev,
      customer: {
        ...prev.customer,
        sealed: [
          ...prev.customer.sealed,
          {
            id: "sealed_manual_" + Date.now(),
            ...manualCustomerSealed,
            value: Number(manualCustomerSealed.value),
            origin: "manual",
            type: "sealed"
          }
        ]
      }
    }));
    setManualCustomerSealed({ productName: "", setName: "", productType: "Booster Box", quantity: 1, value: "", condition: "Sealed" });
    setShowCustomerSealed(false);
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

  // ----------- CardLookup Style Customer Card Lookup ------------

  // Load sets once if needed
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
  // eslint-disable-next-line
  }, [showCustomerLookup]);

  // Core lookup logic
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
        // Now filter locally for set.printedTotal
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

  // Local paging for number/numberSetTotal search
  useEffect(() => {
    if (
      (lookupType === "number" && allNumberResults.length > 0) ||
      (lookupType === "numberSetTotal" && allNumberResults.length > 0)
    ) {
      setLookupResults(allNumberResults.slice((lookupPage - 1) * LOOKUP_PAGE_SIZE, lookupPage * LOOKUP_PAGE_SIZE));
      setLookupTotalCount(allNumberResults.length);
    }
    // eslint-disable-next-line
  }, [lookupPage, allNumberResults]);

  // Reset search on input change
  useEffect(() => {
    setLookupPage(1);
    setLookupResults([]);
    setLookupSelectedCard(null);
    setLookupShowModal(false);
    setLookupTotalCount(0);
    setAllNumberResults([]);
    // eslint-disable-next-line
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

  // Add found card to trade
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

  // Confirm trade: customer adds get added, vendor inventory removals
  async function confirmTrade() {
    if (!uid) return;
    setConfirmError("");

    const totalVendor = trade.vendor.cards.reduce((a, c) => a + Number(c.value || 0), 0)
      + trade.vendor.sealed.reduce((a, c) => a + Number(c.value || 0), 0)
      + Number(trade.vendor.cash || 0);
    const totalCustomer = trade.customer.cards.reduce((a, c) => a + Number(c.value || 0), 0)
      + trade.customer.sealed.reduce((a, c) => a + Number(c.value || 0), 0)
      + Number(trade.customer.cash || 0);

    if (totalVendor === 0 && totalCustomer === 0) {
      setConfirmError("Cannot confirm empty trade.");
      return;
    }
    if (trade.vendor.cash > cashOnHand) {
      setConfirmError("You don't have enough cash on hand!");
      return;
    }

    // ---- Save to Firestore trade history, INCLUDING showId if showActive ----
    const tradeRecord = {
      ...trade,
      date: new Date().toISOString(),
      vendorEmail: user.email,
      valueVendor: totalVendor,
      valueCustomer: totalCustomer,
      showId: showActive?.id || null,
      showName: showActive?.showName || null,
    };
    const historyRef = collection(db, "users", uid, "tradeHistory");
    await setDoc(doc(historyRef), tradeRecord);

    // Vendor inventory removals
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
  const customerTotal =
    trade.customer.cards.reduce((sum, c) => sum + Number(c.value || 0), 0) +
    trade.customer.sealed.reduce((sum, c) => sum + Number(c.value || 0), 0) +
    Number(trade.customer.cash || 0);

  return (
    <>
      <div className="trade-tab-root">
        <h2 className="trade-tab-title">Trade Builder</h2>
        <div className="trade-row">
          {/* -------- Vendor Side -------- */}
          <div className="trade-side vendor-side-box">
            <div className="trade-side-title">Your Side (Vendor)</div>
            <div className="trade-side-controls">
              <button className="trade-side-btn" onClick={() => setShowVendorManual(true)}>Add Card (Manual)</button>
              <button className="trade-side-btn sealed" onClick={() => setShowVendorSealed(true)}>Add Sealed Product</button>
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
                      <td className="item-value">${Number(card.value || 0).toFixed(2)}</td>
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
                      <td className="item-value">${Number(prod.value || 0).toFixed(2)}</td>
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

          {/* -------- Customer Side -------- */}
          <div className="trade-side vendor-side-box">
            <div className="trade-side-title">Customer Side</div>
            <div className="trade-side-controls">
              <button className="trade-side-btn" onClick={() => setShowCustomerManual(true)}>Add Card (Manual)</button>
              <button className="trade-side-btn sealed" onClick={() => setShowCustomerSealed(true)}>Add Sealed Product</button>
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
                      <td className="item-value">${Number(card.value || 0).toFixed(2)}</td>
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
                      <td className="item-value">${Number(prod.value || 0).toFixed(2)}</td>
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
              Total: ${customerTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

        {/* Confirm Modal */}
        {confirmOpen && (
          <div className="trade-modal-bg">
            <div className="trade-modal">
              <div className="trade-modal-title">Confirm Trade</div>
              {confirmError && <div className="trade-modal-error">{confirmError}</div>}
              <div>
                <b>Vendor Total:</b> ${vendorTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<br />
                <b>Customer Total:</b> ${customerTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ marginTop: 18 }}>
                <button className="trade-modal-btn" onClick={confirmTrade}>Confirm</button>
                <button className="trade-modal-cancel-btn" onClick={() => setConfirmOpen(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Vendor Manual Modal */}
        {showVendorManual && (
          <div className="trade-modal-bg">
            <div className="trade-modal">
              <div className="trade-modal-title">Add Card (Manual)</div>
              <input
                className="trade-modal-input"
                type="text"
                placeholder="Card Name"
                value={manualVendor.name}
                onChange={e => setManualVendor({ ...manualVendor, name: e.target.value })}
              />
              <input
                className="trade-modal-input"
                type="number"
                placeholder="Market Value"
                value={manualVendor.value}
                onChange={e => setManualVendor({ ...manualVendor, value: e.target.value })}
              />
              <select
                className="trade-modal-select"
                value={manualVendor.condition}
                onChange={e => setManualVendor({ ...manualVendor, condition: e.target.value })}
              >
                <option value="NM">Near Mint (NM)</option>
                <option value="LP">Light Play (LP)</option>
                <option value="MP">Moderate Play (MP)</option>
                <option value="HP">Heavy Play (HP)</option>
                <option value="DMG">Damaged</option>
              </select>
              <button className="trade-modal-btn" onClick={addManualVendorCard}>Add</button>
              <button className="trade-modal-cancel-btn" onClick={() => setShowVendorManual(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Vendor Sealed Modal */}
        {showVendorSealed && (
          <div className="trade-modal-bg">
            <div className="trade-modal">
              <div className="trade-modal-title">Add Sealed Product</div>
              <input
                className="trade-modal-input"
                type="text"
                placeholder="Product Name"
                value={manualVendorSealed.productName}
                onChange={e => setManualVendorSealed({ ...manualVendorSealed, productName: e.target.value })}
              />
              <input
                className="trade-modal-input"
                type="text"
                placeholder="Set Name"
                value={manualVendorSealed.setName}
                onChange={e => setManualVendorSealed({ ...manualVendorSealed, setName: e.target.value })}
              />
              <select
                className="trade-modal-select"
                value={manualVendorSealed.productType}
                onChange={e => setManualVendorSealed({ ...manualVendorSealed, productType: e.target.value })}
              >
                <option>Booster Box</option>
                <option>Booster Pack</option>
                <option>ETB</option>
                <option>Tin</option>
                <option>Deck</option>
                <option>Other</option>
              </select>
              <input
                className="trade-modal-input"
                type="number"
                placeholder="Quantity"
                value={manualVendorSealed.quantity}
                onChange={e => setManualVendorSealed({ ...manualVendorSealed, quantity: e.target.value })}
              />
              <input
                className="trade-modal-input"
                type="number"
                placeholder="Market Value"
                value={manualVendorSealed.value}
                onChange={e => setManualVendorSealed({ ...manualVendorSealed, value: e.target.value })}
              />
              <button className="trade-modal-btn" onClick={addManualVendorSealed}>Add</button>
              <button className="trade-modal-cancel-btn" onClick={() => setShowVendorSealed(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Customer Manual Modal */}
        {showCustomerManual && (
          <div className="trade-modal-bg">
            <div className="trade-modal">
              <div className="trade-modal-title">Add Card (Manual)</div>
              <input
                className="trade-modal-input"
                type="text"
                placeholder="Card Name"
                value={manualCustomer.name}
                onChange={e => setManualCustomer({ ...manualCustomer, name: e.target.value })}
              />
              <input
                className="trade-modal-input"
                type="number"
                placeholder="Market Value"
                value={manualCustomer.value}
                onChange={e => setManualCustomer({ ...manualCustomer, value: e.target.value })}
              />
              <select
                className="trade-modal-select"
                value={manualCustomer.condition}
                onChange={e => setManualCustomer({ ...manualCustomer, condition: e.target.value })}
              >
                <option value="NM">Near Mint (NM)</option>
                <option value="LP">Light Play (LP)</option>
                <option value="MP">Moderate Play (MP)</option>
                <option value="HP">Heavy Play (HP)</option>
                <option value="DMG">Damaged</option>
              </select>
              <button className="trade-modal-btn" onClick={addManualCustomerCard}>Add</button>
              <button className="trade-modal-cancel-btn" onClick={() => setShowCustomerManual(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Customer Sealed Modal */}
        {showCustomerSealed && (
          <div className="trade-modal-bg">
            <div className="trade-modal">
              <div className="trade-modal-title">Add Sealed Product</div>
              <input
                className="trade-modal-input"
                type="text"
                placeholder="Product Name"
                value={manualCustomerSealed.productName}
                onChange={e => setManualCustomerSealed({ ...manualCustomerSealed, productName: e.target.value })}
              />
              <input
                className="trade-modal-input"
                type="text"
                placeholder="Set Name"
                value={manualCustomerSealed.setName}
                onChange={e => setManualCustomerSealed({ ...manualCustomerSealed, setName: e.target.value })}
              />
              <select
                className="trade-modal-select"
                value={manualCustomerSealed.productType}
                onChange={e => setManualCustomerSealed({ ...manualCustomerSealed, productType: e.target.value })}
              >
                <option>Booster Box</option>
                <option>Booster Pack</option>
                <option>ETB</option>
                <option>Tin</option>
                <option>Deck</option>
                <option>Other</option>
              </select>
              <input
                className="trade-modal-input"
                type="number"
                placeholder="Quantity"
                value={manualCustomerSealed.quantity}
                onChange={e => setManualCustomerSealed({ ...manualCustomerSealed, quantity: e.target.value })}
              />
              <input
                className="trade-modal-input"
                type="number"
                placeholder="Market Value"
                value={manualCustomerSealed.value}
                onChange={e => setManualCustomerSealed({ ...manualCustomerSealed, value: e.target.value })}
              />
              <button className="trade-modal-btn" onClick={addManualCustomerSealed}>Add</button>
              <button className="trade-modal-cancel-btn" onClick={() => setShowCustomerSealed(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* ----------- Customer Card Lookup Modal (CardLookup Style) ----------- */}
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
                <>
                  <input
                    className="trade-modal-input"
                    placeholder="Card Number (e.g., 4)"
                    value={lookupNumber}
                    onChange={e => setLookupNumber(e.target.value)}
                    style={{ width: "92%", padding: 9, marginBottom: 10, marginLeft: "4%" }}
                    onKeyDown={e => e.key === "Enter" && doLookup(1)}
                  />
                  <input
                    className="trade-modal-input"
                    placeholder="Set Total (e.g., 102)"
                    value={lookupSetTotal}
                    onChange={e => setLookupSetTotal(e.target.value)}
                    style={{ width: "92%", padding: 9, marginBottom: 10, marginLeft: "4%" }}
                    onKeyDown={e => e.key === "Enter" && doLookup(1)}
                  />
                </>
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
