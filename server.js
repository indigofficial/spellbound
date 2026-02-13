import http from "http";
import express from "express";
import { Server } from "socket.io";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const serviceAccount = require("./service-account.json");

// Initialise Firebase admin
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = getFirestore();

// Express + Socket.IO setup
const app = express();
const server = http.createServer(app);

// Enable CORS for all origins
const io = new Server(server, { cors: { origin: "*" } });

app.get("/", (req, res) => res.send("Server running"));

// TODO: Move to Utils
function randomLetter() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return letters[Math.floor(Math.random() * letters.length)];
}

// TODO: Move to Utils
function letterValue(letter) {
  const v = {
    A: 1,
    B: 3,
    C: 3,
    D: 2,
    E: 1,
    F: 4,
    G: 2,
    H: 4,
    I: 1,
    J: 8,
    K: 5,
    L: 1,
    M: 3,
    N: 1,
    O: 1,
    P: 3,
    Q: 10,
    R: 1,
    S: 1,
    T: 1,
    U: 1,
    V: 4,
    W: 4,
    X: 8,
    Y: 4,
    Z: 10,
  };
  return v[letter] || 1;
}

// TODO: Move to Utils
function generateGrid(size = 25, maxTokens = 10) {
  const grid = [];
  for (let i = 0; i < size; i++)
    grid.push({ id: i, letter: randomLetter(), value: 1, token: null });

  // Assign values to letters
  grid.forEach((t) => (t.value = letterValue(t.letter)));

  // Populate tokens on grid
  let tokenCount = 0;
  const ids = grid.map((g) => g.id);
  while (tokenCount < maxTokens && ids.length > 0) {
    const idx = Math.floor(Math.random() * ids.length);
    grid[ids[idx]].token = "•";
    ids.splice(idx, 1);
    tokenCount++;
  }

  return grid;
}

// Socket.IO Connection Handler
io.on("connection", (socket) => {
  console.log("Connected: ", socket.id);

  // Join room
  socket.on("joinRoom", async ({ roomId, player }) => {
    if (!roomId || !player) {
      console.warn("joinRoom called with missing roomId/player ", {
        roomId,
        player,
      });
      return;
    }

    // Store metadata on socket
    socket.data.roomId = roomId;
    socket.data.playerId = player.id;
    socket.data.tabId = player.tabId;

    const roomRef = db.collection("rooms").doc(roomId);

    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(roomRef);

        // Build initial player object
        const newPlayer = {
          ...player,
          score: 0,
          wordsConnected: [],
          tokenCount: 3,
          tabs: [player.tabId],
        };

        // If there is no room, create one
        if (!snap.exists) {
          // Create the room and include the new player in the initial write
          const initialRoom = {
            players: [newPlayer],
            grid: generateGrid(),
            turnIndex: 0,
            round: 1,
            turnDuration: 90000, // TODO: Use turnDuration constant from Utils
            state: "playing",
            turnStartedAt: Date.now(),
          };

          tx.set(roomRef, initialRoom);
          return;
        }

        // If there is an available room, join it
        const data = snap.data();
        const players = Array.isArray(data.players) ? data.players.slice() : [];

        const existingIndex = players.findIndex((p) => p.id === player.id);

        if (existingIndex !== -1) {
          const existing = players[existingIndex];

          if (!existing.tabs) existing.tabs = [];
          if (!existing.tabs.includes(player.tabId))
            existing.tabs.push(player.tabId);

          // Ensure tokenCount exists
          if (existing.tokenCount == null) existing.tokenCount = 3;

          players[existingIndex] = existing;
        } else {
          players.push(newPlayer);
        }

        tx.update(roomRef, { players });
      });

      // Join room after transaction succeeds
      socket.join(roomId);

      // Notify all clients to refresh room state
      io.to(roomId).emit("roomUpdate", { roomId });
    } catch (err) {
      console.error("joinRoom transaction failed ", { roomId, player, err });
    }
  });

  // Extend timer by 10s
  // TODO: Fix the bugginess of the timer
  socket.on("extendTimer", async ({ roomId }) => {
    const roomRef = db.collection("rooms").doc(roomId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists) return;

      const data = snap.data();
      const players = data.players || [];

      const idx = players.findIndex((p) => p.id === socket.data.playerId);
      if (idx === -1) return;

      // Check if player has sufficient tokens
      if ((players[idx].tokenCount || 0) < 1) return;

      // Spend token
      players[idx].tokenCount -= 1;

      // Add 10 seconds by shifting start time backwards
      tx.update(roomRef, {
        players,
        turnStartedAt: (data.turnStartedAt || Date.now()) - 10000,
      });
    });

    io.to(roomId).emit("roomUpdate", { roomId });
  });

  // Shuffle board
  socket.on("shuffleBoard", async ({ roomId }) => {
    const roomRef = db.collection("rooms").doc(roomId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists) return;

      const data = snap.data();
      const players = data.players || [];

      const idx = players.findIndex((p) => p.id === socket.data.playerId);
      if (idx === -1) return;

      // Check if player has sufficient tokens
      if ((players[idx].tokenCount || 0) < 1) return;

      // Spend token
      players[idx].tokenCount = Math.max(0, (players[idx].tokenCount || 0) - 1);

      // Shuffle letters and keep token tiles
      const grid = (data.grid || []).slice();
      const letters = grid.map((t) => t.letter);

      for (let i = letters.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [letters[i], letters[j]] = [letters[j], letters[i]];
      }

      const newGrid = grid.map((t, i) => {
        const newLetter = letters[i];
        return {
          ...t,
          letter: newLetter,
          value: letterValue(newLetter),
        };
      });

      await tx.update(roomRef, {
        players,
        grid: newGrid,
        turnStartedAt: Date.now(),
      });
    });

    io.to(roomId).emit("shuffleConfirmed");
    io.to(roomId).emit("roomUpdate", { roomId });
  });

  // Begin letter swap (spend 3 tokens and mark room.swapActive)
  socket.on("beginSwap", async ({ roomId }) => {
    const roomRef = db.collection("rooms").doc(roomId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists) return;

      const data = snap.data();
      const players = data.players || [];

      const idx = players.findIndex((p) => p.id === socket.data.playerId);
      if (idx === -1) return;

      // Check if player has sufficient tokens
      if ((players[idx].tokenCount || 0) < 3) return;

      // Spend tokens
      players[idx].tokenCount = Math.max(0, (players[idx].tokenCount || 0) - 3);

      // Set swapActive with requester id
      await tx.update(roomRef, {
        players,
        swapActive: { by: socket.data.playerId, startedAt: Date.now() },
        turnStartedAt: Date.now(),
      });
    });

    io.to(roomId).emit("roomUpdate", { roomId });
  });

  // Complete letter swap (player chooses tile and new letter)
  socket.on("completeSwap", async ({ roomId, tileId, newLetter }) => {
    const roomRef = db.collection("rooms").doc(roomId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists) return;

      const data = snap.data();
      const players = data.players || [];

      const swapActive = data.swapActive || null;
      if (!swapActive || swapActive.by !== socket.data.playerId) return;

      const grid = (data.grid || []).slice();
      const tileIndex = grid.findIndex((t) => t.id === tileId);
      if (tileIndex === -1) return;

      // Apply swap
      grid[tileIndex] = {
        ...grid[tileIndex],
        letter: newLetter,
        value: letterValue(newLetter),
      };

      // Clear swapActive
      await tx.update(roomRef, {
        grid,
        swapActive: null,
        turnStartedAt: Date.now(),
      });
    });

    io.to(roomId).emit("roomUpdate", { roomId });
  });

  // Live selection
  socket.on(
    "liveSelection",
    ({ roomId, playerId, selectedTiles, word, points }) => {
      socket.to(roomId).emit("liveSelectionUpdate", {
        playerId,
        selectedTiles,
        word,
        points,
      });
    },
  );

  // Clear live selection
  socket.on("clearLiveSelection", ({ roomId }) => {
    socket.to(roomId).emit("liveSelectionClear");
  });

  // Disconnect on closed tab
  async function removeTab(socket) {
    const { roomId, playerId, tabId } = socket.data;
    if (!roomId || !playerId) return;

    const roomRef = db.collection("rooms").doc(roomId);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) return;

    let data = roomSnap.data();
    let players = data.players || [];
    let turnIndex = data.turnIndex || 0;

    const idx = players.findIndex((p) => p.id === playerId);
    if (idx === -1) return;

    const wasCurrentTurn = turnIndex === idx;

    // Remove tab
    const tabs = players[idx].tabs || [];
    players[idx].tabs = tabs.filter((t) => t !== tabId);

    // Remove player if there are no tabs left
    if (players[idx].tabs.length === 0) {
      players.splice(idx, 1);

      // Adjust turnIndex to stay in-bounds
      if (players.length === 0) {
        await roomRef.delete();
        return;
      }

      if (turnIndex > idx) turnIndex -= 1;
      if (turnIndex >= players.length) turnIndex = 0;
    }

    // If it was their turn, immediately pass it
    if (wasCurrentTurn) {
      turnIndex = turnIndex % players.length;
    }

    await roomRef.update({
      players,
      turnIndex,
      turnStartedAt: Date.now(),
    });

    io.to(roomId).emit("roomUpdate", { roomId });
  }

  socket.on("tabClosed", async () => removeTab(socket));
  socket.on("disconnect", async () => removeTab(socket));

  // Submit word
  socket.on("submitWord", async ({ roomId, playerId, word, wordTiles }) => {
    const roomRef = db.collection("rooms").doc(roomId);

    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(roomRef);
        if (!snap.exists) return;

        const data = snap.data();
        const players = Array.isArray(data.players) ? [...data.players] : [];

        const grid = data.grid || [];
        const maxRounds = data.maxRounds || 5;
        const currentTurn = Number.isInteger(data.turnIndex)
          ? data.turnIndex
          : 0;
        const currentRound = Number.isInteger(data.round) ? data.round : 1;

        // End game immediately if currentRound hits 6
        if (data.state === "finished" || currentRound >= 6) {
          // Convert remaining tokens to score if not already finished
          const finalPlayers = players.map((p) => ({
            ...p,
            score: (p.score || 0) + (p.tokenCount || 0),
            tokenCount: 0,
          }));

          tx.update(roomRef, {
            players: finalPlayers,
            state: "finished",
            turnStartedAt: null,
            turnIndex: data.turnIndex || 0,
            round: currentRound,
          });

          return;
        }

        // If player is not in the room, just return
        const playerIndex = players.findIndex((p) => p.id === playerId);
        if (playerIndex === -1) return;

        const player = players[playerIndex];

        // Word validation
        if (!Array.isArray(wordTiles) || wordTiles.length === 0) {
          console.warn("submitWord: Invalid wordTiles ", { roomId, playerId });
          return;
        }

        // Reconstruct server-side word (defend against client tampering)
        const serverWord = wordTiles.map((t) => t.letter).join("");
        if (serverWord !== word) {
          console.log("submitWord: Word mismatch ", { serverWord, word });
          return;
        }

        // TODO: Clean this up
        if (typeof validateWord === "function") {
          const ok = validateWord(word);
          if (!ok) return;
        }

        if (typeof areAllTilesAdjacent === "function") {
          if (!areAllTilesAdjacent(wordTiles)) return;
        }

        // Ensure tile letters match authoritative grid
        for (let tile of wordTiles) {
          const { row, col, letter } = tile;
          if (!Array.isArray(grid[row]) || !grid[row][col]) return;

          if (grid[row][col].letter !== letter) {
            console.warn("submitWord: grid letter mismatch", {
              expected: grid[row][col].letter,
              got: letter,
            });
            return;
          }
        }

        // Score and player update
        const letterValues =
          typeof getLetterValues === "function" ? getLetterValues() : {};
        const points = wordTiles.reduce(
          (sum, t) => sum + (letterValues[t.letter] || 0),
          0,
        );

        players[playerIndex] = {
          ...player,
          score: (player.score || 0) + points,
          wordsConnected: [...(player.wordsConnected || []), { word, points }],
        };

        // Replace used tiles
        const newGrid = grid.map((row) =>
          Array.isArray(row) ? row.slice() : row,
        );

        wordTiles.forEach((tile) => {
          newGrid[tile.row][tile.col] = {
            ...newGrid[tile.row][tile.col],
            letter:
              typeof getRandomLetter === "function"
                ? getRandomLetter()
                : randomLetter(),
            value:
              typeof getLetterValues === "function"
                ? getLetterValues()[
                    typeof getRandomLetter === "function"
                      ? newGrid[tile.row][tile.col].letter
                      : newGrid[tile.row][tile.col].letter
                  ] || 1
                : 1,
            token: null,
            bonus: null,
          };
        });

        // Advance turn/round
        const isLastPlayerThisRound = currentTurn + 1 >= players.length;
        let nextTurn = (currentTurn + 1) % players.length;
        let nextRound = currentRound;
        if (isLastPlayerThisRound) nextRound = currentRound + 1;

        // End game immediately if currentRound hits 6
        // TODO: Fix up redundant end game logic, this is being used in multiple parts of the code
        if (nextRound >= 6 || nextRound > maxRounds) {
          const finalPlayers = players.map((p) => ({
            ...p,
            score: (p.score || 0) + (p.tokenCount || 0),
            tokenCount: 0,
          }));

          tx.update(roomRef, {
            players: finalPlayers,
            grid: newGrid,
            turnIndex: currentTurn,
            round: currentRound,
            state: "finished",
            turnStartedAt: null,
          });

          return;
        }

        // Otherwise, advance and restart timer if the game is still continuing
        tx.update(roomRef, {
          players,
          grid: newGrid,
          turnIndex: nextTurn,
          round: nextRound,
          state: "playing",
          turnStartedAt: Date.now(),
        });
      });

      // Broadcast update for clients
      io.to(roomId).emit("roomUpdate", { roomId });
    } catch (err) {
      console.error("submitWord error:", err);
    }
  });
});

server.listen(3000, () => console.log("Server running on 3000"));
