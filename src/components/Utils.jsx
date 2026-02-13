import React from "react";

const MAX_ROUNDS = 5;
const TURN_DURATION = 90000;
const VOWELS = ["A", "E", "I", "O", "U"];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LETTER_VALUES = {
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
};

export function getLetterValues() {
  return LETTER_VALUES;
}

export function getMaxRounds() {
  return MAX_ROUNDS;
}

export function getTurnDuration() {
  return TURN_DURATION;
}

export function getRandomLetter() {
  const letters = Object.keys(LETTER_VALUES);
  return letters[Math.floor(Math.random() * letters.length)];
}

export function generateGrid() {
  // Generate a random letter (and get the letter's value) for 25 tiles
  return Array.from({ length: 25 }, (_, i) => {
    const letter = getRandomLetter();
    return {
      id: i,
      letter,
      value: LETTER_VALUES[letter],
      token: null,
    };
  });
}

// TODO: Tidy up all these generate grid functions and the replication of constants across files
export function generateNewGrid() {
  const GRID_SIZE = 25;
  const MIN_VOWELS = 5;
  const TOKEN_COUNT = 10;
  const tiles = [];

  // Ensure minimum vowels of  5 per grid
  for (let i = 0; i < MIN_VOWELS; i++) {
    const letter = VOWELS[Math.floor(Math.random() * VOWELS.length)];
    tiles.push({
      id: i,
      letter,
      value: LETTER_VALUES[letter],
      token: null,
      bonus: null,
    });
  }

  // Fill the remaining tiles
  while (tiles.length < GRID_SIZE) {
    const letter = getRandomLetter();
    tiles.push({
      id: tiles.length,
      letter,
      value: LETTER_VALUES[letter],
      token: null,
      bonus: null,
    });
  }

  // Shuffle the tiles
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }

  // Re-assign IDs to the tiles
  tiles.forEach((t, i) => (t.id = i));

  // Assign bonus tiles
  ["TL", "2X"].forEach((type) => {
    let idx;
    do {
      idx = Math.floor(Math.random() * tiles.length);
    } while (tiles[idx].bonus);
    tiles[idx].bonus = type;
  });

  // Assign tokens
  let placed = 0;
  const ids = tiles.map((t) => t.id);
  while (placed < TOKEN_COUNT && ids.length > 0) {
    const i = Math.floor(Math.random() * ids.length);
    tiles[ids[i]].token = "•";
    ids.splice(i, 1);
    placed++;
  }

  return tiles;
}

export function addTokens(tiles, amount = 10) {
  const freeIndexes = [...tiles.keys()];
  const chosen = [];

  while (chosen.length < amount && freeIndexes.length > 0) {
    const rand = Math.floor(Math.random() * freeIndexes.length);
    chosen.push(freeIndexes[rand]);
    freeIndexes.splice(rand, 1); // Ensure there are no duplicates
  }

  return tiles.map((tile, i) =>
    chosen.includes(i) ? { ...tile, token: "hasToken" } : tile,
  );
}

export function areTilesAdjacent(id1, id2) {
  const row1 = Math.floor(id1 / 5),
    col1 = id1 % 5;
  const row2 = Math.floor(id2 / 5),
    col2 = id2 % 5;

  const rowDiff = Math.abs(row1 - row2);
  const colDiff = Math.abs(col1 - col2);

  return rowDiff <= 1 && colDiff <= 1 && !(rowDiff === 0 && colDiff === 0);
}
