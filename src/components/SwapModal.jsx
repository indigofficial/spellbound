import React from "react";
import { FaMinus } from "react-icons/fa6";
import { IoClose } from "react-icons/io5";
import { FaRegWindowRestore } from "react-icons/fa";

function SwapModal({ open, onSelect, onClose }) {
  if (!open) return null;

  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
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

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm jersey-25-regular flex items-center justify-center z-[999]">
      <div className="bg-white/80 border-3 border-[#052133] rounded-xl shadow-2xl w-[350px] overflow-hidden">
        {/* Title Bar */}
        <div className="flex items-center justify-between bg-[#fc0744] border-b-3 border-[#052133] text-white px-3 py-1 select-none">
          <span className="text-lg">
            <i>swap_letter.exe</i>
          </span>

          <div className="flex space-x-2">
            <button className="w-6 h-6 flex items-center justify-center border-2 border-[#052133] bg-white text-[#052133] rounded">
              <FaMinus />
            </button>
            <button className="w-6 h-6 flex items-center justify-center border-2 border-[#052133] bg-white text-[#052133] rounded">
              <FaRegWindowRestore />
            </button>
            <button
              className="cursor-pointer w-6 h-6 flex items-center justify-center border-2 border-[#052133] bg-[#0ec5ff] text-[#052133] rounded"
              onClick={onClose}
            >
              <IoClose />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-6 gap-2">
            {LETTERS.map((l) => (
              <button
                key={l}
                className="cursor-pointer py-2 bg-white border-2 border-[#052133] rounded text-lg font-medium transition flex flex-col items-center justify-center p-2"
                onClick={() => {
                  onSelect(l);
                  onClose();
                }}
              >
                <span className="text-xl font-bold">{l}</span>
                <span className="text-lg text-gray-600">
                  {LETTER_VALUES[l]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SwapModal;
