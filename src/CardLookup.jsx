import React, { useState, useEffect } from "react";
import { useUser } from "./App";
import { db } from "./firebase";
import { collection, addDoc } from "firebase/firestore";
import "./cardlookup.css";

const accentGreen = "#00b84a";
const cardDark = "#181b1e";
const API_KEY = "d49129a9-8f4c-4130-968a-cd47501df765";

const SETS_WITH_EDITION = [
  "base1","base2","jungle","fossil","teamrocket",
  "gymheroes","gymchallenge","neoGenesis","neoDiscovery",
  "neoRevelation","neoDestiny","legendarycollection"
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

export default function CardLookup() {
  const user = useUser();
  const uid = user?.uid;

  const [searchType, setSearchType] = useState("name");
  const [searchName, setSearchName] = useState("");
  const [searchNumber, setSearchNumber] = useState("");
  const [searchSetTotal, setSearchSetTotal] = useState("");
  const [lookupResults, setLookupResults] = useState([]);
  const [allNumberResults, setAllNumberResults] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showAddToInventory, setShowAddToInventory] = useState(false);
  const [showAddToTrade, setShowAddToTrade] = useState(false);
  const [acquisitionCost, setAcquisitionCost] = useState("");
  const [condition, setCondition] = useState("NM");
  const [edition, setEdition] = useState("unlimited");
  const [tradeCondition, setTradeCondition] = useState("NM");
  const [tradeNotes, setTradeNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 20;

  // Search function
  const lookupCard = async (curPage = 1) => {
    setLoading(true);
    setLookupResults([]);
    setSelectedCard(null);
    setShowModal(false);
    setTotalCount(0);

    let url;

    if (searchType === "name") {
      url = `https://api.pokemontcg.io/v2/cards?q=name:"${encodeURIComponent(
        searchName
      )}"&page=${curPage}&pageSize=${PAGE_SIZE}`;
      try {
        const response = await fetch(url, { headers: { "X-Api-Key": API_KEY } });
        const data = await response.json();
        setLookupResults(data.data || []);
        setTotalCount(data.totalCount || 0);
        setAllNumberResults([]);
      } catch {
        setLookupResults([]);
        setTotalCount(0);
        setAllNumberResults([]);
      }
      setLoading(false);

    } else if (searchType === "number") {
      if (!searchNumber) {
        setLoading(false);
        return;
      }
      url = `https://api.pokemontcg.io/v2/cards?q=number:"${encodeURIComponent(
        searchNumber
      )}"&page=1&pageSize=250`;
      try {
        const response = await fetch(url, { headers: { "X-Api-Key": API_KEY } });
        const data = await response.json();
        setAllNumberResults(data.data || []);
        setLookupResults((data.data || []).slice(0, PAGE_SIZE));
        setTotalCount((data.data || []).length);
      } catch {
        setLookupResults([]);
        setTotalCount(0);
        setAllNumberResults([]);
      }
      setLoading(false);

    } else if (searchType === "numberSetTotal") {
      if (!searchNumber || !searchSetTotal) {
        setLoading(false);
        return;
      }
      url = `https://api.pokemontcg.io/v2/cards?q=number:"${encodeURIComponent(
        searchNumber
      )}"&page=1&pageSize=250`;
      try {
        const response = await fetch(url, { headers: { "X-Api-Key": API_KEY } });
        const data = await response.json();
        // Now filter locally for set.printedTotal
        const filtered = (data.data || []).filter(card =>
          card.set && String(card.set.printedTotal) === String(searchSetTotal)
        );
        setLookupResults(filtered.slice(0, PAGE_SIZE));
        setTotalCount(filtered.length);
        setAllNumberResults(filtered);
      } catch {
        setLookupResults([]);
        setTotalCount(0);
        setAllNumberResults([]);
      }
      setLoading(false);
    }
  };

  // Local paging for number or numberSetTotal search
  useEffect(() => {
    if (
      (searchType === "number" && allNumberResults.length > 0) ||
      (searchType === "numberSetTotal" && allNumberResults.length > 0)
    ) {
      setLookupResults(allNumberResults.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE));
      setTotalCount(allNumberResults.length);
    }
    // eslint-disable-next-line
  }, [page, allNumberResults]);

  const nextPage = () => {
    if (page * PAGE_SIZE < totalCount) {
      setPage(page + 1);
      if (searchType === "name") lookupCard(page + 1);
    }
  };
  const prevPage = () => {
    if (page > 1) {
      setPage(page - 1);
      if (searchType === "name") lookupCard(page - 1);
    }
  };

  // Reset search on input change
  useEffect(() => {
    setPage(1);
    setLookupResults([]);
    setSelectedCard(null);
    setShowModal(false);
    setTotalCount(0);
    setAllNumberResults([]);
    // eslint-disable-next-line
  }, [searchType, searchName, searchNumber, searchSetTotal]);

  const handleAddToInventory = async () => {
    if (!uid) {
      alert("You must be logged in to add to inventory.");
      return;
    }
    let price = 0;
    if (cardHasEditionOptions(selectedCard) && edition === "firstEdition") {
      price =
        selectedCard.tcgplayer?.prices?.["1stEdition"]?.market ||
        selectedCard.tcgplayer?.prices?.["1stEditionHolofoil"]?.market ||
        selectedCard.tcgplayer?.prices?.["1stEditionNormal"]?.market ||
        0;
    } else {
      price =
        selectedCard.tcgplayer?.prices?.normal?.market ||
        selectedCard.tcgplayer?.prices?.holofoil?.market ||
        selectedCard.tcgplayer?.prices?.reverseHolofoil?.market ||
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
      alert("Card added to inventory!");
    } catch {
      alert("Failed to add to inventory.");
    }
  };

  const handleAddToTrade = () => {
    const trade = JSON.parse(localStorage.getItem("currentTrade") || "[]");
    const price =
      cardHasEditionOptions(selectedCard) && edition === "firstEdition"
        ? selectedCard.tcgplayer?.prices?.["1stEdition"]?.market ||
          selectedCard.tcgplayer?.prices?.["1stEditionHolofoil"]?.market ||
          selectedCard.tcgplayer?.prices?.["1stEditionNormal"]?.market ||
          0
        : selectedCard.tcgplayer?.prices?.normal?.market ||
          selectedCard.tcgplayer?.prices?.holofoil?.market ||
          selectedCard.tcgplayer?.prices?.reverseHolofoil?.market ||
          0;
    trade.push({
      id: `${selectedCard.id}_${Date.now()}`,
      setName: selectedCard.set.name,
      cardName: selectedCard.name,
      cardNumber: selectedCard.number,
      tcgPlayerId: selectedCard.id,
      edition: cardHasEditionOptions(selectedCard) ? edition : "unlimited",
      marketValue: price,
      condition: tradeCondition,
      notes: tradeNotes,
      dateAdded: new Date().toISOString(),
    });
    localStorage.setItem("currentTrade", JSON.stringify(trade));
    setShowAddToTrade(false);
    setShowModal(false);
    alert("Card added to current trade!");
  };

  return (
    <div className="card-lookup-root">
      <h2 className="card-lookup-title">Card Lookup</h2>

      <div className="card-lookup-controls">
        <select
          value={searchType}
          onChange={(e) => setSearchType(e.target.value)}
          className="card-lookup-select"
        >
          <option value="name">Search by Name</option>
          <option value="number">Search by Number</option>
          <option value="numberSetTotal">Search by Number + Set Total</option>
        </select>
        {searchType === "name" && (
          <input
            className="card-lookup-input"
            placeholder="Card Name (e.g., Charizard)"
            value={searchName}
            onChange={e => setSearchName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && lookupCard(1)}
            style={{ width: "60%" }}
          />
        )}
        {searchType === "number" && (
          <input
            className="card-lookup-input"
            placeholder="Card Number (e.g., 4)"
            value={searchNumber}
            onChange={e => setSearchNumber(e.target.value)}
            onKeyDown={e => e.key === "Enter" && lookupCard(1)}
            style={{ width: "60%" }}
          />
        )}
        {searchType === "numberSetTotal" && (
          <>
            <input
              className="card-lookup-input"
              placeholder="Card Number (e.g., 4)"
              value={searchNumber}
              onChange={e => setSearchNumber(e.target.value)}
              onKeyDown={e => e.key === "Enter" && lookupCard(1)}
              style={{ width: "42%" }}
            />
            <span style={{margin:"0 4px", fontWeight:600}}>/</span>
            <input
              className="card-lookup-input"
              placeholder="Set Total (e.g., 102)"
              value={searchSetTotal}
              onChange={e => setSearchSetTotal(e.target.value)}
              onKeyDown={e => e.key === "Enter" && lookupCard(1)}
              style={{ width: "42%" }}
            />
          </>
        )}
        <button
          className="card-lookup-button"
          onClick={() => {
            setPage(1);
            lookupCard(1);
          }}
        >
          Lookup
        </button>
      </div>

      {loading && <div style={{ color: accentGreen }}>Loading...</div>}

      {lookupResults.length > 0 && (
        <>
          <div className="card-lookup-results">
            {lookupResults.map((card) => (
              <div key={card.id} className="card-lookup-card">
                <img
                  src={card.images.small}
                  alt={card.name}
                  className="card-lookup-card-image"
                />
                <div className="card-lookup-card-name">{card.name}</div>
                <div className="card-lookup-card-set">{card.set.name}</div>
                {/* Card number and set total */}
                <div className="card-lookup-card-number" style={{fontWeight:600, fontSize:18, color:'#00b84a', letterSpacing:"1px"}}>
                  #{card.number}
                  {card.set && typeof card.set.printedTotal === "number" && card.set.printedTotal > 0
                    ? `/${card.set.printedTotal}`
                    : "/???"}
                </div>
                <button
                  className="card-lookup-card-viewbtn"
                  onClick={() => {
                    setSelectedCard(card);
                    setAcquisitionCost("");
                    setCondition("NM");
                    setEdition("unlimited");
                    setTradeCondition("NM");
                    setTradeNotes("");
                    setShowModal(true);
                  }}
                >
                  View
                </button>
              </div>
            ))}
          </div>
          <div className="card-lookup-pagination">
            <button
              className="card-lookup-pagination-btn"
              onClick={prevPage}
              disabled={page === 1}
            >
              Prev
            </button>
            <span style={{ color: "#fff", fontWeight: "bold" }}>
              Page {page}
            </span>
            <button
              className="card-lookup-pagination-btn"
              onClick={nextPage}
              disabled={page * PAGE_SIZE >= totalCount}
            >
              Next
            </button>
          </div>
        </>
      )}

      {showModal && selectedCard && (
        <div
          className="card-lookup-modal-bg"
          onClick={() => {
            setShowModal(false);
            setShowAddToInventory(false);
            setShowAddToTrade(false);
          }}
        >
          <div className="card-lookup-modal" onClick={e => e.stopPropagation()}>
            {selectedCard.error && (
              <div style={{ color: "crimson" }}>Error fetching data.</div>
            )}
            {selectedCard.notFound && <div>No card found.</div>}
            {selectedCard.name && (
              <>
                <div style={{ textAlign: "center" }}>
                  <img
                    src={selectedCard.images.large || selectedCard.images.small}
                    alt={selectedCard.name}
                    className="card-lookup-modal-image"
                  />
                </div>
                <a
                  href={
                    selectedCard.tcgplayer?.url ||
                    `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(
                      selectedCard.name
                    )}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="tcgplayer-link-btn"
                >
                  <img
                    src="/tcgplayer-icon.png"
                    alt="View on TCGPlayer"
                    className="tcgplayer-icon"
                  />
                </a>
                <div className="card-lookup-modal-title">{selectedCard.name}</div>
                <div className="card-lookup-modal-set">
                  {selectedCard.set.name}
                  {" • "}
                  <b>
                    {selectedCard.number}
                    {selectedCard.set && typeof selectedCard.set.printedTotal === "number" && selectedCard.set.printedTotal > 0
                      ? `/${selectedCard.set.printedTotal}`
                      : "/???"}
                  </b>
                </div>
                <div className="card-lookup-modal-rarity">
                  <b style={{ color: "#fff" }}>Rarity:</b>{" "}
                  <span>{selectedCard.rarity || "N/A"}</span>
                </div>
                <div className="card-lookup-modal-price">
                  <b style={{ color: "#fff" }}>TCGPlayer Price:</b>{" "}
                  <span>
                    {(() => {
                      const p =
                        cardHasEditionOptions(selectedCard) &&
                        edition === "firstEdition"
                          ? selectedCard.tcgplayer?.prices?.["1stEdition"]?.market ||
                            selectedCard.tcgplayer?.prices?.["1stEditionHolofoil"]?.market ||
                            selectedCard.tcgplayer?.prices?.["1stEditionNormal"]?.market ||
                            0
                          : selectedCard.tcgplayer?.prices?.normal?.market ||
                            selectedCard.tcgplayer?.prices?.holofoil?.market ||
                            selectedCard.tcgplayer?.prices?.reverseHolofoil?.market ||
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
                <div className="card-lookup-modal-btns">
                  <button
                    className="card-lookup-add-inv"
                    onClick={() => setShowAddToInventory(true)}
                  >
                    Add to Inventory
                  </button>
                  <button
                    className="card-lookup-add-trade"
                    onClick={() => setShowAddToTrade(true)}
                  >
                    Add to Trade
                  </button>
                </div>
                {showAddToInventory && (
                  <div className="card-lookup-modal-fields">
                    <label style={{ color: "#fff" }}>
                      Condition:&nbsp;
                      <select
                        value={condition}
                        onChange={(e) => setCondition(e.target.value)}
                        style={{ marginRight: 10 }}
                      >
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
                        <select
                          value={edition}
                          onChange={(e) => setEdition(e.target.value)}
                        >
                          <option value="unlimited">Unlimited</option>
                          <option value="firstEdition">1st Edition</option>
                        </select>
                      </label>
                    )}
                    <label style={{ color: "#fff", marginLeft: 10 }}>
                      Acquisition Cost:&nbsp;
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={acquisitionCost}
                        onChange={(e) => setAcquisitionCost(e.target.value)}
                        style={{ width: 90 }}
                      />
                    </label>
                    <button
                      className="card-lookup-add-inv"
                      onClick={handleAddToInventory}
                      disabled={acquisitionCost === ""}
                    >
                      Save
                    </button>
                    <button
                      className="card-lookup-cancel-btn"
                      onClick={() => setShowAddToInventory(false)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {showAddToTrade && (
                  <div className="card-lookup-modal-fields">
                    <label style={{ color: "#fff" }}>
                      Condition:&nbsp;
                      <select
                        value={tradeCondition}
                        onChange={(e) => setTradeCondition(e.target.value)}
                        style={{ marginRight: 10 }}
                      >
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
                        <select
                          value={edition}
                          onChange={(e) => setEdition(e.target.value)}
                        >
                          <option value="unlimited">Unlimited</option>
                          <option value="firstEdition">1st Edition</option>
                        </select>
                      </label>
                    )}
                    <label style={{ color: "#fff", marginLeft: 10 }}>
                      Notes:&nbsp;
                      <input
                        type="text"
                        value={tradeNotes}
                        onChange={(e) => setTradeNotes(e.target.value)}
                        placeholder="(Optional)"
                        style={{ width: 180 }}
                      />
                    </label>
                    <button
                      className="card-lookup-add-trade"
                      onClick={handleAddToTrade}
                    >
                      Save
                    </button>
                    <button
                      className="card-lookup-cancel-btn"
                      onClick={() => setShowAddToTrade(false)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
                <div style={{ textAlign: "center", marginTop: 16 }}>
                  <button
                    className="card-lookup-cancel-btn"
                    onClick={() => {
                      setShowModal(false);
                      setShowAddToInventory(false);
                      setShowAddToTrade(false);
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
