import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { createAvatar } from "@dicebear/core";
import { loreleiNeutral } from "@dicebear/collection";
import { MdRefresh } from "react-icons/md";
import { FaMinus } from "react-icons/fa6";
import { IoClose } from "react-icons/io5";
import { FaRegWindowRestore } from "react-icons/fa";
import {
  getMaxRounds,
  getTurnDuration,
  generateNewGrid,
} from "./components/Utils";

function Home() {
  const navigate = useNavigate();

  const storedName = localStorage.getItem("name") || "";
  const storedAvatar = localStorage.getItem("avatar") || "";
  const storedPlayerId = localStorage.getItem("playerId") || "";
  const storedTabId = localStorage.getItem("tabId") || "";

  const [name, setName] = useState(storedName);
  const [avatarUrl, setAvatarUrl] = useState(storedAvatar);

  useEffect(() => {
    if (!avatarUrl) {
      const svg = createAvatar(loreleiNeutral, {
        seed: crypto.randomUUID(),
      }).toString();
      setAvatarUrl(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
    }

    if (!storedTabId) {
      const tid = crypto.randomUUID();
      localStorage.setItem("tabId", tid);
    }
  }, []);

  const generateNewAvatar = () => {
    const svg = createAvatar(loreleiNeutral, {
      seed: crypto.randomUUID(),
    }).toString();
    const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    setAvatarUrl(dataUri);
    localStorage.setItem("avatar", dataUri);
  };

  const handleNameChange = (e) => {
    setName(e.target.value);
    localStorage.setItem("name", e.target.value);
  };

  const handlePlay = async () => {
    if (!name.trim()) return alert("Enter a name to start playing."); // TODO: Replace with a modal

    let playerId = storedPlayerId;
    if (!playerId) {
      playerId = crypto.randomUUID();
      localStorage.setItem("playerId", playerId);
    }

    let tabId = localStorage.getItem("tabId");
    if (!tabId) {
      tabId = crypto.randomUUID();
      localStorage.setItem("tabId", tabId);
    }

    const newPlayer = {
      id: playerId,
      name: name,
      avatar: avatarUrl,
      wordsConnected: [],
      score: 0,
      lastMove: Date.now(),
      tabs: [tabId],
      tabId,
    };

    const MAX_ROUNDS = getMaxRounds();
    const TURN_DURATION = getTurnDuration();

    const roomsRef = collection(db, "rooms");
    const q = query(roomsRef, where("state", "==", "playing"));
    const snapshot = await getDocs(q);

    let roomId = null;
    let roomData = null;

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if ((data.players?.length || 0) < 6 && !roomId) {
        roomId = docSnap.id;
        roomData = data;
      }
    });

    if (!roomId) {
      // If there are no available rooms, create one
      const roomDoc = await addDoc(roomsRef, {
        createdAt: Date.now(),
        grid: generateNewGrid(),
        players: [newPlayer],
        state: "playing",
        hostId: playerId,
        round: 1,
        turnIndex: 0,
        maxRounds: MAX_ROUNDS,
        turnDuration: TURN_DURATION,
        turnStartedAt: Date.now(),
      });
      roomId = roomDoc.id;
    } else {
      // If there are, add the player to an existing one
      const roomDocRef = doc(db, "rooms", roomId);

      if (!roomData.players.some((p) => p.id === playerId)) {
        await updateDoc(roomDocRef, {
          players: [...roomData.players, newPlayer],
        });
      } else {
        // Update tab list
        const existing = roomData.players.find((p) => p.id === playerId);
        const tabId = localStorage.getItem("tabId");
        if (tabId && existing) {
          const tabs = existing.tabs || [];
          if (!tabs.includes(tabId)) {
            const updatedPlayers = roomData.players.map((p) =>
              p.id === playerId ? { ...p, tabs: [...tabs, tabId] } : p
            );

            await updateDoc(roomDocRef, { players: updatedPlayers });
          }
        }
      }
    }

    navigate(`/game/${roomId}`);
  };

  return (
    <div
      className="min-h-screen w-full bg-cover bg-center bg-no-repeat jersey-25-regular flex flex-col items-center justify-center"
      style={{ backgroundImage: "url('/src/assets/Background.png')" }}
    >
      {/* Title */}
      <h1 className="text-5xl text-spellbound-navy mb-6">Spellbound</h1>

      <div className="flex justify-center px-4 sm:px-6 md:px-8 py-4">
        <div className="bg-white/80 border-3 border-spellbound-navy rounded-xl w-full max-w-lg">
          {/* Title Bar */}
          <div className="flex items-center justify-between bg-[#fc0744] border-b-3 border-[#052133] text-white px-3 py-1 rounded-t-lg select-none">
            <span className="text-lg">
              <i>user.exe</i>
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

          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* (Left Side) Avatar Generator */}
            <div className="flex flex-col items-center">
              <div className="relative p-1.5 border-3 border-spellbound-navy rounded-xl">
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="w-35 h-35 object-cover border-3 border-spellbound-navy rounded-xl"
                />
                <button
                  onClick={generateNewAvatar}
                  className="cursor-pointer absolute -top-3 -right-3 w-8 h-8 bg-[#ffd45e] text-spellbound-navy border-2 border-spellbound-navy rounded-full flex items-center justify-center shadow-md text-2xl active:translate-x-[4px] active:translate-y-[4px] transition-all"
                >
                  <MdRefresh />
                </button>
              </div>
            </div>

            {/* (Right Side) Name Field and Play Button */}
            <div className="flex flex-col justify-center">
              <label className="text-lg mb-1 text-spellbound-navy">Name</label>
              <input
                value={name}
                onChange={handleNameChange}
                className="text-lg border-2 border-[#052133] bg-white rounded-lg p-2 w-full focus:ring focus:ring-[#fc0744]"
                placeholder="Enter name..."
              />
              <button
                onClick={handlePlay}
                className="cursor-pointer mt-4 w-full text-white text-lg py-3 rounded-md bg-[#fc0744] border-2 border-[#052133] shadow-[4px_4px_0_#052133] active:shadow-[0_0_0_#052133] active:translate-x-[4px] active:translate-y-[4px] transition-all"
              >
                Play
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <p className="mt-6 text-sm text-spellbound-navy">made by Indigo</p>
    </div>
  );
}

export default Home;
