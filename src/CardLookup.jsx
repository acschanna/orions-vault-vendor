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
  const [edition, setEdition] = useState('unlimited');
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

  // --- Find TCGplayer link robustly ---
  const tcgplayerUrl =
    selectedCard?.tcgplayer?.url ||
    selectedCard?.tcgplayer?.productUrl ||
    selectedCard?.tcgplayer?.urls?.tcgplayer ||
    null;

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
                {/* --- TCGplayer Button (now SQUARE) --- */}
                {tcgplayerUrl && (
                  <div style={{ textAlign: "center", marginBottom: 12 }}>
                    <a
                      href={tcgplayerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-block",
                        border: "none",
                        background: "none",
                        cursor: "pointer",
                        padding: 0,
                      }}
                      title="View this card on TCGplayer"
                      onMouseOver={e => {
                        const img = e.currentTarget.firstChild;
                        img.style.boxShadow = "0 4px 16px #db7c24bb";
                        img.style.border = "2.5px solid #dba024";
                      }}
                      onMouseOut={e => {
                        const img = e.currentTarget.firstChild;
                        img.style.boxShadow = "0 2px 8px #0004";
                        img.style.border = "2px solid #db7c24";
                      }}
                    >
                      <img
                        src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAVoAAACRCAMAAAC114CHAAABX1BMVEX///8AAAAJaPbwLS3/vRT/5Yr/oKD/iAY8wU6m8KUAYvb/w4KDrPpOTk4AZPZ4ovlakfjs7Oz/uwD95eXvCwvCwsLe3t6IiIj//fZjY2P19fX/44FeXl7/gwDwICD/2Yf2kJCAgIAAXfY9fvfG2f0yv0aWtfpMh/irq6v/m5uX3J//vIKhoaHS0tI/Pz+QkJA0NDR1dXW0tLQcHBz/3XX/y0bvHBxra2vY2NhTU1OZmZkZGRnJyckAWfXxNzf/wX3o8P7vAAD+7u7/1F38iYn/0Vf/5tGd7J3/oUQtLS2nwvttmvn/8NHxQ0P/3JX/0nLyWlogcvb2YmL6gYH/xTCu4rT/8ub4cXFPxl7/lzD/zqf/rltm0nD/jxr/t2z/xJXb5/6vyvz/6Lj6vLz4qKj95ub/4aXB0/zF68rk9uZ00H//pldszXjD6seI4oz/3sKb3KK28bb/q2z70ND5s7PwngG2AAATjElEQVR4nO2d/V8TxxaHg7zEi6ImJbwEkrrY2KCBSAiEBARaoIoVRYkKFZRa762otb0v///n7tvMnjPvQzYJ3pvvT7iZnZ199uTMOWdmYyLRbZ0+uno9dt1+tNnt++q6Nm/MDLdDMzPXN7t9b93V6bXhS23S8KXNbt9dN7V5rV1gXV17ttnt++uibrTNZj0NX+/2/XVPpzPtJOuy3ez2HXZNt9tqtJcuzfza7Tvsmn5uM9rh292+w67pRjtnsUv/1862h7Zt6qFtm3po26Ye2rbJFO3wjEj68KKHVqtH34n0qIdWLjO0w6eS07XJXA+ths/P0vOf9dBiPX7SnAj+MkJ7f1PWUVbnbQnab/aH/t2BG+uuJt49HUin0xZoh29IO9OWICjaH5aX+w9+y3bgBrujicffNl2sAwMDNmhnTqUdakMEina0v78/vzy6P/RN+2+z43r57mnTxzpgh7YVo8VoPS2P7h389mMHbrdjcr1rmnK1Qys32qxuEhOg9Y03v//+f8N4XXNNI65WaK/JjfbRzLnQBsbbv/21G+/jJ0ssVju0M99J+9YbrRStZ7yj+edfbdgQBgMcVxu0176Xdm9gtCq0vmtYXv/6woYJibnaor0vN1o9WB3aAO8PX5PnDYIBKVcLtAqj/dXAaA3QBkHZ3lfhedXmaom2NU9riDbA23/BjXfiicy7ngttq0ZrjtbT8uj6+w4wOp9eNg2wWqCd+V16qVsmZO3Quhrdv6B+4eWAkiywZ0O0z6SX+t3IaK3R9uf3LibbJTXZncEtu0RXYbRGnlaFdn9oaF/I9lUHQFnrncYbDA5StkZor92SXsrQaBVoZ4eGZsU+4SKmEU/VRrs0GLE1QqvYVXTLdE1NgtZNxIZkZjvbAVS2UhttujoYsTVBqzLa+9dY2aFd98gObedFbPc7gMpWarTNwcGIrQlahdFe/57TM2GBUYI2f9NHOyT0COsdQGUrtT/YGgRsTdDKwwOhhDvzxGjzBwFZsUfYi5dKLNpRsp0iaAerTRO01vs37yvQ/h2h3Q7JDr0SeIT8dqxQ4tE/FGiDSYxqSo/W0mjVaIHV5vdmCVmhs13+LU4mMemlCu2UJdqZR5ZX/27GBG2+/9VQpFkR2guZMzRlXNMD1UFLtLZGmxX2wqDNr0Owwsg2/zxWJHHpW8Zsl4i2Bgct0Vob7XV9hJDfOxjCml3njXYoViRx6TFCm+aA2lit5aUl6RlAm9/fHmIlQnsRk7FEYgK7ger50c5YvoMg20YToX0+y4EVor2IoZcnHH41BUir1a2t6pQW7bDlhWWvn1G0vMWKfW3+IFYg8QmHX5zZegGtv27e3FKjtTVaaV2cohXZrChCuJChlyccfrGxbDPtl2x9uhqrtVtllb+NqkHLx7WjF259NySVYKIuGMxWXdYDS9Wq6xN2NNmY7dte358XLZ+NkdrMhPRiHdaL4/APHH6ldwDZNPznktpqN62uflvmDrRo9zh/QBbHTn6JAUvr+nBYKJwFfz5mIltIFqYNymls+KrV5U8Vm+o0aHl/EC7q/pnLHf0UE57z68Nx4fLlwovgHxPM1i4a2jbxpKZEe9/O36nK4mq0BxxaEnrdzSWTuU/dhXv2seCSvVwgHoFZaSAT2VYaOgc1WstN8lfl7kCHlvMHtOp1knSVy/3rZSyQzqOJOz5Yj23Iiql+NanRDgwao920GcKpqOClQnsz+ouLasm62MtcMhnAvRsTKUudUbAu2g/hoITh1xRjtCq0lkarXtrl0L7qX94jaJ9zaPvDqtcvIVoXbvJtF4KFF5cpWBftnfAoWjAnpcRqmkkfFGgVe5EEEldlZGi3113vuhzarSAVI1WvTxStC/fkz3h4GcsNCy5DHYbHYfhFTdVNgI3rtYrNB7x0i+YYbTBt5YnR8qlYGHpNnCShcg87OZ/5YQGSIPyKnICLdtAU7aVnp8bDEBdpZWjDgIA4BD9DQDPZMg29kpht54KFs88FliwNv6LFR+BerdBemrkl0jNBBVf7o0AQ7XYI8DkJavP92+/RyiNZy73LoO1YsBDGWyzaz+HHdIMMKNe6sZftAg4PnM9+9bsVIdo9Bu3Bvud0QRmBhl5HLFl/Prvb7vls4o4ILAi/wu1JqBDuTmNbraLlCwubBidFaGm9gKANJ7MILRt6uTPY0dEJgNve5BeFBRjtH+HA0hzZwcEoeYgRrcFvhEVoo3hgD6MFrjbsl4ReJ683rly5shHZcO6ofcECCAvcPw4Pj4+PDw+DfzDhF1MGX2KirzjQWr0mAotcGC1daKB7FB/mAo5XfG3AcKFtwcLHyGIPvzz4G9WDL8eHhUIhbPUkjQozAco0hh0D2k1lGsaiBUs1eZz00g9o1QuRfYinNHc+awdZGHABsIG+HOPwq7mFJq6dNCqMx4DWaLMiRQsqMfkDsdXi0Cske8IHC5/iJ/sX9LIsWc92SfUr2I7g1b0BzGY63YwTraJIK0ILktr8KzFaWPVKJjd8ssJYIfbZ7AySLXBW6ylsSatf6YGdKcB2YIDMbVWr30MQoTX8MUaKFqYGaB6j01j+Zti1hzP3RuQNiOKOwpDRFr6IzDb0CGB3OHQD7vTmWvLSzs5S0+r3EIRobTfcw6R2HaKlcS3ZgPCTV6p96JN9QwpgySM0l8Vtth/1aEXVL8C22kxTtYj2quFvMYo3gd4EaGnkkA+7fuvyPAkdbRhy+Sb8MEIbd6XxGEWxxyKH8M+wKXrFCUZd1SXPDzeXtqqtoRVunTNGm4ebEkiii6peG9AdvA4sGOQOcQcJuCBzCIz1mDjeByGwJwitaH9Sa9OYwQ8hKNHCEIH6g/8ELSdcdoGjfROA5L1u7Gg/4jQMoL1cCOE+EC0+MkXwONCa/zSrGC0IEWhQ9kNYBf8zlwvMNIgOwn8cwfksdofwAaFFzva4UPjs/8FVv9qC9neTZMEQLY0cotArJPs6l6TzGY4UcrFnZNhskbP9Uigceob7IGz6VFQPjwutQVVGg/aAN1oaeoUO4MqGT/Ekotw+o02w3vYBZuvDFoRf8aO1+eV23TRG8wVS9fopJBtGB28iypRsG7IxbLcFHCO4bN0jovArbrQmVRk12ij42qfh7jpxtRugdEAcLSL7ph1klbnul4B22HBHtIwzVd2qtox20+rXxYVoacoQVcNo1esKJIsTh4Ds2/aQTSReRGzDmYuxWz78Iminlrw9is1qi2jlW+eM0T7nyNLQ6yWMaI+ga2hTIiZhy9QRjj22ssXHKvn5tCCDOA9afyeYWVVGiZa86ghXdPOk6rXhZwe5aArDEW1b183/iNiyGdmhi5skZCD6ak5NbcH8rHo+tP47Oaqtc4Zo8/tBWWYPlhVI6PX2zZtPR2G9dgMmDh0gC+NbtpDwoBAtPuK9X3i3UvV8aK89e3TbDqwQ7XqwJQG9xUDeJp848moxycjPougg/niW1Vm0PMa6hGg7gvK3EfTvMkhAWf8HGQK0njuY3cfbO0ZB1SvpV7pIDAYWxk46sFx+dihjK90Nyqh6PrT24tHuvR+a5TZ7kQVHr+qVPDn6RMACR5s76siuRandHl8ufAzbqH8sZadraPtfPe9ndyRFC45ukrCxcYXqCJDt0K66iSgxQ/7W87ZhkydKtOeo18aFVvRaLql65UgJkasjPuwMWE+fCVuUlXmxbZiQsVvvLwxagZZp1cvzsw9fb3h6Dapd7Ulu9WyB4Xrz2F/B5xOyd6EvIFry2s2/yCyWPCGRQnCgLQvkcn0Euz2O/V0JD/yFCLIbVPkjPxcKLf0hn6RYnd8afgcWawquKwj+bRR+XSi0yzj04si2rWwg1wvh9i8Sfr38ahwC2fv5Voi2nWUDubwXxniRhGwprRBB257/Qzf6z3Tpfx6Ql2o02uslUNdeHzt78dcdVuE8lnj3rVxPwzaPrrZZ4W8D/bh9U67QH0zc5fVL99/L66mnnnrqqaeeeuqpp5566qkjWqkUy+OeSpXMXEraqFEbmfc1PVkrFzNjHR1j95UyEWifzTirfaxqJQZbqjTCNXJ1r7ESNRmbq5Qa5bKzMBmq5oyXG8W1FPrxmYXde1S7Daubof1kxYcFp5ATxoruyKgapVLRtaGxVDY4NzVX8T8fX6hN0sEvOOXKGDKzXRECVvSMlCNrUgR9zk3LuyLPYEzeZHWyGN3+JPxkXAl2bZ7pqExIoaMOOgl9VA+ONXjjCbW45n1el499vhEZGTscoQjaorxJJhqto+hplUBToPVUske7xvcyEn5UhgfvyU/ysYyprG3Oa6GwHFd1AtcG7biiSfSwFM+0r2+XtNKgpVSM0WZFphY+IWy2c+CsBfhBzTuyohzWmB4tvaoF2rKqCf0K15Q9zZui7Zu2RCsw2shCkVEAj4CZ+xOBelRGaPsalmgzyiYErcJneJo2RttXsUPrCDsJv0wpdDA6Cd1TXd4NVcoIbfDFMEcr9e2eiHmkVI36gMXo0fbZob0n7KMiAh/NCwjSHGfGnFYN0e5aoVWbI7FGlTv2RKcnA7RrNmglz7Qm+niSngWP+t5d6FYi7WbN0PqPyRitOkpbEIxVJGJFJmgdG7SSJ79IHBWar8hB5A/8J9lQD2met3WxytLvEaOUbuIkX3TNQw/Hz6N1vMjcYdKMXRu0whSlLwoH0PXIA4bBTBCSaL51ArQ1P6uoMRy93pzJGtEk/pAer01n+cc5suB3uRColhHYhnfd4hxUpkiTD4w2PDy2iI7aoIX3D4MUkjagyCX0CMhLBHfgoAGsjpexijxaYix4lkfBc4L5Nq/hz5hoNZMQinEvK+JWUrSJEnfUEC38umTgV5FGe+hrF1yv0se1c4TDYiREi09dxafi2RHDy2J7KiaEYuaSiriVLzFa7Ha8J2OIFt7XGLJQGnBDIMH4oblkBHymhZeSoYUPin0qKrTMrCO55opRK0GHZCD42Xh+0hDtLuoMJjfCiXOavRjJEh14uUnhpWRosUcwRzuHPptPiIUfXE3SirvRaCB8RmqGFvY2j8cR8YFG6tky9D7C+LcFtIu4vqZCi2Mb2S3iVDhI97KsVGjPa7WQ0iTTDW0EzcOLr4GlL5I2DjzTDi1CxBifCi2GVkqIhQYWODQ+mlGhPa+vZfxoFvqHqBoDzHYe86deA91BfQwrJbhahBZN9AsJJBVadEnZLMbEXhn+mXgSoSV1swp31AgtGjlr6zT8QmFECoaTtB7H3CcjkqVz6XGCq2QzEZQKLYYmm/pxZDxnjrbFuHaNPQs6iJGoHcgrStAfRKaCATEil0doVxc9sQUWZoDmaCVRLZMBrpijXfAW2hwmgVw1Rgu9ju/l0KwbTdbgEYyAJqtRTw43XMHl9YkukxTEjnbMHK1QC8Zooc34kyeqi4PvmLgQAqYORzUgY7TcXNRFqxWqYopWkLDCtBBMKeKaM+jKUQ3IFC2Pp3W02Ne2ipbvUoIWhT1BcFfmOgokqkZBG3NUAzJAu1ivieZ48whBNo3hxZu11tA2jNHCsCcMKNHEBkoZOATxtQqje4f/nL+8Au29hrDuoEKLw1OL4Ks4Uq/X0fxpiDZkZIAWjbteLLkqokId3L7Ae1u0ucFRDcnMIdQFcFVocU3RImXwhQpiZmjns8ZotUViWOHjS+YoJUV3MF/CIvO+ztfCJWM9WjyiMnduIGzbkTkgD2eElkI0QOuIuwCCdiS9Et+XUaKru54WLS7P1CXXxOXWqCZnifZeKRqbAVr9GhScG1izxXUUB35khHa84rqgBvYzC+wZrRcVM5JWWrTFYtlZqE3XFpxGZQ7drB6tbhG5j6nB4cSJ6dKBn9mUZ/AMzv6faRalcEn0xTwA6my1aOWbGPVoNTsfPO3CW+VXMoAc+JkR2ozoflg+KrTMst6qmAVrQMTva6cxQ7TCOjEOpsWCK0nYtzH25cDPjFYZCCdkPqwNKNGyxcGFYmbNVaZYLDbKzuR8hWfosSgXi6VxvK7WAtq++SJUYHEcR4HgvGuOVub3hGjRQFeZM5RodRFOEA6wK7oitYK2jz9LG3p5AtUvG7TzvvkArcjRYr/E+BklWp1xBF8B9b6wQLGhDaqs6Ou0OxIJtQUElWjt9yFkhN1a1Gu1+0rqRg/Akx1aR95RUJlG8ysM1hFbEH4p0drvnqGcUEOLVQbtRrNdLQkiO7SCpJ+owvcjpQRuFXsQBq3mayfY80U5oXmM2eKhRqsLcoJGBkGmHVrFE01xo0IRBEZoiFYzfsFORcoJF6LwHWnQaqKcsJHmG9Vni1a+YTowDHSbOAFHrSNXoXQImp3Xgv21lBP+fuHioA6tOncmc6JsXxuVJVppHuvXiPA2ezxmlHxGBQ2l1erMlt8VnhGfiZ2tFq1y/iRmkeLLdotjcDC2aGVP1H+Wc/wh8Wij8EuNVuNtFWjxo8TOVo82sSIvhUQrbSwKLy4D51mjFXv5cR4fk6xJdgqpHYKG7YoCLQ7q0WM2QOteuIarCcE9ORnYUwakX4tO8MbQItGqPdpEtsi5mdAKkaUwEQ/+hlLnp7Fa9zxF4pNRoMXFCeRss3UQcM/z9VyisUppvOa3na455VJljB9eqlKuTddr5SLPLGycmgcXG5G9jApOmyuW/YvWa06jVAoHnr0Hh8xawyS8BJ3iVtCVBWi9VzrLNdKg7tXjxssN/4XHYJwOvGj0bR1DHTf+C55aX3sDPOKvAAAAAElFTkSuQmCC"
                        alt="TCGplayer"
                        style={{
                          width: 100,
                          height: 50,
                          borderRadius: "8px", // square with slight rounding
                          boxShadow: "0 2px 8px #0004",
                          transition: "box-shadow .13s, border .13s",
                          border: "2px solid #db7c24",
                          background: "#fff",
                          objectFit: "contain",
                          display: "block"
                        }}
                      />
                    </a>
                  </div>
                )}

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
