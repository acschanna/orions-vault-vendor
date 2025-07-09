import React, { useState, useEffect } from "react";
import { useUser } from "./App";
import { db } from "./firebase";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import "./TradeTab.css";

const accentGreen = "#00b84a";
const API_KEY = 'd49129a9-8f4c-4130-968a-cd47501df765';

export default function TradeTab() {
  const user = useUser();
  const uid = user?.uid;

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

  // Customer lookup
  const [showCustomerLookup, setShowCustomerLookup] = useState(false);
  const [customerSearchType, setCustomerSearchType] = useState("name");
  const [customerLookupQuery, setCustomerLookupQuery] = useState("");
  const [customerLookupSet, setCustomerLookupSet] = useState("");
  const [customerLookupNumber, setCustomerLookupNumber] = useState("");
  const [customerLookupCondition, setCustomerLookupCondition] = useState("NM");
  const [customerLookupResults, setCustomerLookupResults] = useState([]);
  const [customerLookupLoading, setCustomerLookupLoading] = useState(false);
  const [customerLookupPage, setCustomerLookupPage] = useState(1);
  const [customerLookupTotalResults, setCustomerLookupTotalResults] = useState(null);
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

  // Customer handlers (no changes needed, see previous version)
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

  // Customer lookup
  useEffect(() => {
    if (!showCustomerLookup) return;
    setSetsLoading(true);
    fetch('https://api.pokemontcg.io/v2/sets', {
      headers: { 'X-Api-Key': API_KEY }
    })
      .then(r => r.json())
      .then(data => setSets(data.data.sort((a, b) => (b.releaseDate > a.releaseDate ? 1 : -1))))
      .catch(() => setSets([]))
      .finally(() => setSetsLoading(false));
  }, [showCustomerLookup]);
  async function lookupCustomerCards(page = 1) {
    setCustomerLookupLoading(true);
    setCustomerLookupResults([]);
    const cardsPerPage = 8;
    let url = "";
    if (customerSearchType === "name") {
      url = `https://api.pokemontcg.io/v2/cards?q=name:"${encodeURIComponent(
        customerLookupQuery
      )}"&page=${page}&pageSize=${cardsPerPage}`;
    } else {
      url = `https://api.pokemontcg.io/v2/cards?q=set.id:"${encodeURIComponent(
        customerLookupSet
      )}"+number:"${encodeURIComponent(customerLookupNumber)}"&page=${page}&pageSize=${cardsPerPage}`;
    }
    try {
      const res = await fetch(url, { headers: { "X-Api-Key": API_KEY } });
      const data = await res.json();
      setCustomerLookupResults(data.data || []);
      setCustomerLookupTotalResults(data.totalCount || null);
      setCustomerLookupPage(page);
    } catch {
      setCustomerLookupResults([]);
      setCustomerLookupTotalResults(null);
    }
    setCustomerLookupLoading(false);
  }
  function addCustomerCard(card) {
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
            number: card.number,
            value:
              card.tcgplayer?.prices?.normal?.market ??
              card.tcgplayer?.prices?.holofoil?.market ??
              card.tcgplayer?.prices?.reverseHolofoil?.market ??
              0,
            condition: customerLookupCondition,
            origin: "lookup"
          }
        ]
      }
    }));
    setShowCustomerLookup(false);
    setCustomerLookupQuery("");
    setCustomerLookupSet("");
    setCustomerLookupNumber("");
    setCustomerLookupResults([]);
    setCustomerLookupCondition("NM");
    setCustomerLookupPage(1);
    setCustomerLookupTotalResults(null);
  }

  function clearTrade() {
    setTrade({
      vendor: { cards: [], sealed: [], cash: 0, cashType: "cash" },
      customer: { cards: [], sealed: [], cash: 0, cashType: "cash" }
    });
    setConfirmError("");
  }

  // Confirm trade (fix: properly log, update inventory, update cash)
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

    // Save to Firestore trade history
    const tradeRecord = {
      ...trade,
      date: new Date().toISOString(),
      vendorEmail: user.email,
      valueVendor: totalVendor,
      valueCustomer: totalCustomer
    };
    const historyRef = collection(db, "users", uid, "tradeHistory");
    await setDoc(doc(historyRef), tradeRecord);

    // Remove traded inventory
    for (let c of trade.vendor.cards) {
      if (c.origin === "inventory" && c.id) {
        await updateDoc(doc(db, "users", uid, "inventory", c.id), { traded: true });
      }
    }
    for (let c of trade.vendor.sealed) {
      if (c.origin === "inventory" && c.id) {
        await updateDoc(doc(db, "users", uid, "inventory", c.id), { traded: true });
      }
    }

    // Subtract cash if applicable
    if (trade.vendor.cash > 0) {
      const cashAfter = cashOnHand - trade.vendor.cash;
      await setDoc(doc(db, "users", uid), { cashOnHand: cashAfter }, { merge: true });
      setCashOnHand(cashAfter);
    }

    clearTrade();
    setConfirmOpen(false);
    alert("Trade completed and logged!");
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
    <div className="trade-tab-root">
      <h2 className="trade-tab-title">Trade Builder</h2>
      <div className="trade-row">
        {/* -------- Vendor Side -------- */}
        <div className="trade-side vendor-side-box">
          <div className="trade-side-title">Your Side (Vendor)</div>
          <div className="trade-side-controls">
            <button
              className="trade-side-btn"
              onClick={() => setShowVendorManual(true)}
            >
              Add Card (Manual)
            </button>
            <button
              className="trade-side-btn sealed"
              onClick={() => setShowVendorSealed(true)}
            >
              Add Sealed Product
            </button>
            <button
              className="trade-side-btn cancel"
              onClick={clearTrade}
            >
              Clear Trade
            </button>
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
            <button
              className="trade-side-btn"
              onClick={() => setShowCustomerManual(true)}
            >
              Add Card (Manual)
            </button>
            <button
              className="trade-side-btn sealed"
              onClick={() => setShowCustomerSealed(true)}
            >
              Add Sealed Product
            </button>
            <button
              className="trade-side-btn"
              style={{ background: "#198c47" }}
              onClick={() => setShowCustomerLookup(true)}
            >
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
              type="text"
              placeholder="Card Name"
              value={manualVendor.name}
              onChange={e => setManualVendor({ ...manualVendor, name: e.target.value })}
              style={{ width: "90%", padding: 9, marginBottom: 12 }}
            />
            <input
              type="number"
              placeholder="Market Value"
              value={manualVendor.value}
              onChange={e => setManualVendor({ ...manualVendor, value: e.target.value })}
              style={{ width: "90%", padding: 9, marginBottom: 12 }}
            />
            <select
              value={manualVendor.condition}
              onChange={e => setManualVendor({ ...manualVendor, condition: e.target.value })}
              style={{ width: "90%", padding: 9, marginBottom: 12 }}
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
              type="text"
              placeholder="Product Name"
              value={manualVendorSealed.productName}
              onChange={e => setManualVendorSealed({ ...manualVendorSealed, productName: e.target.value })}
              style={{ width: "90%", padding: 9, marginBottom: 10 }}
            />
            <input
              type="text"
              placeholder="Set Name"
              value={manualVendorSealed.setName}
              onChange={e => setManualVendorSealed({ ...manualVendorSealed, setName: e.target.value })}
              style={{ width: "90%", padding: 9, marginBottom: 10 }}
            />
            <select
              value={manualVendorSealed.productType}
              onChange={e => setManualVendorSealed({ ...manualVendorSealed, productType: e.target.value })}
              style={{ width: "90%", padding: 9, marginBottom: 10 }}
            >
              <option>Booster Box</option>
              <option>Booster Pack</option>
              <option>ETB</option>
              <option>Tin</option>
              <option>Deck</option>
              <option>Other</option>
            </select>
            <input
              type="number"
              placeholder="Quantity"
              value={manualVendorSealed.quantity}
              onChange={e => setManualVendorSealed({ ...manualVendorSealed, quantity: e.target.value })}
              style={{ width: "90%", padding: 9, marginBottom: 10 }}
            />
            <input
              type="number"
              placeholder="Market Value"
              value={manualVendorSealed.value}
              onChange={e => setManualVendorSealed({ ...manualVendorSealed, value: e.target.value })}
              style={{ width: "90%", padding: 9, marginBottom: 10 }}
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
              type="text"
              placeholder="Card Name"
              value={manualCustomer.name}
              onChange={e => setManualCustomer({ ...manualCustomer, name: e.target.value })}
              style={{ width: "90%", padding: 9, marginBottom: 12 }}
            />
            <input
              type="number"
              placeholder="Market Value"
              value={manualCustomer.value}
              onChange={e => setManualCustomer({ ...manualCustomer, value: e.target.value })}
              style={{ width: "90%", padding: 9, marginBottom: 12 }}
            />
            <select
              value={manualCustomer.condition}
              onChange={e => setManualCustomer({ ...manualCustomer, condition: e.target.value })}
              style={{ width: "90%", padding: 9, marginBottom: 12 }}
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
              type="text"
              placeholder="Product Name"
              value={manualCustomerSealed.productName}
              onChange={e => setManualCustomerSealed({ ...manualCustomerSealed, productName: e.target.value })}
              style={{ width: "90%", padding: 9, marginBottom: 10 }}
            />
            <input
              type="text"
              placeholder="Set Name"
              value={manualCustomerSealed.setName}
              onChange={e => setManualCustomerSealed({ ...manualCustomerSealed, setName: e.target.value })}
              style={{ width: "90%", padding: 9, marginBottom: 10 }}
            />
            <select
              value={manualCustomerSealed.productType}
              onChange={e => setManualCustomerSealed({ ...manualCustomerSealed, productType: e.target.value })}
              style={{ width: "90%", padding: 9, marginBottom: 10 }}
            >
              <option>Booster Box</option>
              <option>Booster Pack</option>
              <option>ETB</option>
              <option>Tin</option>
              <option>Deck</option>
              <option>Other</option>
            </select>
            <input
              type="number"
              placeholder="Quantity"
              value={manualCustomerSealed.quantity}
              onChange={e => setManualCustomerSealed({ ...manualCustomerSealed, quantity: e.target.value })}
              style={{ width: "90%", padding: 9, marginBottom: 10 }}
            />
            <input
              type="number"
              placeholder="Market Value"
              value={manualCustomerSealed.value}
              onChange={e => setManualCustomerSealed({ ...manualCustomerSealed, value: e.target.value })}
              style={{ width: "90%", padding: 9, marginBottom: 10 }}
            />
            <button className="trade-modal-btn" onClick={addManualCustomerSealed}>Add</button>
            <button className="trade-modal-cancel-btn" onClick={() => setShowCustomerSealed(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Customer Lookup Modal */}
      {showCustomerLookup && (
        <div className="trade-lookup-modal-bg">
          <div className="trade-lookup-modal">
            <div className="trade-modal-title">Lookup Pokémon Card</div>
            <select
              value={customerSearchType}
              onChange={e => setCustomerSearchType(e.target.value)}
              style={{ width: "93%", padding: 9, marginBottom: 10 }}
            >
              <option value="name">Search by Name</option>
              <option value="number">Search by Set & Number</option>
            </select>
            {customerSearchType === "name" ? (
              <input
                placeholder="Card Name"
                value={customerLookupQuery}
                onChange={e => setCustomerLookupQuery(e.target.value)}
                style={{ width: "93%", padding: 9, marginBottom: 10 }}
                onKeyDown={e => {
                  if (e.key === "Enter") lookupCustomerCards(1);
                }}
              />
            ) : setsLoading ? (
              <span style={{ color: accentGreen }}>Loading sets...</span>
            ) : (
              <>
                <select
                  value={customerLookupSet}
                  onChange={e => setCustomerLookupSet(e.target.value)}
                  style={{ width: "60%", padding: 9, marginBottom: 10 }}
                >
                  <option value="">Select Set</option>
                  {sets.map(set => (
                    <option key={set.id} value={set.id}>
                      {set.name} [{set.id}]
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Card Number"
                  value={customerLookupNumber}
                  onChange={e => setCustomerLookupNumber(e.target.value)}
                  style={{ width: "35%", padding: 9, marginBottom: 10, marginLeft: 6 }}
                />
              </>
            )}
            <select
              value={customerLookupCondition}
              onChange={e => setCustomerLookupCondition(e.target.value)}
              style={{ width: "93%", padding: 9, marginBottom: 10 }}
            >
              <option value="NM">Near Mint (NM)</option>
              <option value="LP">Light Play (LP)</option>
              <option value="MP">Moderate Play (MP)</option>
              <option value="HP">Heavy Play (HP)</option>
              <option value="DMG">Damaged</option>
            </select>
            <button
              className="trade-modal-btn"
              onClick={() => lookupCustomerCards(1)}
              disabled={customerLookupLoading}
            >
              Lookup
            </button>
            <button
              className="trade-modal-cancel-btn"
              onClick={() => setShowCustomerLookup(false)}
            >
              Cancel
            </button>
            {customerLookupLoading && (
              <div style={{ color: accentGreen, marginTop: 10 }}>Loading...</div>
            )}
            <div style={{ marginTop: 12 }}>
              {customerLookupResults.length > 0 && (
                <table className="trade-side-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Set</th>
                      <th>#</th>
                      <th>Value</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerLookupResults.map(card => (
                      <tr key={card.id}>
                        <td>{card.name}</td>
                        <td>{card.set?.name}</td>
                        <td>{card.number}</td>
                        <td>
                          $
                          {(card.tcgplayer?.prices?.normal?.market ??
                            card.tcgplayer?.prices?.holofoil?.market ??
                            card.tcgplayer?.prices?.reverseHolofoil?.market ??
                            0
                          ).toFixed(2)}
                        </td>
                        <td>
                          <button
                            className="trade-side-btn"
                            style={{ padding: "3px 10px", fontSize: 14, marginLeft: 0 }}
                            onClick={() => addCustomerCard(card)}
                          >
                            +
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {customerLookupResults.length === 0 && !customerLookupLoading && (
                <div style={{ color: "#aaa", marginTop: 12 }}>No cards found.</div>
              )}
            </div>
            {customerLookupTotalResults > 8 && (
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <button
                  className="trade-side-btn"
                  disabled={customerLookupPage === 1}
                  onClick={() => lookupCustomerCards(customerLookupPage - 1)}
                >
                  Prev
                </button>
                <span style={{ color: "#fff", fontWeight: "bold", margin: "0 10px" }}>
                  Page {customerLookupPage}
                </span>
                <button
                  className="trade-side-btn"
                  disabled={customerLookupResults.length < 8}
                  onClick={() => lookupCustomerCards(customerLookupPage + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
