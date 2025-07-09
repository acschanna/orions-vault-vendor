import React, { useState, useEffect } from "react";
import { useUser } from "./App";
import { db } from "./firebase";
import { collection, addDoc } from "firebase/firestore";
import "./cardlookup.css"; // Import the CSS file!

const accentGreen = "#00b84a";
const bgBlack = "#111314";
const cardDark = "#181b1e";
const fontFamily = `'Inter', Arial, Helvetica, sans-serif`;
const API_KEY = 'd49129a9-8f4c-4130-968a-cd47501df765';

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
  const [edition, setEdition] = useState('unlimited');
  const [tradeCondition, setTradeCondition] = useState('NM');
  const [tradeNotes, setTradeNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  function cardHasEditionOptions(card) {
    if (!card || !card.set || !SETS_WITH_EDITION.includes(card.set.id)) return false;
    const prices = card.tcgplayer?.prices;
    return prices && (prices["1stEdition"] || prices["1stEditionHolofoil"] || prices["1stEditionNormal"]);
  }

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
    <div className="card-lookup-root">
      <h2 className="card-lookup-title">Card Lookup</h2>
      <div className="card-lookup-controls">
        <label>
          <select
            value={searchType}
            onChange={e => setSearchType(e.target.value)}
            className="card-lookup-select"
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
        className="card-lookup-input"
        style={{ width: "60%" }}
        onKeyDown={e => {
          if (e.key === "Enter") {
            setPage(1);
            lookupCard(1);
          }
        }}
      />

        ) : setsLoading ? (
          <span style={{ color: accentGreen }}>Loading sets...</span>
        ) : (
          <>
            <select
              value={searchSet}
              onChange={e => setSearchSet(e.target.value)}
              className="card-lookup-select"
              style={{ width: "42%" }}
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
              className="card-lookup-input"
              style={{ width: "30%" }}
            />
          </>
        )}
        <button
          onClick={() => {
            setPage(1);
            lookupCard(1);
          }}
          className="card-lookup-button"
        >
          Lookup
        </button>
      </div>
      {loading && <div style={{ color: accentGreen }}>Loading...</div>}

      {/* Results grid for name search */}
      {searchType === 'name' && lookupResults.length > 0 && (
        <div>
          <div className="card-lookup-results">
            {lookupResults.map(card => (
              <div
                key={card.id}
                className="card-lookup-card"
              >
                <img
                  src={card.images.small}
                  alt={card.name}
                  className="card-lookup-card-image"
                />
                <div className="card-lookup-card-name">{card.name}</div>
                <div className="card-lookup-card-set">{card.set.name}</div>
                <div className="card-lookup-card-number">#{card.number}</div>
                <button
                  onClick={() => {
                    setSelectedCard(card);
                    setAcquisitionCost('');
                    setCondition('NM');
                    setEdition('unlimited');
                    setShowModal(true);
                  }}
                  className="card-lookup-card-viewbtn"
                >
                  View
                </button>
              </div>
            ))}
          </div>
          {/* Pagination */}
          <div className="card-lookup-pagination">
            <button
              onClick={prevPage}
              disabled={page === 1}
              className="card-lookup-pagination-btn"
            >
              Prev
            </button>
            <span style={{ fontWeight: "bold", color: "#fff" }}>Page {page}</span>
            <button
              onClick={nextPage}
              disabled={page * 20 >= totalCount}
              className="card-lookup-pagination-btn"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Pop-out modal for selected card */}
      {showModal && (
        <div
          className="card-lookup-modal-bg"
          onClick={() => {
            setShowModal(false);
            setShowAddToInventory(false);
            setShowAddToTrade(false);
          }}
        >
          <div
            className="card-lookup-modal"
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
                    className="card-lookup-modal-image"
                  />
                </div>
                <div className="card-lookup-modal-title">{selectedCard.name}</div>
                <div className="card-lookup-modal-set">
                  {selectedCard.set.name} &bull; #{selectedCard.number}
                </div>
                <div className="card-lookup-modal-rarity">
                  <b style={{ color: "#fff" }}>Rarity:</b> <span>{selectedCard.rarity || "N/A"}</span>
                </div>
                <div className="card-lookup-modal-price">
                  <b style={{ color: "#fff" }}>TCGPlayer Price:</b>{" "}
                  <span>
                    {(() => {
                      const p = cardHasEditionOptions(selectedCard)
                        ? (edition === "firstEdition"
                          ? (
                            selectedCard.tcgplayer?.prices?.["1stEdition"]?.market ??
                            selectedCard.tcgplayer?.prices?.["1stEditionHolofoil"]?.market ??
                            selectedCard.tcgplayer?.prices?.["1stEditionNormal"]?.market
                          )
                          : (
                            selectedCard.tcgplayer?.prices?.normal?.market ??
                            selectedCard.tcgplayer?.prices?.holofoil?.market ??
                            selectedCard.tcgplayer?.prices?.reverseHolofoil?.market
                          ))
                        : (
                          selectedCard.tcgplayer?.prices?.normal?.market ??
                          selectedCard.tcgplayer?.prices?.holofoil?.market ??
                          selectedCard.tcgplayer?.prices?.reverseHolofoil?.market
                        );
                      return (p ? p.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "N/A");
                    })()}
                  </span>
                </div>
                <div className="card-lookup-modal-btns">
                  <button
                    onClick={() => setShowAddToInventory(true)}
                    className="card-lookup-add-inv"
                  >
                    Add to Inventory
                  </button>
                  <button
                    onClick={() => setShowAddToTrade(true)}
                    className="card-lookup-add-trade"
                  >
                    Add to Trade
                  </button>
                </div>
                {showAddToInventory && (
                  <div className="card-lookup-modal-fields">
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
                      className="card-lookup-add-inv"
                      disabled={acquisitionCost === ""}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setShowAddToInventory(false)}
                      className="card-lookup-cancel-btn"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {showAddToTrade && (
                  <div className="card-lookup-modal-fields">
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
                      className="card-lookup-add-trade"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setShowAddToTrade(false)}
                      className="card-lookup-cancel-btn"
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
                    className="card-lookup-cancel-btn"
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
