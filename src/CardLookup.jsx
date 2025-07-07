import React, { useState, useEffect } from "react";
import { useUser } from "./App";
import { db } from "./firebase";
import { collection, addDoc } from "firebase/firestore";

const accentGreen = "#00b84a";
const bgBlack = "#111314";
const cardDark = "#181b1e";
const fontFamily = `'Inter', Arial, Helvetica, sans-serif`;
const API_KEY = 'd49129a9-8f4c-4130-968a-cd47501df765';

// List of sets that have 1st Edition AND Unlimited versions
const SETS_WITH_EDITION = [
  "base1", "base2", "jungle", "fossil", "teamrocket", "gymheroes", "gymchallenge",
  "neoGenesis", "neoDiscovery", "neoRevelation", "neoDestiny", "legendarycollection"
];

export default function CardLookup() {
  const user = useUser();
  const uid = user?.uid;

  // --- State ---
  const [sets, setSets] = useState([]);
  const [setsLoading, setSetsLoading] = useState(false);
  const [searchType, setSearchType] = useState('name');
  const [searchName, setSearchName] = useState('');
  const [searchSet, setSearchSet] = useState('');
  const [searchNumber, setSearchNumber] = useState('');
  const [lookupResults, setLookupResults] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showAddToInventory, setShowAddToInventory] = useState(false);
  const [showAddToTrade, setShowAddToTrade] = useState(false);
  const [acquisitionCost, setAcquisitionCost] = useState('');
  const [condition, setCondition] = useState('NM');
  const [edition, setEdition] = useState('unlimited'); // NEW
  const [tradeCondition, setTradeCondition] = useState('NM');
  const [tradeNotes, setTradeNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Helper: does this card/set support edition selection?
  function cardHasEditionOptions(card) {
    if (!card || !card.set || !SETS_WITH_EDITION.includes(card.set.id)) return false;
    const prices = card.tcgplayer?.prices;
    return prices && (prices["1stEdition"] || prices["1stEditionHolofoil"] || prices["1stEditionNormal"]);
  }

  // Fetch sets
  useEffect(() => {
    const fetchSets = async () => {
      setSetsLoading(true);
      try {
        const res = await fetch('https://api.pokemontcg.io/v2/sets', {
          headers: { 'X-Api-Key': API_KEY }
        });
        const data = await res.json();
        setSets(data.data.sort((a, b) => (b.releaseDate > a.releaseDate ? 1 : -1)));
      } catch {
        setSets([]);
      }
      setSetsLoading(false);
    };
    fetchSets();
  }, []);

  // Card lookup
  const lookupCard = async (curPage = 1) => {
    setLoading(true);
    setLookupResults([]);
    setSelectedCard(null);
    setShowModal(false);
    setTotalCount(0);
    let url = '';
    if (searchType === 'name') {
      url = `https://api.pokemontcg.io/v2/cards?q=name:"${encodeURIComponent(
        searchName
      )}"&page=${curPage}&pageSize=20`;
    } else {
      url = `https://api.pokemontcg.io/v2/cards?q=set.id:"${encodeURIComponent(
        searchSet
      )}"+number:"${encodeURIComponent(searchNumber)}"`;
    }

    try {
      const response = await fetch(url, {
        headers: { 'X-Api-Key': API_KEY }
      });
      const data = await response.json();
      if (searchType === 'name') {
        setLookupResults(data.data || []);
        setTotalCount(data.totalCount || 0);
      } else if (data.data && data.data.length > 0) {
        setSelectedCard(data.data[0]);
        setShowModal(true);
        setAcquisitionCost('');
        setCondition('NM');
        setEdition('unlimited');
        setTradeCondition('NM');
        setTradeNotes('');
      } else {
        setLookupResults([]);
        setSelectedCard({ notFound: true });
        setShowModal(true);
      }
    } catch {
      setLookupResults([]);
      setSelectedCard({ error: true });
      setShowModal(true);
    }
    setLoading(false);
  };

  // Pagination
  const nextPage = () => {
    if (page * 20 < totalCount) {
      const newPage = page + 1;
      setPage(newPage);
      lookupCard(newPage);
    }
  };
  const prevPage = () => {
    if (page > 1) {
      const newPage = page - 1;
      setPage(newPage);
      lookupCard(newPage);
    }
  };

  useEffect(() => {
    setPage(1);
    setLookupResults([]);
    setSelectedCard(null);
    setShowModal(false);
    setTotalCount(0);
  }, [searchType, searchName, searchSet, searchNumber]);

  // ----- CLOUD: Add to Inventory -----
  const handleAddToInventory = async () => {
    if (!uid) {
      alert("You must be logged in to add to inventory.");
      return;
    }
    // --- Pick price based on edition ---
    let price = 0;
    if (cardHasEditionOptions(selectedCard) && edition === "firstEdition") {
      price =
        selectedCard.tcgplayer?.prices?.["1stEdition"]?.market ??
        selectedCard.tcgplayer?.prices?.["1stEditionHolofoil"]?.market ??
        selectedCard.tcgplayer?.prices?.["1stEditionNormal"]?.market ??
        0;
    } else {
      price =
        selectedCard.tcgplayer?.prices?.normal?.market ??
        selectedCard.tcgplayer?.prices?.holofoil?.market ??
        selectedCard.tcgplayer?.prices?.reverseHolofoil?.market ??
        0;
    }
    try {
      await addDoc(collection(db, "users", uid, "inventory"), {
        setName: selectedCard.set.name,
        cardName: selectedCard.name,
        cardNumber: selectedCard.number,
        tcgPlayerId: selectedCard.id,
        edition: cardHasEditionOptions(selectedCard) ? edition : "unlimited",
        marketValue: price,
        acquisitionCost: parseFloat(acquisitionCost),
        condition,
        dateAdded: new Date().toISOString(),
      });
      setShowAddToInventory(false);
      setShowModal(false);
      setAcquisitionCost('');
      setCondition('NM');
      setEdition('unlimited');
      alert("Card added to inventory (cloud)!");
    } catch {
      alert("Failed to add to inventory.");
    }
  };

  // Add to Trade (still local for now)
  const handleAddToTrade = () => {
    const trade = JSON.parse(localStorage.getItem("currentTrade") || "[]");
    trade.push({
      id: selectedCard.id + "_" + Date.now(),
      setName: selectedCard.set.name,
      cardName: selectedCard.name,
      cardNumber: selectedCard.number,
      tcgPlayerId: selectedCard.id,
      edition: cardHasEditionOptions(selectedCard) ? edition : "unlimited",
      marketValue:
        cardHasEditionOptions(selectedCard) && edition === "firstEdition"
          ? (
            selectedCard.tcgplayer?.prices?.["1stEdition"]?.market ??
            selectedCard.tcgplayer?.prices?.["1stEditionHolofoil"]?.market ??
            selectedCard.tcgplayer?.prices?.["1stEditionNormal"]?.market ?? 0
          )
          : (
            selectedCard.tcgplayer?.prices?.normal?.market ??
            selectedCard.tcgplayer?.prices?.holofoil?.market ??
            selectedCard.tcgplayer?.prices?.reverseHolofoil?.market ?? 0
          ),
      condition: tradeCondition,
      notes: tradeNotes,
      dateAdded: new Date().toISOString(),
    });
    localStorage.setItem("currentTrade", JSON.stringify(trade));
    setShowAddToTrade(false);
    setShowModal(false);
    setTradeCondition('NM');
    setEdition('unlimited');
    setTradeNotes('');
    alert("Card added to current trade!");
  };

  // --- UI ---
  return (
    <div>
      <h2 style={{ color: accentGreen, marginTop: 0, fontWeight: 700 }}>Card Lookup</h2>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", flexWrap: "wrap" }}>
        <label>
          <select
            value={searchType}
            onChange={e => setSearchType(e.target.value)}
            style={{
              marginRight: 12,
              padding: 7,
              borderRadius: 4,
              border: `1px solid #444`,
              background: cardDark,
              color: "#fff",
              minWidth: 128,
              fontFamily
            }}
          >
            <option value="name">Search by Name</option>
            <option value="number">Search by Set & Number</option>
          </select>
        </label>
        {searchType === "name" ? (
          <input
            placeholder="Card Name (e.g., Charizard)"
            value={searchName}
            onChange={e => setSearchName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                setPage(1);
                lookupCard(1);
              }
            }}
            style={{
              marginRight: 12,
              padding: 7,
              borderRadius: 4,
              border: `1px solid #333`,
              background: bgBlack,
              color: "#fff",
              width: "60%",
              fontFamily
            }}
          />
        ) : setsLoading ? (
          <span style={{ color: accentGreen }}>Loading sets...</span>
        ) : (
          <>
            <select
              value={searchSet}
              onChange={e => setSearchSet(e.target.value)}
              style={{
                marginRight: 8,
                padding: 7,
                borderRadius: 4,
                border: `1px solid #333`,
                background: bgBlack,
                color: "#fff",
                width: "42%",
                fontFamily
              }}
            >
              <option value="">Select Set</option>
              {sets.map(set => (
                <option key={set.id} value={set.id}>
                  {set.name} [{set.id}]
                </option>
              ))}
            </select>
            {searchSet && sets.find(s => s.id === searchSet)?.images?.symbol && (
              <img
                src={sets.find(s => s.id === searchSet).images.symbol}
                alt="Set Symbol"
                style={{ width: 26, verticalAlign: "middle", marginRight: 10, background: "#181b1e", borderRadius: 5, border: "1px solid #222", padding: 2 }}
              />
            )}
            <input
              placeholder="Card Number (e.g., 4, 102/102)"
              value={searchNumber}
              onChange={e => setSearchNumber(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  setPage(1);
                  lookupCard(1);
                }
              }}
              style={{
                marginRight: 8,
                padding: 7,
                borderRadius: 4,
                border: `1px solid #333`,
                background: bgBlack,
                color: "#fff",
                width: "30%",
                fontFamily
              }}
            />
          </>
        )}
        <button
          onClick={() => {
            setPage(1);
            lookupCard(1);
          }}
          style={{
            background: accentGreen,
            color: "#121314",
            padding: "8px 18px",
            border: "none",
            borderRadius: 7,
            fontWeight: 700,
            fontFamily,
            cursor: "pointer",
            fontSize: 17,
            marginLeft: 10,
            transition: "background .15s"
          }}
        >
          Lookup
        </button>
      </div>
      {loading && <div style={{ color: accentGreen }}>Loading...</div>}

      {/* Results grid for name search */}
      {searchType === 'name' && lookupResults.length > 0 && (
        <div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
            marginTop: 15,
            marginBottom: 10
          }}>
            {lookupResults.map(card => (
              <div
                key={card.id}
                style={{
                  background: cardDark,
                  border: `1.5px solid #232`,
                  borderRadius: 10,
                  padding: 12,
                  boxShadow: "0 1px 5px #121b1277",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center"
                }}
              >
                <img
                  src={card.images.small}
                  alt={card.name}
                  style={{ width: 90, marginBottom: 8, borderRadius: 5, background: "#223" }}
                />
                <div style={{ fontWeight: 600, fontSize: 15, textAlign: "center", color: "#fff" }}>{card.name}</div>
                <div style={{ fontSize: 13, color: accentGreen, margin: "2px 0" }}>{card.set.name}</div>
                <div style={{ fontSize: 13, color: "#bfffd7" }}>#{card.number}</div>
                <button
                  onClick={() => {
                    setSelectedCard(card);
                    setAcquisitionCost('');
                    setCondition('NM');
                    setEdition('unlimited');
                    setShowModal(true);
                  }}
                  style={{
                    marginTop: 8,
                    background: accentGreen,
                    color: "#181b1e",
                    padding: "4px 13px",
                    border: "none",
                    borderRadius: 6,
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  View
                </button>
              </div>
            ))}
          </div>
          {/* Pagination */}
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <button
              onClick={prevPage}
              disabled={page === 1}
              style={{
                marginRight: 8,
                padding: "5px 12px",
                borderRadius: 6,
                border: `1px solid #444`,
                background: page === 1 ? "#1a1f1b" : cardDark,
                color: page === 1 ? "#444" : "#fff",
                cursor: page === 1 ? "not-allowed" : "pointer"
              }}
            >
              Prev
            </button>
            <span style={{ fontWeight: "bold", color: "#fff" }}>Page {page}</span>
            <button
              onClick={nextPage}
              disabled={page * 20 >= totalCount}
              style={{
                marginLeft: 8,
                padding: "5px 12px",
                borderRadius: 6,
                border: `1px solid #444`,
                background: page * 20 >= totalCount ? "#1a1f1b" : cardDark,
                color: page * 20 >= totalCount ? "#444" : "#fff",
                cursor: page * 20 >= totalCount ? "not-allowed" : "pointer"
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Pop-out modal for selected card */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(10,25,12,0.96)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
          onClick={() => {
            setShowModal(false);
            setShowAddToInventory(false);
            setShowAddToTrade(false);
          }}
        >
          <div
            style={{
              background: cardDark,
              borderRadius: 14,
              boxShadow: `0 8px 50px #00b84a13`,
              padding: 32,
              minWidth: 340,
              maxWidth: 420,
              position: "relative",
              color: "#fff",
              border: `1.5px solid ${accentGreen}`
            }}
            onClick={e => e.stopPropagation()}
          >
            {selectedCard?.error && <div style={{ color: "crimson" }}>Error fetching data.</div>}
            {selectedCard?.notFound && <div>No card found.</div>}
            {selectedCard?.name && (
              <>
                <div style={{ textAlign: "center" }}>
                  <img
                    src={selectedCard.images.large || selectedCard.images.small}
                    alt={selectedCard.name}
                    style={{
                      width: "88%",
                      maxWidth: 260,
                      borderRadius: 12,
                      background: "#161b22",
                      marginBottom: 14,
                      boxShadow: `0 4px 24px #00b84a11`
                    }}
                  />
                </div>
                <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 4, textAlign: "center", color: "#fff" }}>
                  {selectedCard.name}
                </div>
                <div style={{ textAlign: "center", color: accentGreen, marginBottom: 8 }}>
                  {selectedCard.set.name} &bull; #{selectedCard.number}
                </div>
                <div style={{ textAlign: "center", marginBottom: 8 }}>
                  <b style={{ color: "#fff" }}>Rarity:</b> <span>{selectedCard.rarity || "N/A"}</span>
                </div>
                <div style={{ textAlign: "center", marginBottom: 8 }}>
                  <b style={{ color: "#fff" }}>TCGPlayer Price:</b>{" "}
                  <span style={{ color: accentGreen }}>
                    {cardHasEditionOptions(selectedCard) ? (
                      edition === "firstEdition"
                        ? (
                          selectedCard.tcgplayer?.prices?.["1stEdition"]?.market ??
                          selectedCard.tcgplayer?.prices?.["1stEditionHolofoil"]?.market ??
                          selectedCard.tcgplayer?.prices?.["1stEditionNormal"]?.market
                        )
                        : (
                          selectedCard.tcgplayer?.prices?.normal?.market ??
                          selectedCard.tcgplayer?.prices?.holofoil?.market ??
                          selectedCard.tcgplayer?.prices?.reverseHolofoil?.market
                        )
                    )?.toLocaleString("en-US", { style: "currency", currency: "USD" }) || 'N/A'
                    : (
                      selectedCard.tcgplayer?.prices?.normal?.market ??
                      selectedCard.tcgplayer?.prices?.holofoil?.market ??
                      selectedCard.tcgplayer?.prices?.reverseHolofoil?.market
                    )?.toLocaleString("en-US", { style: "currency", currency: "USD" }) || 'N/A'}
                  </span>
                </div>
                <div style={{ textAlign: "center", marginBottom: 12 }}>
                  <button
                    onClick={() => setShowAddToInventory(true)}
                    style={{
                      background: accentGreen,
                      color: "#181b1e",
                      padding: "8px 20px",
                      border: "none",
                      borderRadius: 7,
                      fontWeight: 700,
                      fontFamily,
                      cursor: "pointer",
                      fontSize: 17,
                      marginRight: 12
                    }}
                  >
                    Add to Inventory
                  </button>
                  <button
                    onClick={() => setShowAddToTrade(true)}
                    style={{
                      background: "#198c47",
                      color: "#fff",
                      padding: "8px 20px",
                      border: "none",
                      borderRadius: 7,
                      fontWeight: 700,
                      fontFamily,
                      cursor: "pointer",
                      fontSize: 17
                    }}
                  >
                    Add to Trade
                  </button>
                </div>
                {showAddToInventory && (
                  <div style={{ background: "#223", padding: 12, borderRadius: 7, marginBottom: 10 }}>
                    <label style={{ color: "#fff" }}>
                      Condition:&nbsp;
                      <select value={condition} onChange={e => setCondition(e.target.value)} style={{marginRight:10}}>
                        <option value="NM">Near Mint (NM)</option>
                        <option value="LP">Light Play (LP)</option>
                        <option value="MP">Moderate Play (MP)</option>
                        <option value="HP">Heavy Play (HP)</option>
                        <option value="DMG">Damaged</option>
                      </select>
                    </label>
                    {cardHasEditionOptions(selectedCard) && (
                      <label style={{ color: "#fff", marginLeft: 10 }}>
                        Edition:&nbsp;
                        <select value={edition} onChange={e => setEdition(e.target.value)}>
                          <option value="unlimited">Unlimited</option>
                          <option value="firstEdition">1st Edition</option>
                        </select>
                      </label>
                    )}
                    <label style={{ color: "#fff" }}>
                      Acquisition Cost:&nbsp;
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={acquisitionCost}
                        onChange={e => setAcquisitionCost(e.target.value)}
                        style={{ width: 90, marginLeft: 5, marginRight: 10 }}
                      />
                    </label>
                    <button
                      onClick={handleAddToInventory}
                      style={{
                        background: accentGreen,
                        color: "#181b1e",
                        padding: "6px 14px",
                        border: "none",
                        borderRadius: 6,
                        fontWeight: 700,
                        cursor: "pointer"
                      }}
                      disabled={acquisitionCost === ""}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setShowAddToInventory(false)}
                      style={{
                        marginLeft: 10,
                        background: "#23262a",
                        color: "#fff",
                        padding: "6px 14px",
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
                {showAddToTrade && (
                  <div style={{ background: "#224", padding: 12, borderRadius: 7, marginBottom: 10 }}>
                    <label style={{ color: "#fff" }}>
                      Condition:&nbsp;
                      <select value={tradeCondition} onChange={e => setTradeCondition(e.target.value)} style={{ marginRight: 10 }}>
                        <option value="NM">Near Mint (NM)</option>
                        <option value="LP">Light Play (LP)</option>
                        <option value="MP">Moderate Play (MP)</option>
                        <option value="HP">Heavy Play (HP)</option>
                        <option value="DMG">Damaged</option>
                      </select>
                    </label>
                    {cardHasEditionOptions(selectedCard) && (
                      <label style={{ color: "#fff", marginLeft: 10 }}>
                        Edition:&nbsp;
                        <select value={edition} onChange={e => setEdition(e.target.value)}>
                          <option value="unlimited">Unlimited</option>
                          <option value="firstEdition">1st Edition</option>
                        </select>
                      </label>
                    )}
                    <label style={{ color: "#fff" }}>
                      Notes:&nbsp;
                      <input
                        type="text"
                        value={tradeNotes}
                        onChange={e => setTradeNotes(e.target.value)}
                        placeholder="(Optional: e.g. wants, extra info)"
                        style={{ width: 180, marginLeft: 5, marginRight: 10 }}
                      />
                    </label>
                    <button
                      onClick={handleAddToTrade}
                      style={{
                        background: "#198c47",
                        color: "#fff",
                        padding: "6px 14px",
                        border: "none",
                        borderRadius: 6,
                        fontWeight: 700,
                        cursor: "pointer"
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setShowAddToTrade(false)}
                      style={{
                        marginLeft: 10,
                        background: "#23262a",
                        color: "#fff",
                        padding: "6px 14px",
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
                <div style={{ textAlign: "center" }}>
                  <button
                    onClick={() => {
                      setShowModal(false);
                      setShowAddToInventory(false);
                      setShowAddToTrade(false);
                    }}
                    style={{
                      background: "#23262a",
                      color: "#fff",
                      padding: "9px 22px",
                      border: `1.5px solid #444`,
                      borderRadius: 7,
                      fontWeight: 700,
                      fontSize: 16,
                      cursor: "pointer",
                      fontFamily
                    }}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
