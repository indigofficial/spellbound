import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, onSnapshot, runTransaction } from "firebase/firestore";
import { db } from "../../firebase";
import { io } from "socket.io-client";
import { FaMinus } from "react-icons/fa6";
import { IoClose } from "react-icons/io5";
import { FaRegWindowRestore } from "react-icons/fa";
import Board from "./Board";
import { getMaxRounds, getTurnDuration, generateNewGrid } from "./Utils";

function Game() {
  // TODO: Get rid of the duplicating constants
  const MAX_ROUNDS = getMaxRounds();
  const TURN_DURATION = getTurnDuration();
  const SOCKET_SERVER_URL = import.meta.env.VITE_SOCKET_URL;

  const { roomId } = useParams();
  const [room, setRoom] = useState(null);

  const [timeLeft, setTimeLeft] = useState(null);
  const [endCountdown, setEndCountdown] = useState(30);

  const [prevTokens, setPrevTokens] = useState(0);
  const [animatingTokens, setAnimatingTokens] = useState([]);
  const [shuffleTrigger, setShuffleTrigger] = useState(0);
  
  const timerRef = useRef(null);
  const socketRef = useRef(null);
  const navigate = useNavigate();

  const playerId = localStorage.getItem("playerId");
  const tabId = localStorage.getItem("tabId") || crypto.randomUUID();
  const name = localStorage.getItem("name") || "Player";
  const avatar = localStorage.getItem("avatar") || null;

  useEffect(() => {
    if (!localStorage.getItem("tabId")) {
      localStorage.setItem("tabId", tabId);
    }
  }, [tabId]);

  useEffect(() => {
    if (!roomId) return;
    const roomRef = doc(db, "rooms", roomId);
    const unsub = onSnapshot(roomRef, (snap) => {
      if (!snap.exists()) {
        navigate("/");
        return;
      }
      setRoom({ id: snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [roomId, navigate]);

  useEffect(() => {
    if (!roomId || !playerId) return;
    const socket = io(SOCKET_SERVER_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    const payload = { roomId, player: { id: playerId, name, avatar, tabId } };
    socket.emit("joinRoom", payload);

    socket.on("shuffleConfirmed", () => {
      setShuffleTrigger(prev => prev + 1);
    });

    const handleLeave = () => {
      try {
        socket.emit("tabClosed", { roomId, playerId, tabId });
      } catch (e) {}
    };

    window.addEventListener("beforeunload", handleLeave);
    window.addEventListener("pagehide", handleLeave);
    socket.on("disconnect", handleLeave);

    return () => {
      handleLeave();
      window.removeEventListener("beforeunload", handleLeave);
      window.removeEventListener("pagehide", handleLeave);
      socket.off("shuffleConfirmed");
      socket.disconnect();
    };
  }, [roomId, playerId, tabId, name, avatar]);

  useEffect(() => {
    if (!room) return;

    if (room.state === "finished") {
      setTimeLeft(0);
      let remaining = 30;
      setEndCountdown(remaining);

      const tick = setInterval(() => {
        remaining -= 1;
        setEndCountdown(remaining);
      }, 1000);

      const timeout = setTimeout(async () => {
        try {
          const roomRef = doc(db, "rooms", roomId);
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(roomRef);
            if (!snap.exists()) return;
            const data = snap.data();
            if (data.state === "finished") tx.delete(roomRef);
          });
        } catch (err) {
          console.warn("Failed to delete finished room:", err);
        } finally {
          clearInterval(tick);
          navigate("/");
        }
      }, 30000);

      return () => {
        clearInterval(tick);
        clearTimeout(timeout);
      };
    }

    const duration = room.turnDuration || TURN_DURATION;
    const startedAt = room.turnStartedAt || Date.now();

    const updateRemaining = () => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0) {
        safeAdvanceTurn(roomId, room).catch((err) => {
          console.warn("Auto-advance failed:", err?.message || err);
        });
      }
    };

    updateRemaining();
    clearInterval(timerRef.current);
    timerRef.current = setInterval(updateRemaining, 1000);
    return () => clearInterval(timerRef.current);
  }, [room, roomId, navigate]);

  const safeAdvanceTurn = async (roomIdParam, latestRoom) => {
    if (!latestRoom || latestRoom.state === "finished") return;

    const nextTurnIndex = (data.turnIndex || 0) + 1;
    let nextRound = data.round || 1;
    if (nextTurnIndex >= players.length) {
      nextRound++;
    }

    const maxRounds = data.maxRounds || MAX_ROUNDS;
    if (nextRound > maxRounds) {
      tx.update(roomRef, { state: "finished", turnStartedAt: null });
      return;
    }

    const roomRef = doc(db, "rooms", roomIdParam);

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(roomRef);
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.state === "finished") return;
        if ((data.turnStartedAt || 0) > (latestRoom.turnStartedAt || 0)) return;
        if (
          (data.turnStartedAt || 0) + (data.turnDuration || TURN_DURATION) >
          Date.now()
        )
          return;

        const players = data.players || [];
        if (players.length === 0) {
          tx.delete(roomRef);
          return;
        }

        let nextTurnIndex = (data.turnIndex || 0) + 1;
        let nextRound = data.round || 1;
        if (nextTurnIndex >= players.length) {
          nextTurnIndex = 0;
          nextRound++;
        }

        const maxRounds = data.maxRounds || MAX_ROUNDS;
        if (nextRound > maxRounds) {
          tx.update(roomRef, { state: "finished", turnStartedAt: Date.now() });
          return;
        }

        let newGrid = data.grid;
        if (nextTurnIndex === 0) {
          newGrid = generateNewGrid();
        }

        tx.update(roomRef, {
          turnIndex: nextTurnIndex,
          round: nextRound,
          turnStartedAt: Date.now(),
          grid: newGrid,
          turnDuration: TURN_DURATION
        });
      });
    } catch (err) {
      console.warn("safeAdvanceTurn transaction error:", err?.message || err);
    }
  };

  useEffect(() => {
    if (!room) return;

    const currentPlayer = room.players?.find((p) => p.id === playerId);
    if (!currentPlayer) return;

    const myTokens = currentPlayer.tokenCount || 0;

    if (myTokens > prevTokens) {
      const gained = myTokens - prevTokens;

      const newIndexes = Array.from(
        { length: gained },
        (_, i) => prevTokens + i
      );

      setAnimatingTokens(newIndexes);

      setTimeout(() => setAnimatingTokens([]), 500);
    }

    setPrevTokens(myTokens);
  }, [room]);

  if (!room) {
    return (
      <div
        className="min-h-screen w-full bg-cover bg-center bg-no-repeat jersey-25-regular
                  flex flex-col items-center justify-center px-4"
        style={{ backgroundImage: "url('/src/assets/Background.png')" }}
      >
        <h1 className="text-5xl text-spellbound-navy">Loading room...</h1>

        {/* Footer */}
        <p className="absolute bottom-6 text-sm text-spellbound-navy">
          made by Indigo
        </p>
      </div>
    )
  };

  const currentPlayer = room.players?.find((p) => p.id === playerId);
  if (!currentPlayer) {
    return (
      <div
        className="min-h-screen w-full bg-cover bg-center bg-no-repeat jersey-25-regular
                  flex flex-col items-center justify-center px-4"
        style={{ backgroundImage: "url('/src/assets/Background.png')" }}
      >
        <h1 className="text-5xl text-spellbound-navy">Reconnecting...</h1>

        {/* Footer */}
        <p className="absolute bottom-6 text-sm text-spellbound-navy">
          made by Indigo
        </p>
      </div>
    )
  }

  const amICurrent = room.players[room.turnIndex]?.id === playerId;
  const myTokens = currentPlayer.tokenCount || 0;

  const livePreview = room?.liveSelection || null;

  const extendTimer = () => {
    if (!socketRef.current) return;
    socketRef.current.emit("extendTimer", { roomId });
  };

  const shuffleBoard = () => {
    if (!socketRef.current) return;
    socketRef.current.emit("shuffleBoard", { roomId });
  };

  const beginSwap = () => {
    if (!socketRef.current) return;
    socketRef.current.emit("beginSwap", { roomId });
  };

  // Game Over screen
  if (room.state === "finished") {
    const rankedPlayers = [...(room.players || [])].sort(
      (a, b) => (b.score || 0) - (a.score || 0)
    );

    return (
      <div
        className="min-h-screen w-full bg-cover bg-center bg-no-repeat jersey-25-regular flex flex-col items-center justify-start px-4 py-8"
        style={{ backgroundImage: "url('/src/assets/Background.png')" }}
      >
        <h1 className="text-5xl text-spellbound-navy mt-10 mb-6">Game Over</h1>

        <div className="w-full max-w-3xl bg-white/80 border-3 border-spellbound-navy rounded-xl shadow-lg overflow-hidden">
          {/* Title Bar */}
          <div className="flex items-center justify-between bg-[#fc0744] border-b-3 border-[#052133] text-white px-3 py-1 rounded-t-lg select-none">
            <span className="text-lg">
              <i>leaderboard.exe</i>
            </span>
            <div className="flex space-x-2">
              <button className="w-6 h-6 flex items-center justify-center border-2 border-[#052133] bg-white text-[#052133] rounded">
                <FaMinus />
              </button>
              <button className="w-6 h-6 flex items-center justify-center border-2 border-[#052133] bg-white text-[#052133] rounded">
                <FaRegWindowRestore />
              </button>
              <button className="w-6 h-6 flex items-center justify-center border-2 border-[#052133] bg-[#0ec5ff] text-[#052133] rounded">
                <IoClose />
              </button>
            </div>
          </div>

          {/* Leaderboard */}
          <div className="divide-y divide-[#052133]/30">
            {rankedPlayers.map((player, index) => {
              // Determine best word
              const bestWordObj = player.wordsConnected?.reduce(
                (max, w) => (!max || w.points > max.points ? w : max),
                null
              );

              return (
                <div
                  key={player.id}
                  className="flex items-center justify-between px-4 py-3 rounded"
                >
                  {/* Rank */}
                  <div className="text-xl sm:text-2xl w-8 text-center">
                    {index + 1}
                  </div>

                  <div className="relative">
                    {/* Avatar */}
                    <img
                      src={player.avatar}
                      alt={player.name}
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg border-2 border-[#052133]"
                    />

                    {/* Token Count */}
                    <div className="absolute -top-1 -right-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[#ffd45e] border-2 border-[#052133] flex items-center justify-center text-xs sm:text-sm">
                      {player.tokenCount || 0}
                    </div>
                  </div>

                  <div className="flex-1 ml-4">
                    {/* Name */}
                    <div className="text-lg sm:text-xl text-[#052133]">
                      {player.name}
                    </div>

                    {/* Best Word */}
                    {bestWordObj ? (
                      <div className="text-[#052133]/70 text-sm sm:text-base">
                        Best Word: {bestWordObj.word} +{bestWordObj.points}
                      </div>
                    ) : (
                      <div className="text-[#052133]/50 text-sm sm:text-base">
                        No words played
                      </div>
                    )}
                  </div>

                  {/* Total Score */}
                  <div className="text-2xl sm:text-2xl text-[#052133]">
                    {player.score || 0}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Back to Home Button */}
        <button
          onClick={() => navigate("/")}
          className="cursor-pointer mt-8 px-6 py-3 bg-[#fc0744] text-white text-lg sm:text-xl rounded-md border-2 border-[#052133] shadow-[4px_4px_0_#052133] active:shadow-[0_0_0_#052133] active:translate-x-[4px] active:translate-y-[4px] transition-all"
        >
          Back to Home
        </button>
        <p className="mt-4 text-sm text-[#052133]/70">
          You'll be redirected automatically in {endCountdown}s
        </p>

        {/* Footer */}
        <p className="mt-6 text-sm text-spellbound-navy">made by Indigo</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen w-full bg-cover bg-center bg-no-repeat jersey-25-regular flex flex-col items-center justify-start"
      style={{ backgroundImage: "url('/src/assets/Background.png')" }}
    >
      {/* Round Number + Timer */}
      <div className="w-full max-w-6xl flex flex-col sm:flex-row items-center justify-between px-4 py-4 gap-2">
        <p className="text-3xl text-[#052133] tracking-widest text-center sm:text-left">
          ROUND {room.round}
        </p>

        <div className="mt-2 sm:mt-0 relative w-16 h-16 mx-auto sm:mx-0">
          <svg className="w-full h-full" viewBox="0 0 64 64">
            <circle
              cx="32"
              cy="32"
              r="30"
              stroke="#052133"
              strokeWidth="4"
              fill="transparent"
            />
            <circle
              cx="32"
              cy="32"
              r="28"
              stroke="#052133"
              strokeWidth="5"
              fill="transparent"
              className="opacity-20"
            />
            <circle
              cx="32"
              cy="32"
              r="28"
              stroke="#fdbc08"
              strokeWidth="5"
              fill="transparent"
              strokeDasharray={2 * Math.PI * 28}
              strokeDashoffset={
                (((room.turnDuration || TURN_DURATION) -
                  (Date.now() - (room.turnStartedAt || Date.now()))) /
                  (room.turnDuration || TURN_DURATION)) *
                (2 * Math.PI * 28)
              }
              style={{ transition: "stroke-dashoffset 0.2s linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl text-[#052133]">
              {timeLeft != null ? `${timeLeft}` : "--"}
            </span>
          </div>
        </div>
      </div>

      <main className="flex flex-col lg:grid lg:grid-cols-1 xl:grid-cols-2 w-full max-w-6xl gap-4 px-4">
        {/* Board */}
        <div className="w-full lg:col-span-1 xl:col-span-1">
          <div className="w-full h-full lg:h-[700px] xl:h-[800px]">
            <Board
              room={room}
              player={currentPlayer}
              amICurrent={amICurrent}
              socket={socketRef.current}
              livePreview={livePreview}
              shuffleTrigger={shuffleTrigger}
            />
          </div>
        </div>

        {/* Panel Container */}
        <div className="flex flex-col gap-4 w-full lg:w-full">
          {/* tokens.exe */}
          <div className="w-full">
            <div className="bg-white/80 border-3 border-spellbound-navy rounded-xl shadow max-w-lg mx-auto">
              {/* Title Bar */}
              <div className="flex items-center justify-between bg-[#fc0744] border-b-3 border-[#052133] text-white px-3 py-1 rounded-t-lg select-none">
                <span className="text-lg">
                  <i>tokens.exe</i>
                </span>
                <div className="flex space-x-2">
                  <button className="w-6 h-6 flex items-center justify-center border-2 border-[#052133] bg-white text-[#052133] rounded">
                    <FaMinus />
                  </button>
                  <button className="w-6 h-6 flex items-center justify-center border-2 border-[#052133] bg-white text-[#052133] rounded">
                    <FaRegWindowRestore />
                  </button>
                  <button className="w-6 h-6 flex items-center justify-center border-2 border-[#052133] bg-[#0ec5ff] text-[#052133] rounded">
                    <IoClose />
                  </button>
                </div>
              </div>

              <div className="p-3">
                {/* Tokens */}
                <div className="flex items-center gap-2 mb-1">
                  {/* <span className="text-lg text-[#052133]">Tokens</span> */}

                  <div className="flex gap-2">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-5 h-5 rounded-full border-2 border-[#052133] transition-all duration-300 ${
                          i < myTokens ? "bg-[#fdbc08]" : ""
                        } ${
                          animatingTokens.includes(i)
                            ? "scale-125"
                            : ""
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Ability Buttons */}
                <div className="">
                  <button
                    onClick={extendTimer}
                    disabled={!amICurrent || myTokens < 1}
                    className={`mt-4 w-full text-lg py-2 rounded-md border-2 border-[#052133] shadow-[4px_4px_0_#052133] active:shadow-[0_0_0_#052133] active:translate-x-[4px] active:translate-y-[4px] transition-all ${
                      !amICurrent || myTokens < 1
                        ? "bg-[#fc0744]/60 text-white/60"
                        : "bg-[#fc0744] text-white"
                    } cursor-pointer`}
                  >
                    Extend Time (1)
                  </button>
                  <button
                    onClick={shuffleBoard}
                    disabled={!amICurrent || myTokens < 1}
                    className={`mt-4 w-full text-lg py-2 rounded-md border-2 border-[#052133] shadow-[4px_4px_0_#052133] active:shadow-[0_0_0_#052133] active:translate-x-[4px] active:translate-y-[4px] transition-all ${
                      !amICurrent || myTokens < 1
                        ? "bg-[#fdbc08]/60 text-white/60"
                        : "bg-[#fdbc08] text-white"
                    } cursor-pointer`}
                  >
                    Shuffle Board (1)
                  </button>
                  <button
                    onClick={beginSwap}
                    disabled={!amICurrent || myTokens < 3}
                    className={`mt-4 w-full text-lg py-2 rounded-md border-2 border-[#052133] shadow-[4px_4px_0_#052133] active:shadow-[0_0_0_#052133] active:translate-x-[4px] active:translate-y-[4px] transition-all ${
                      !amICurrent || myTokens < 3
                        ? "bg-[#0ec5ff]/60 text-white/60"
                        : "bg-[#0ec5ff] text-white"
                    } cursor-pointer`}
                  >
                    Swap Letter (3)
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Player Panel */}
          <div className="w-full">
            <div className="bg-white/80 border-3 border-spellbound-navy rounded-xl shadow w-full max-w-lg mx-auto">
              {/* Title Bar */}
              <div className="flex items-center justify-between bg-[#fc0744] border-b-3 border-[#052133] text-white px-3 py-1 rounded-t-lg select-none">
                <span className="text-lg">
                  <i>players.exe</i>
                </span>
                <div className="flex space-x-2">
                  <button className="w-6 h-6 flex items-center justify-center border-2 border-[#052133] bg-white text-[#052133] rounded">
                    <FaMinus />
                  </button>
                  <button className="w-6 h-6 flex items-center justify-center border-2 border-[#052133] bg-white text-[#052133] rounded">
                    <FaRegWindowRestore />
                  </button>
                  <button className="w-6 h-6 flex items-center justify-center border-2 border-[#052133] bg-[#0ec5ff] text-[#052133] rounded">
                    <IoClose />
                  </button>
                </div>
              </div>

              {/* Player List */}
              <div className="p-3 space-y-2">
                {(room.players || []).map((p) => {
                  const isCurrentTurn =
                    room.players[room.turnIndex]?.id === p.id;
                  const recentWord = p.wordsConnected?.slice(-1)[0] || {};

                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-2 rounded ${
                        isCurrentTurn
                          ? "border-2 border-[#052133]/50 rounded-lg"
                          : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          {/* Avatar */}
                          <img
                            src={p.avatar}
                            alt="avatar"
                            className="w-12 h-12 border-2 border-[#052133] rounded-lg"
                          />

                          {/* Token Count */}
                          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#ffd45e] border-2 border-[#052133] text-xs flex items-center justify-center">
                            {p.tokenCount}
                          </div>
                        </div>

                        <div className="flex flex-col text-[#052133]">
                          <span className="text-xl">{p.name}</span>
                          {recentWord.word && (
                            <span className="text-[#052133]/70 text-lg">
                              {recentWord.word} +{recentWord.points}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mr-3 text-2xl text-[#052133]">
                        {p.score || 0}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-2 text-center text-sm text-spellbound-navy w-full">
        made by Indigo
      </footer>
    </div>
  );
}

export default Game;
