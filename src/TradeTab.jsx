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
  addDoc, // <-- make sure this is imported!
} from "firebase/firestore";

const accentGreen = "#00b84a";
const cardDark = "#181b1e";
const fontFamily = `'Inter', Arial, Helvetica, sans-serif`;
const API_KEY = 'd49129a9-8f4c-4130-968a-cd47501df765';

export default function TradeTab() {
  const user = useUser();
  const uid = user?.uid;

  // --- Main trade state
  const [trade, setTrade] = useState({
    vendor: { cards: [], cash: 0, cashType: "cash" },
    customer: { cards: [], cash: 0, cashType: "cash" }
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  // Vendor add state
  const [showVendorManual, setShowVendorManual] = useState(false);
  const [manualVendor, setManualVendor] = useState({ name: "", value: "", condition: "NM" });

  // Customer add state
  const [showCustomerManual, setShowCustomerManual] = useState(false);
  const [manualCustomer, setManualCustomer] = useState({ name: "", value: "", condition: "NM" });

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

  // Cloud inventory/cash
  const [inventory, setInventory] = useState([]);
  const [cashOnHand, setCashOnHand] = useState(0);
  const [inventoryLoading, setInventoryLoading] = useState(true);

  // -------- Cloud Inventory/Cash Fetch ---------
  useEffect(() => {
    if (!uid) return;
    async function fetchAll() {
      setInventoryLoading(true);
      // Inventory
      const invSnap = await getDocs(collection(db, "users", uid, "inventory"));
      setInventory(invSnap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      // Cash
      const userSnap = await getDoc(doc(db, "users", uid));
      const d = userSnap.data() || {};
      setCashOnHand(Number(d.cashOnHand || 0));
      setInventoryLoading(false);
    }
    fetchAll();
  }, [uid]);

  // -------- Vendor Side Handlers ---------
  function addVendorFromInventory(id) {
    const card = inventory.find(c => c.id === id);
    if (!card) return;
    setTrade(prev => ({
      ...prev,
      vendor: {
        ...prev.vendor,
        cards: [
          ...prev.vendor.cards,
          {
            ...card,
            value: card.marketValue,
            origin: "inventory"
          }
        ]
      }
    }));
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
  function removeVendorCard(id) {
    setTrade(prev => ({
      ...prev,
      vendor: {
        ...prev.vendor,
        cards: prev.vendor.cards.filter(c => c.id !== id)
      }
    }));
  }

  // -------- Customer Side Handlers ---------
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
  function removeCustomerCard(id) {
    setTrade(prev => ({
      ...prev,
      customer: {
        ...prev.customer,
        cards: prev.customer.cards.filter(c => c.id !== id)
      }
    }));
  }

  // --------- Cash ---------
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

  // --------- Lookup ---------
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

  // --------- Clear Trade ---------
  function clearTrade() {
    setTrade({
      vendor: { cards: [], cash: 0, cashType: "cash" },
      customer: { cards: [], cash: 0, cashType: "cash" }
    });
  }

  // --------- Confirm Trade (Cloud Sync, updated logic + trade log) ---------
  async function doTrade() {
    // Trade is allowed if there is at least 1 card or cash on EITHER side
    if (
      trade.vendor.cards.length === 0 &&
      trade.vendor.cash === 0 &&
      trade.customer.cards.length === 0 &&
      trade.customer.cash === 0
    ) {
      setConfirmError("You must add at least one card or cash to complete the trade!");
      return;
    }

    // --- Get vendor cards being traded away ---
    const vendorInventoryCards = trade.vendor.cards.filter(c => c.origin === "inventory");
    const vendorInventoryIds = vendorInventoryCards.map(c => c.id);

    // Get the *cost* (acquisitionCost) of vendor inventory cards
    let totalVendorCost = vendorInventoryCards.reduce(
      (sum, card) => sum + (Number(card.acquisitionCost) || 0),
      0
    );

    // Subtract any cash from customer to vendor (customer.cash)
    let netCost = totalVendorCost - (Number(trade.customer.cash) || 0);
    if (netCost < 0) netCost = 0;

    // Determine new cards coming IN to vendor inventory
    const incomingCards = trade.customer.cards;
    const numIncoming = incomingCards.length;
    let perCardAcqCost = numIncoming > 0 ? (netCost / numIncoming) : 0;

    // --- Cloud Inventory/Cash Logic ---
    // Get latest inventory
    const invSnap = await getDocs(collection(db, "users", uid, "inventory"));
    let inv = invSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }));

    // Remove vendor's traded-away cards
    inv = inv.filter(card => !vendorInventoryIds.includes(card.id));

    // Add customer cards to inventory (with new calculated acquisition cost)
    let newCards = incomingCards.map(c => ({
      setName: c.setName,
      cardName: c.cardName,
      cardNumber: c.number,
      marketValue: c.value,
      acquisitionCost: perCardAcqCost,
      condition: c.condition,
      dateAdded: new Date().toISOString(),
    }));

    // Write new inventory (delete old, add new)
    // First, delete vendor's traded cards
    for (let cardId of vendorInventoryIds) {
      try {
        await setDoc(doc(db, "users", uid, "inventory", cardId), {}, { merge: false });
        await updateDoc(doc(db, "users", uid, "inventory", cardId), { deleted: true }); // optional marker
      } catch {}
    }
    // Then, add all new customer cards
    for (let card of newCards) {
      await setDoc(doc(collection(db, "users", uid, "inventory")), card);
    }

    // Adjust cash: vendor gets customer cash, loses vendor cash
    let userSnap = await getDoc(doc(db, "users", uid));
    let cash = Number(userSnap.data()?.cashOnHand || 0);
    let netCash = (Number(trade.customer.cash) || 0) - (Number(trade.vendor.cash) || 0);
    cash += netCash;
    await setDoc(doc(db, "users", uid), { cashOnHand: cash }, { merge: true });

    // NEW: Write trade to tradeHistory
    await addDoc(collection(db, "users", uid, "tradeHistory"), {
      date: new Date().toISOString(),
      vendor: trade.vendor,
      customer: trade.customer,
      summary: {
        vendorTotal:
          trade.vendor.cards.reduce((sum, c) => sum + (Number(c.value) || 0), 0) +
          (Number(trade.vendor.cash) || 0),
        customerTotal:
          trade.customer.cards.reduce((sum, c) => sum + (Number(c.value) || 0), 0) +
          (Number(trade.customer.cash) || 0),
        cashChange: (Number(trade.customer.cash) || 0) - (Number(trade.vendor.cash) || 0),
      }
    });

    // Reset trade state/UI
    setTrade({
      vendor: { cards: [], cash: 0, cashType: "cash" },
      customer: { cards: [], cash: 0, cashType: "cash" }
    });
    setConfirmOpen(false);

    // Reload inventory/cash from Firestore
    const invSnap2 = await getDocs(collection(db, "users", uid, "inventory"));
    setInventory(invSnap2.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    const userSnap2 = await getDoc(doc(db, "users", uid));
    setCashOnHand(Number(userSnap2.data()?.cashOnHand || 0));
  }

  // --------- Totals ---------
  const vendorTotal =
    trade.vendor.cards.reduce((sum, c) => sum + (Number(c.value) || 0), 0) +
    (Number(trade.vendor.cash) || 0);
  const customerTotal =
    trade.customer.cards.reduce((sum, c) => sum + (Number(c.value) || 0), 0) +
    (Number(trade.customer.cash) || 0);

  // --------- UI ---------
  return (
    <div>
      <h2 style={{ color: accentGreen, fontWeight: 700, marginTop: 0, textAlign: "center" }}>Trade Builder</h2>
      <div
        style={{
          display: "flex",
          gap: 48,
          justifyContent: "center",
          alignItems: "flex-start",
          marginBottom: 28,
          flexWrap: "wrap"
        }}
      >
        {/* -------- Vendor Side -------- */}
        <div style={{
          background: "#161b1b",
          padding: 30,
          borderRadius: 18,
          minWidth: 420,
          maxWidth: 500,
          flex: "1 1 440px",
          border: `2.5px solid ${accentGreen}33`
        }}>
          <div style={{ fontWeight: 700, color: accentGreen, fontSize: 20, marginBottom: 8 }}>Vendor Side</div>
          <div style={{ marginBottom: 14 }}>
            <select
              defaultValue=""
              style={{
                fontFamily,
                fontSize: 16,
                padding: 9,
                marginRight: 8,
                background: cardDark,
                color: "#fff",
                border: "1px solid #333",
                borderRadius: 7
              }}
              onChange={e => {
                if (e.target.value) addVendorFromInventory(e.target.value);
                e.target.value = "";
              }}
              disabled={inventoryLoading}
            >
              <option value="">Add from Inventory...</option>
              {inventory.map(card => (
                <option value={card.id} key={card.id}>
                  {card.cardName || card.name} ({card.setName || card.set?.name}) #{card.cardNumber}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowVendorManual(v => !v)}
              style={{
                padding: "9px 16px",
                background: "#2a2",
                color: "#fff",
                border: "none",
                borderRadius: 7,
                fontWeight: 700,
                marginLeft: 3,
                cursor: "pointer"
              }}
            >
              Add Manual Card
            </button>
          </div>
          {showVendorManual && (
            <div style={{ marginBottom: 14, background: "#233", borderRadius: 7, padding: 10 }}>
              <input
                placeholder="Card Name"
                value={manualVendor.name}
                onChange={e => setManualVendor(m => ({ ...m, name: e.target.value }))}
                style={{
                  marginRight: 8,
                  padding: 7,
                  borderRadius: 5,
                  border: "1px solid #444",
                  background: "#181b1e",
                  color: "#fff",
                  width: 140
                }}
              />
              <select
                value={manualVendor.condition}
                onChange={e => setManualVendor(m => ({ ...m, condition: e.target.value }))}
                style={{
                  marginRight: 8,
                  padding: 7,
                  borderRadius: 5,
                  background: "#181b1e",
                  color: "#fff",
                  border: "1px solid #444"
                }}
              >
                <option value="NM">NM</option>
                <option value="LP">LP</option>
                <option value="MP">MP</option>
                <option value="HP">HP</option>
                <option value="DMG">DMG</option>
              </select>
              <input
                placeholder="Value"
                type="number"
                min="0"
                value={manualVendor.value}
                onChange={e => setManualVendor(m => ({ ...m, value: e.target.value }))}
                style={{
                  marginRight: 8,
                  padding: 7,
                  borderRadius: 5,
                  border: "1px solid #444",
                  background: "#181b1e",
                  color: "#fff",
                  width: 95
                }}
              />
              <button
                onClick={addManualVendorCard}
                style={{
                  background: accentGreen,
                  color: "#181b1e",
                  padding: "7px 16px",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 700,
                  cursor: "pointer"
                }}
                disabled={!manualVendor.name || !manualVendor.value}
              >
                Add
              </button>
              <button
                onClick={() => setShowVendorManual(false)}
                style={{
                  marginLeft: 8,
                  background: "#23262a",
                  color: "#fff",
                  padding: "7px 16px",
                  border: `1px solid #444`,
                  borderRadius: 6,
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
            </div>
          )}

          <div style={{ fontWeight: 600, color: "#fff", margin: "12px 0 7px" }}>
            Cards ({trade.vendor.cards.length}):
          </div>
          <div style={{ marginBottom: 18, minHeight: 80 }}>
            {trade.vendor.cards.length === 0 ? (
              <div style={{ color: "#ccc" }}>No cards yet.</div>
            ) : (
              <table style={{ width: "100%", background: "none" }}>
                <thead>
                  <tr style={{ background: "#222" }}>
                    <th style={{ color: accentGreen, padding: 7, fontSize: 15 }}>Name</th>
                    <th style={{ color: accentGreen, padding: 7, fontSize: 15 }}>Cond.</th>
                    <th style={{ color: accentGreen, padding: 7, fontSize: 15 }}>Value</th>
                    <th style={{ color: accentGreen, padding: 7, fontSize: 15 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {trade.vendor.cards.map(card => (
                    <tr key={card.id}>
                      <td style={{ color: "#fff", padding: 7, fontSize: 16 }}>{card.cardName}</td>
                      <td style={{ color: "#fff", padding: 7, fontSize: 16 }}>{card.condition}</td>
                      <td style={{ color: accentGreen, padding: 7, fontSize: 16 }}>${Number(card.value).toFixed(2)}</td>
                      <td style={{ padding: 7 }}>
                        <button
                          onClick={() => removeVendorCard(card.id)}
                          style={{
                            background: "#a22",
                            color: "#fff",
                            border: "none",
                            borderRadius: 5,
                            fontWeight: 700,
                            cursor: "pointer",
                            padding: "3px 12px"
                          }}
                        >
                          ❌
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ color: "#fff", fontWeight: 600, fontSize: 17 }}>
              Cash:
              <input
                type="number"
                min="0"
                step="1"
                value={trade.vendor.cash}
                onChange={e => setVendorCash(e.target.value)}
                style={{
                  marginLeft: 8,
                  width: 85,
                  padding: 8,
                  background: "#181b1e",
                  color: "#fff",
                  border: "1px solid #444",
                  borderRadius: 6,
                  fontSize: 17
                }}
              />{" "}
              <span style={{ color: "#fff" }}>$</span>
              <select
                value={trade.vendor.cashType}
                onChange={e => setVendorCashType(e.target.value)}
                style={{
                  marginLeft: 8,
                  padding: 7,
                  borderRadius: 6,
                  background: "#151c16",
                  color: "#fff"
                }}
              >
                <option value="cash">Cash</option>
                <option value="card">Card/Other</option>
              </select>
            </label>
          </div>
          <div style={{ fontWeight: 700, color: accentGreen, fontSize: 18 }}>
            Total: ${vendorTotal.toFixed(2)}
          </div>
        </div>

        {/* -------- Customer Side -------- */}
        <div style={{
          background: "#161b1b",
          padding: 30,
          borderRadius: 18,
          minWidth: 560,
          maxWidth: 720,
          flex: "1 1 600px",
          border: `2.5px solid ${accentGreen}33`
        }}>
          <div style={{ fontWeight: 700, color: accentGreen, fontSize: 20, marginBottom: 8 }}>Customer Side</div>
          <div style={{ marginBottom: 14 }}>
            <button
              onClick={() => setShowCustomerLookup(true)}
              style={{
                padding: "9px 16px",
                background: "#1a3",
                color: "#fff",
                border: "none",
                borderRadius: 7,
                fontWeight: 700,
                marginRight: 3,
                cursor: "pointer",
                fontSize: 16
              }}
            >
              Add Card
            </button>
            <button
              onClick={() => setShowCustomerManual(true)}
              style={{
                padding: "9px 16px",
                background: "#1a3",
                color: "#fff",
                border: "none",
                borderRadius: 7,
                fontWeight: 700,
                marginLeft: 8,
                cursor: "pointer",
                fontSize: 16
              }}
            >
              Add Manual Card
            </button>
          </div>
          {showCustomerManual && (
            <div style={{ marginBottom: 14, background: "#233", borderRadius: 7, padding: 10 }}>
              <input
                placeholder="Item Name"
                value={manualCustomer.name}
                onChange={e => setManualCustomer(m => ({ ...m, name: e.target.value }))}
                style={{
                  marginRight: 8,
                  padding: 7,
                  borderRadius: 5,
                  border: "1px solid #444",
                  background: "#181b1e",
                  color: "#fff",
                  width: 140
                }}
              />
              <select
                value={manualCustomer.condition}
                onChange={e => setManualCustomer(m => ({ ...m, condition: e.target.value }))}
                style={{
                  marginRight: 8,
                  padding: 7,
                  borderRadius: 5,
                  background: "#181b1e",
                  color: "#fff",
                  border: "1px solid #444"
                }}
              >
                <option value="NM">NM</option>
                <option value="LP">LP</option>
                <option value="MP">MP</option>
                <option value="HP">HP</option>
                <option value="DMG">DMG</option>
              </select>
              <input
                placeholder="Value"
                type="number"
                min="0"
                value={manualCustomer.value}
                onChange={e => setManualCustomer(m => ({ ...m, value: e.target.value }))}
                style={{
                  marginRight: 8,
                  padding: 7,
                  borderRadius: 5,
                  border: "1px solid #444",
                  background: "#181b1e",
                  color: "#fff",
                  width: 95
                }}
              />
              <button
                onClick={addManualCustomerCard}
                style={{
                  background: accentGreen,
                  color: "#181b1e",
                  padding: "7px 16px",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 700,
                  cursor: "pointer"
                }}
                disabled={!manualCustomer.name || !manualCustomer.value}
              >
                Add
              </button>
              <button
                onClick={() => setShowCustomerManual(false)}
                style={{
                  marginLeft: 8,
                  background: "#23262a",
                  color: "#fff",
                  padding: "7px 16px",
                  border: `1px solid #444`,
                  borderRadius: 6,
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
            </div>
          )}
          <div style={{ fontWeight: 600, color: "#fff", margin: "12px 0 7px" }}>
            Cards ({trade.customer.cards.length}):
          </div>
          <div style={{ marginBottom: 18, minHeight: 80 }}>
            {trade.customer.cards.length === 0 ? (
              <div style={{ color: "#ccc" }}>No cards yet.</div>
            ) : (
              <table style={{ width: "100%", background: "none" }}>
                <thead>
                  <tr style={{ background: "#222" }}>
                    <th style={{ color: accentGreen, padding: 7, fontSize: 15 }}>Name</th>
                    <th style={{ color: accentGreen, padding: 7, fontSize: 15 }}>Cond.</th>
                    <th style={{ color: accentGreen, padding: 7, fontSize: 15 }}>Value</th>
                    <th style={{ color: accentGreen, padding: 7, fontSize: 15 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {trade.customer.cards.map(card => (
                    <tr key={card.id}>
                      <td style={{ color: "#fff", padding: 7, fontSize: 16 }}>{card.cardName}</td>
                      <td style={{ color: "#fff", padding: 7, fontSize: 16 }}>{card.condition || "NM"}</td>
                      <td style={{ color: accentGreen, padding: 7, fontSize: 16 }}>${Number(card.value).toFixed(2)}</td>
                      <td style={{ padding: 7 }}>
                        <button
                          onClick={() => removeCustomerCard(card.id)}
                          style={{
                            background: "#a22",
                            color: "#fff",
                            border: "none",
                            borderRadius: 5,
                            fontWeight: 700,
                            cursor: "pointer",
                            padding: "3px 12px"
                          }}
                        >
                          ❌
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ color: "#fff", fontWeight: 600, fontSize: 17 }}>
              Cash:
              <input
                type="number"
                min="0"
                step="1"
                value={trade.customer.cash}
                onChange={e => setCustomerCash(e.target.value)}
                style={{
                  marginLeft: 8,
                  width: 85,
                  padding: 8,
                  background: "#181b1e",
                  color: "#fff",
                  border: "1px solid #444",
                  borderRadius: 6,
                  fontSize: 17
                }}
              />{" "}
              <span style={{ color: "#fff" }}>$</span>
              <select
                value={trade.customer.cashType}
                onChange={e => setCustomerCashType(e.target.value)}
                style={{
                  marginLeft: 8,
                  padding: 7,
                  borderRadius: 6,
                  background: "#151c16",
                  color: "#fff"
                }}
              >
                <option value="cash">Cash</option>
                <option value="card">Card/Other</option>
              </select>
            </label>
          </div>
          <div style={{ fontWeight: 700, color: accentGreen, fontSize: 18 }}>
            Total: ${customerTotal.toFixed(2)}
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 18 }}>
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={
            trade.vendor.cards.length === 0 &&
            trade.vendor.cash === 0 &&
            trade.customer.cards.length === 0 &&
            trade.customer.cash === 0
          }
          style={{
            background: accentGreen,
            color: "#181b1e",
            border: "none",
            borderRadius: 7,
            fontWeight: 700,
            padding: "13px 48px",
            cursor: "pointer",
            fontSize: 21,
            marginRight: 12,
            boxShadow: "0 1px 12px #00b84a30"
          }}
        >
          Confirm Trade
        </button>
        <button
          onClick={clearTrade}
          style={{
            background: "#a22",
            color: "#fff",
            border: "none",
            borderRadius: 7,
            fontWeight: 700,
            padding: "12px 36px",
            cursor: "pointer",
            fontSize: 18,
            marginLeft: 12
          }}
        >
          Clear Trade
        </button>
      </div>

      {/* Confirm Modal */}
      {confirmOpen && (
        <div
          style={{
            position: "fixed",
            top: 0, left: 0, width: "100vw", height: "100vh",
            background: "rgba(0,0,0,.86)",
            zIndex: 9000,
            display: "flex", alignItems: "center", justifyContent: "center"
          }}
          onClick={() => setConfirmOpen(false)}
        >
          <div
            style={{
              background: "#171f18",
              color: "#fff",
              border: `2px solid ${accentGreen}`,
              borderRadius: 14,
              minWidth: 340,
              maxWidth: 410,
              padding: 38,
              textAlign: "center"
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ color: accentGreen, margin: "0 0 10px", fontWeight: 900, fontSize: 23 }}>
              Complete This Trade?
            </h3>
            <div style={{ fontSize: 16, marginBottom: 16 }}>
              This will update your inventory and cash-on-hand.<br /><br />
              Are you sure?
            </div>
            {confirmError && (
              <div style={{ color: "#ff3b43", marginBottom: 8, fontWeight: 600 }}>
                {confirmError}
              </div>
            )}
            <button
              onClick={doTrade}
              style={{
                background: accentGreen,
                color: "#181b1e",
                border: "none",
                borderRadius: 7,
                fontWeight: 800,
                padding: "11px 38px",
                cursor: "pointer",
                fontSize: 17,
                marginRight: 12,
                marginTop: 3
              }}
            >
              Yes, Complete Trade
            </button>
            <button
              onClick={() => setConfirmOpen(false)}
              style={{
                background: "#23262a",
                color: "#fff",
                padding: "11px 28px",
                border: `1.5px solid #444`,
                borderRadius: 7,
                fontWeight: 700,
                fontSize: 15,
                cursor: "pointer",
                marginLeft: 12,
                marginTop: 3
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Customer Card Lookup Modal */}
      {showCustomerLookup && (
        <div
          style={{
            position: "fixed",
            top: 0, left: 0, width: "100vw", height: "100vh",
            background: "rgba(0,0,0,.86)",
            zIndex: 9999,
            display: "flex", alignItems: "center", justifyContent: "center"
          }}
          onClick={() => setShowCustomerLookup(false)}
        >
          <div
            style={{
              background: "#171f18",
              color: "#fff",
              border: `2px solid ${accentGreen}`,
              borderRadius: 14,
              minWidth: 390,
              maxWidth: 600,
              padding: 30,
              boxShadow: "0 8px 44px #00b84a28"
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ color: accentGreen, margin: "0 0 10px", fontWeight: 900, fontSize: 20 }}>
              Add Card from Lookup
            </h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 13 }}>
              <select
                value={customerSearchType}
                onChange={e => setCustomerSearchType(e.target.value)}
                style={{ padding: 7, borderRadius: 5, background: "#181b1e", color: "#fff", border: "1px solid #444" }}
              >
                <option value="name">By Name</option>
                <option value="setnum">By Set/#</option>
              </select>
              {customerSearchType === "name" ? (
                <input
                  placeholder="Card Name"
                  value={customerLookupQuery}
                  onChange={e => setCustomerLookupQuery(e.target.value)}
                  style={{ padding: 7, borderRadius: 5, background: "#181b1e", color: "#fff", border: "1px solid #444", minWidth: 140 }}
                />
              ) : (
                <>
                  <select
                    value={customerLookupSet}
                    onChange={e => setCustomerLookupSet(e.target.value)}
                    style={{ padding: 7, borderRadius: 5, background: "#181b1e", color: "#fff", border: "1px solid #444", minWidth: 120 }}
                  >
                    <option value="">Select Set</option>
                    {setsLoading ? <option>Loading...</option> :
                      sets.map(s => (
                        <option value={s.id} key={s.id}>{s.name}</option>
                      ))}
                  </select>
                  <input
                    placeholder="Card #"
                    value={customerLookupNumber}
                    onChange={e => setCustomerLookupNumber(e.target.value)}
                    style={{ padding: 7, borderRadius: 5, background: "#181b1e", color: "#fff", border: "1px solid #444", minWidth: 65 }}
                  />
                </>
              )}
              <select
                value={customerLookupCondition}
                onChange={e => setCustomerLookupCondition(e.target.value)}
                style={{ padding: 7, borderRadius: 5, background: "#181b1e", color: "#fff", border: "1px solid #444" }}
              >
                <option value="NM">NM</option>
                <option value="LP">LP</option>
                <option value="MP">MP</option>
                <option value="HP">HP</option>
                <option value="DMG">DMG</option>
              </select>
              <button
                onClick={() => lookupCustomerCards(1)}
                disabled={customerSearchType === "name"
                  ? !customerLookupQuery
                  : (!customerLookupSet || !customerLookupNumber)}
                style={{
                  background: accentGreen,
                  color: "#181b1e",
                  border: "none",
                  borderRadius: 7,
                  fontWeight: 700,
                  padding: "7px 18px",
                  fontSize: 15,
                  cursor: "pointer"
                }}
              >
                Search
              </button>
            </div>
            {customerLookupLoading ? (
              <div style={{ color: accentGreen, fontWeight: 700, padding: 28, textAlign: "center" }}>
                Searching...
              </div>
            ) : (
              <>
                {customerLookupResults.length === 0 ? (
                  <div style={{ color: "#ccc", padding: 12, fontStyle: "italic" }}>
                    No results yet.
                  </div>
                ) : (
                  <>
                    <div style={{ fontWeight: 700, color: "#caffea", margin: "6px 0 8px" }}>
                      Results ({customerLookupResults.length} of {customerLookupTotalResults || "?"}):
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                      {customerLookupResults.map(card => (
                        <div
                          key={card.id}
                          style={{
                            background: "#23272b",
                            borderRadius: 10,
                            padding: 14,
                            width: 180,
                            marginBottom: 8,
                            boxShadow: "0 1px 4px #00b84a13"
                          }}
                        >
                          <div style={{ fontWeight: 700, color: accentGreen, fontSize: 15 }}>{card.name}</div>
                          <div style={{ color: "#aaa", fontSize: 13, margin: "3px 0" }}>
                            Set: {card.set?.name}<br />
                            #{card.number}
                          </div>
                          <div style={{ color: "#7ff", fontSize: 15, marginBottom: 6 }}>
                            Market: $
                            {card.tcgplayer?.prices?.normal?.market?.toFixed(2) ||
                              card.tcgplayer?.prices?.holofoil?.market?.toFixed(2) ||
                              card.tcgplayer?.prices?.reverseHolofoil?.market?.toFixed(2) ||
                              "?.??"}
                          </div>
                          <button
                            style={{
                              background: accentGreen,
                              color: "#181b1e",
                              border: "none",
                              borderRadius: 6,
                              fontWeight: 700,
                              padding: "6px 16px",
                              fontSize: 14,
                              cursor: "pointer",
                              marginTop: 4
                            }}
                            onClick={() => addCustomerCard(card)}
                          >
                            Add to Trade
                          </button>
                        </div>
                      ))}
                    </div>
                    {customerLookupTotalResults > customerLookupResults.length && (
                      <div style={{ marginTop: 12 }}>
                        <button
                          onClick={() => lookupCustomerCards(customerLookupPage + 1)}
                          style={{
                            background: accentGreen,
                            color: "#181b1e",
                            border: "none",
                            borderRadius: 6,
                            fontWeight: 700,
                            padding: "7px 22px",
                            fontSize: 14,
                            cursor: "pointer"
                          }}
                        >
                          Next Page &gt;
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            <button
              onClick={() => setShowCustomerLookup(false)}
              style={{
                marginTop: 18,
                background: "#23262a",
                color: "#fff",
                padding: "7px 16px",
                border: `1.5px solid #444`,
                borderRadius: 6,
                fontWeight: 700,
                fontSize: 15,
                cursor: "pointer"
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
