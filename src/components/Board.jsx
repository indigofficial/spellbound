import React, { useEffect, useState } from "react";
import { doc, updateDoc, runTransaction } from "firebase/firestore";
import { db } from "../../firebase";
import Tile from "./Tile";
import SwapModal from "./SwapModal";
import {
  getLetterValues,
  getMaxRounds,
  getTurnDuration,
  getRandomLetter,
  areTilesAdjacent,
} from "./Utils";

function Board({ room, player, amICurrent, socket, livePreview, shuffleTrigger }) {
  // TODO: Get rid of the duplicating constants
  const MAX_TOKENS = 10;
  const MAX_ROUNDS = getMaxRounds();
  const TURN_DURATION = getTurnDuration();

  const [tiles, setTiles] = useState(room.grid || []);
  const [selectedTiles, setSelectedTiles] = useState([]);

  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  
  const [swappingTileId, setSwappingTileId] = useState(null); 
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [swapTargetTile, setSwapTargetTile] = useState(null);

  const [currentWord, setCurrentWord] = useState("");
  const [currentPoints, setCurrentPoints] = useState(0);

  const [errorMessage, setErrorMessage] = useState(null);

  const currentPlayer = player || room.players.find((p) => p.id === localStorage.getItem("playerId"));
  const currentTurnPlayer = room.players[room.turnIndex || 0];
  const isMyTurn = currentTurnPlayer?.id === currentPlayer.id;

  if (!currentPlayer) return <div>Loading player...</div>;

  // Update grid
  useEffect(() => {
    if (!room.grid) return;
    setTiles(room.grid);
  }, [room.grid]);

  // TODO: Rid of animation logic, doesn't even work
  useEffect(() => {
    if (!shuffleTrigger) return;

    setIsShuffling(true);

    const timeout = setTimeout(() => {
      setIsShuffling(false);
    }, 300);

    return () => clearTimeout(timeout);
  }, [shuffleTrigger]);

  // Reset submission state
  useEffect(() => {
    if (isMyTurn) {
      setHasSubmitted(false);
      setSelectedTiles([]);
      setCurrentWord("");
      setCurrentPoints(0);
      setIsDragging(false);
    }
  }, [room.turnIndex, isMyTurn]);

  // Advance turn
  useEffect(() => {
    if (!isMyTurn || isAnimating) return;

    const timer = setTimeout(async () => {
      try {
        await runTransaction(db, async (tx) => {
          const roomRef = doc(db, "rooms", room.id);

          const snap = await tx.get(roomRef);
          if (!snap.exists()) throw new Error("Room missing");

          const data = snap.data();
          const players = data.players || [];

          let nextTurn = (data.turnIndex || 0) + 1;
          let nextRound = data.round || 1;
          const maxRounds = data.maxRounds || MAX_ROUNDS;

          if (nextTurn >= players.length) {
            nextTurn = 0;
            nextRound += 1;

            // If nextRound exceeds maxRounds, game is finished
            if (nextRound > maxRounds) {
              players.forEach((p) => {
                p.score = (p.score || 0) + (p.tokenCount || 0);
                p.tokenCount = 0;
              });
              tx.update(roomRef, {
                players,
                state: "finished",
                turnIndex: data.turnIndex,
                round: data.round,
                turnStartedAt: null
              });
              return;
            }
          }

          tx.update(roomRef, {
            turnIndex: nextTurn,
            round: nextRound,
            turnStartedAt: Date.now(),
            turnDuration: TURN_DURATION
          });
        });
      } catch (err) {
        console.warn("Auto-advance failed: ", err);
      }
    }, TURN_DURATION);

    return () => clearTimeout(timer);
  }, [room.turnIndex, isMyTurn, isAnimating]);

  const canInteract = isMyTurn && !isAnimating;

  // Word validation
  const validateWord = async (word) => {
    if (!word) return false;
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
      if (!res.ok) return false;
      const data = await res.json();
      return Array.isArray(data) && data.length > 0;
    } catch (err) {
      console.warn("Word validation failed: ", err);
      return false;
    }
  };

  const handleDragStart = (tileId) => {
    if (!canInteract) return;
    setSelectedTiles([tileId]);
    setIsDragging(true);
    updateCurrentWord([tileId]);
  };

  const handleDragOver = (tileId) => {
    if (!canInteract || !isDragging) return;

    const lastId = selectedTiles[selectedTiles.length - 1];

    // Deselect the last tile if the player is hovering on it
    if (selectedTiles.includes(tileId)) {
      if (selectedTiles[selectedTiles.length - 2] === tileId) {
        const newSel = selectedTiles.slice(0, -1);
        setSelectedTiles(newSel);
        updateCurrentWord(newSel);
      }
      return;
    }

    // Only connect the letters if tiles are adjacent
    if (areTilesAdjacent(lastId, tileId)) {
      const newSel = [...selectedTiles, tileId];
      setSelectedTiles(newSel);
      updateCurrentWord(newSel);
    }
  };

  const updateCurrentWord = async (selected) => {
    let wordMultiplier = 1;
    let points = 0;

    selected.forEach((id) => {
      const tile = tiles[id];
      let letterPoints = tile.value ?? 0;
      if (tile.bonus === "TL") letterPoints *= 3;
      points += letterPoints;
      if (tile.bonus === "2X") wordMultiplier = 2;
    });

    if (selected.length >= 6) points += 10;
    points *= wordMultiplier;

    const word = selected.map((id) => tiles[id].letter).join("");

    setCurrentWord(word);
    setCurrentPoints(points);

    if (isMyTurn) {
      if (selected.length === 0) {
        await updateDoc(doc(db, "rooms", room.id), {
          liveSelection: null,
        });
        return;
      }

      await updateDoc(doc(db, "rooms", room.id), {
        liveSelection: {
          playerId: currentPlayer.id,
          selectedTiles: selected,
          word,
          points
        },
      });
    }
  };

  const swapRequester = room.swapActive ? room.swapActive.by : null;
  const swapModeActive = swapRequester && swapRequester === currentPlayer.id;

  const onTileClickForSwap = (tileId) => {
    if (!swapModeActive) return;
    setSwapTargetTile(tileId);
    setSwapModalOpen(true);
  };

  const onSelectSwapLetter = async (letter) => {
    setSwapModalOpen(false);
    const tileId = swapTargetTile;
    setSwapTargetTile(null);
    if (!tileId) return;

    setSwappingTileId(tileId);

    setTimeout(() => {
      setSwappingTileId(null);
    }, 400);

    socket &&
      socket.emit("completeSwap", {
        roomId: room.id,
        tileId,
        newLetter: letter
      });
  };

  const handleMouseUp = async () => {
    if (!canInteract) return;
    if (selectedTiles.length === 0) {
      setHasSubmitted(false);
      return;
    }

    setIsDragging(false); // Stop further hovering

    // Words must be 2 letters long
    if (selectedTiles.length < 2) {
      setErrorMessage("Word must be at least 2 letters");
      setTimeout(() => setErrorMessage(null), 2000);

      setSelectedTiles([]);
      setCurrentWord("");
      setCurrentPoints(0);
      setHasSubmitted(false);

      await updateDoc(doc(db, "rooms", room.id), {
        liveSelection: {
          playerId: currentPlayer.id,
          selectedTiles: [],
          word: "",
          points: 0,
          error: "Word must be at least 2 letters"
        },
      });
      return;
    }

    // Prevent a double submission of words
    if (hasSubmitted) return;
    setHasSubmitted(true);

    updateCurrentWord(selectedTiles);

    const word = selectedTiles.map((id) => tiles[id].letter).join("");

    let wordMultiplier = 1;
    let points = 0;

    selectedTiles.forEach((id) => {
      const tile = tiles[id];
      let letterPoints = tile.value ?? 0;
      if (tile.bonus === "TL") letterPoints *= 3;
      points += letterPoints;
      if (tile.bonus === "2X") wordMultiplier = 2;
    });

    if (selectedTiles.length >= 6) points += 10;
    points *= wordMultiplier;

    const selectedIds = [...selectedTiles];

    // Validate word
    const isValid = await validateWord(word);
    if (!isValid) {
      const invalidText = `"${word}" is not valid`;

      setErrorMessage(invalidText);

      await updateDoc(doc(db, "rooms", room.id), {
        liveSelection: {
          playerId: currentPlayer.id,
          selectedTiles: [],
          word,
          points: 0,
          error: invalidText,
        },
      });

      setTimeout(async () => {
        setErrorMessage(null);
        await updateDoc(doc(db, "rooms", room.id), {
          liveSelection: null,
        });
      }, 2000);

      setSelectedTiles([]);
      setCurrentWord("");
      setCurrentPoints(0);
      setHasSubmitted(false);
      return;
    }

    setIsAnimating(true);

    try {
      await runTransaction(db, async (tx) => {
        const roomRef = doc(db, "rooms", room.id);

        const snap = await tx.get(roomRef);
        if (!snap.exists()) throw new Error("Room missing");

        const data = snap.data();
        const players = data.players || [];
        const idx = players.findIndex((p) => p.id === currentPlayer.id);
        if (idx === -1) throw new Error("Player not in room");
        if ((data.turnIndex || 0) !== idx) throw new Error("Not your turn");

        players[idx] = {
          ...players[idx],
          wordsConnected: [
            ...(players[idx].wordsConnected || []),
            { word, points },
          ],
          score: (players[idx].score || 0) + points
        };

        // Count new tokens gained
        let gainedTokens = 0;
        for (const tid of selectedIds) {
          const tile = data.grid.find((t) => t.id === tid);
          if (tile && tile.token != null) gainedTokens += 1;
        }
        players[idx].tokenCount = Math.min(
          10,
          (players[idx].tokenCount || 0) + gainedTokens
        );

        // Update grid
        let newGrid = data.grid.map((t) => {
          if (selectedIds.includes(t.id)) {
            const letter = getRandomLetter();
            return {
              ...t,
              letter,
              value: getLetterValues()[letter],
              token: null,
              bonus: null
            };
          }
          return { ...t, bonus: t.bonus || null };
        });

        // Restore bonus tiles
        const bonusTypes = ["TL", "2X"];
        bonusTypes.forEach((type) => {
          if (!newGrid.some((t) => t.bonus === type)) {
            const candidates = newGrid.filter(
              (t) => !selectedIds.includes(t.id) && !t.bonus
            );
            if (candidates.length > 0) candidates[Math.floor(Math.random() * candidates.length)].bonus = type;
          }
        });

        // Reassign tokens
        let tokenCount = newGrid.filter((t) => t.token != null).length;
        const noTokenIds = newGrid.filter((t) => !t.token).map((t) => t.id);
        for (let i = 0; i < noTokenIds.length && tokenCount < MAX_TOKENS; i++) {
          newGrid[noTokenIds[i]].token = "•";
          tokenCount++;
        }

        // Turn and round logic
        let nextTurn = (data.turnIndex || 0) + 1;
        let nextRound = data.round || 1;
        let newRoundGrid = data.grid;
        const maxRounds = data.maxRounds || MAX_ROUNDS;

        let finalGrid = newGrid;

        if (nextTurn >= players.length) {
          nextTurn = 0;
          nextRound += 1;

          if (nextRound > maxRounds) {
            players.forEach((p) => {
              p.score = (p.score || 0) + (p.tokenCount || 0);
              p.tokenCount = 0;
            });

            tx.update(roomRef, {
              players,
              round: data.round,
              turnIndex: data.turnIndex,
              state: "finished",
              turnStartedAt: null,
              grid: newGrid,
              turnDuration: TURN_DURATION
            });
            return;
          }

          finalGrid = generateFullGrid(MAX_TOKENS);
        }

        tx.update(roomRef, {
          players,
          grid: finalGrid,
          turnIndex: nextTurn,
          round: nextRound,
          turnStartedAt: Date.now(),
          turnDuration: TURN_DURATION
        });
      });
    } catch (err) {
      console.warn("Transaction failed:", err.message);
    } finally {
      setSelectedTiles([]);
      setCurrentWord("");
      setCurrentPoints(0);
      setIsAnimating(false);
    }

    await updateDoc(doc(db, "rooms", room.id), {
      liveSelection: null,
    });
  };

  const previewTiles = isMyTurn ? selectedTiles : livePreview?.selectedTiles || [];

  return (
    <div className="flex flex-col items-center w-full border-3 border-spellbound-navy bg-white/80 jersey-25-regular rounded-xl max-w-lg">
      {/* Letter Swap Modal */}
      <SwapModal
        open={swapModalOpen}
        onClose={() => setSwapModalOpen(false)}
        onSelect={onSelectSwapLetter}
      />

      {/* Word Preview */}
      <div className="w-full py-2 flex flex-col justify-center items-center bg-[#fc0744] border-b-3 border-[#052133] text-white px-3 rounded-t-lg select-none">
        {isMyTurn ? (
          errorMessage ? (
            <p className="text-2xl text-red-200 animate-pulse">
              {errorMessage}
            </p>
          ) : currentWord ? (
            <p className="text-2xl text-white">
              {currentWord} +{currentPoints}
            </p>
          ) : (
            <p className="text-2xl text-white/50">-</p>
          )
        ) : livePreview && room.players[room.turnIndex]?.id === livePreview.playerId ? (
          livePreview.error ? (
            <p className="text-2xl text-red-200 animate-pulse">
              {livePreview.error}
            </p>
          ) : (
            <p className="text-2xl text-yellow-200">
              {livePreview.word} +{livePreview.points}
            </p>
          )
        ) : (
          <p className="text-2xl text-white/50">-</p>
        )}
      </div>

      <div className="relative w-full p-2">
        {/* Connecting Line */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {previewTiles.map((id, i) => {
            if (i === 0) return null;

            const prev = previewTiles[i - 1];

            const getPos = (tileId) => {
              const row = Math.floor(tileId / 5);
              const col = tileId % 5;

              // Center of tile in %
              return {
                x: (col + 0.5) * 20,
                y: (row + 0.5) * 20,
              };
            };

            const a = getPos(prev);
            const b = getPos(id);

            return (
              <line
                key={`${prev}-${id}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#0ec5ff"
                strokeWidth="2"
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* Alphabet Grid */}
        <div
          className="w-full p-2 grid gap-2 relative z-10"
          style={{
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          }}
          onMouseLeave={handleMouseUp}
          onMouseUp={handleMouseUp}
        >
          {tiles.map((tile) => (
            <div key={tile.id} className="w-full aspect-square">
              <Tile
                tile={tile}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onTileClick={swapModeActive ? onTileClickForSwap : null}
                swapSelectable={swapModeActive && amICurrent}
                isSelected={
                  isMyTurn
                    ? selectedTiles.includes(tile.id)
                    : livePreview?.selectedTiles?.includes(tile.id)
                }
                isAnimating={isAnimating}
                disabled={!canInteract && !swapModeActive}
                isShuffling={isShuffling}
                isSwapping={swappingTileId === tile.id}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Board;

// TODO: Move to Utils
function generateFullGrid(maxTokens) {
  console.log("GENERATING FULL GRID", Date.now(), Math.random());

  const MIN_VOWELS = 7;
  const MAX_ATTEMPTS = 100;

  const VOWELS = new Set(["A", "E", "I", "O", "U"]);

  const getValue = (l) =>
    ({
      A: 1,
      E: 1,
      I: 1,
      O: 1,
      N: 2,
      R: 2,
      S: 2,
      T: 2,
      D: 3,
      G: 3,
      L: 3,
      B: 4,
      H: 4,
      P: 4,
      M: 4,
      U: 4,
      Y: 4,
      C: 5,
      F: 5,
      V: 5,
      W: 5,
      K: 6,
      J: 7,
      X: 7,
      Q: 8,
      Z: 8,
    }[l] || 1);

  const generateOnce = () => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    const grid = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      letter: letters[Math.floor(Math.random() * letters.length)],
      value: 1,
      token: null,
      bonus: null,
    }));

    // Assign letter values
    grid.forEach((t) => {
      t.value = getValue(t.letter);
    });

    // Place bonuses
    ["TL", "2X"].forEach((type) => {
      let idx;
      do {
        idx = Math.floor(Math.random() * grid.length);
      } while (grid[idx].bonus);
      grid[idx].bonus = type;
    });

    // Place tokens
    let tokenCount = 0;
    const ids = grid.map((g) => g.id);
    while (tokenCount < maxTokens && ids.length > 0) {
      const idx = Math.floor(Math.random() * ids.length);
      if (!grid[ids[idx]].token) {
        grid[ids[idx]].token = "•";
        tokenCount++;
      }
      ids.splice(idx, 1);
    }

    return grid;
  };

  const isValidGrid = (grid) => {
    const vowelCount = grid.filter((t) => VOWELS.has(t.letter)).length;
    return vowelCount >= MIN_VOWELS;
  };

  // Retry until constraints satisfied
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const grid = generateOnce();
    if (isValidGrid(grid)) {
      return grid;
    }
  }

  // Fallback if constraints fail repeatedly
  return generateOnce();
}
