import React from "react";

function Tile({
  tile,
  onDragOver,
  onDragStart,
  onTileClick,
  isSelected,
  isAnimating,
  swapSelectable,
  isShuffling,
  isSwapping,
}) {
  return (
    <div
      className={`transition-all duration-300 ${
        isShuffling ? "rotate-180 scale-75 opacity-50" : ""
      } 
        tile relative select-none w-full h-full text-white jersey-25-regular rounded-2xl flex items-center justify-center
        ${
          isSelected
            ? "bg-[#0ec5ff] border-t-2 border-b-8 border-l-2 border-r-8 border-[#23548d]"
            : "bg-[#163e57] border-t-2 border-b-8 border-l-2 border-r-8 border-[#052133] shadow"
        }
        ${tile.bonus === "2X" ? "ring-4 ring-[#fc0744]" : ""}
        ${
          swapSelectable
            ? "ring-2 ring-[#fdbc08] cursor-pointer"
            : "cursor-default"
        }
        ${isSwapping ? "rotate-y-180 scale-110" : ""}
      `}
      onMouseDown={() => !swapSelectable && onDragStart(tile.id)}
      onMouseEnter={() => !swapSelectable && onDragOver(tile.id)}
      onClick={() => {
        if (swapSelectable && onTileClick) onTileClick(tile.id);
      }}
    >
      <span
        className={`tile-content transition-opacity duration-300 ${
          isAnimating ? "opacity-0" : "opacity-100"
        } text-xl sm:text-xl md:text-2xl lg:text-3xl`}
      >
        {tile.letter}

        <div className="value absolute bottom-1 right-1 sm:right-1 md:right-2 lg:right-3 text-white/70 text-[0.6rem] sm:text-xs md:text-sm lg:text-base">
          {tile.value}
        </div>

        {tile.token && (
          <div className="absolute bottom-0 left-1 sm:left-1 md:left-2 lg:left-3 text-[#fdbc08] text-[0.6rem] sm:text-xs md:text-sm lg:text-base">
            •
          </div>
        )}
      </span>

      {/* Bonus Circle */}
      {tile.bonus === "TL" && (
        <div className="absolute -top-1 -right-1 sm:-top-1 sm:-right-1 md:-top-2 md:-right-2 lg:-top-2 lg:-right-2 bg-[#fdbc08] text-[#163e57] text-[0.6rem] sm:text-xs md:text-sm lg:text-base font-bold tracking-wide px-2 py-1 rounded-full">
          TL
        </div>
      )}
      {tile.bonus === "2X" && (
        <div className="absolute -top-1 -right-1 sm:-top-1 sm:-right-1 md:-top-2 md:-right-2 lg:-top-2 lg:-right-2 bg-[#fc0744] text-white text-[0.6rem] sm:text-xs md:text-sm lg:text-base font-bold tracking-wide px-2 py-1 rounded-full">
          2X
        </div>
      )}
    </div>
  );
}

export default Tile;
