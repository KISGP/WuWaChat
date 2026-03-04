import { useState } from "react";
import { cn } from "../utils";
import MessageIcon from "../assets/message.png";
import CharBgActived from "../assets/char_bg.png";
import CharBgUnfocused from "../assets/char_bg_2.png";
import CharBgHovering from "../assets/char_bg_3.png";
import { Plus } from "lucide-react";

type ConversationItemProps = {
  content?: string;
  isNew?: boolean;
  isActive?: boolean;
  onClick?: () => void;
};

export default function ConversationItem({
  content,
  isActive,
  onClick,
  isNew,
}: ConversationItemProps) {
  const [isHovering, setIsHovering] = useState(false);

  return (
    <div
      className={cn(
        "group relative ml-6.5 inline-block h-12 w-min cursor-pointer rounded-sm border-2 border-transparent p-0.5 transition-all duration-200",
        !isActive && isHovering && "border-white hover:scale-101",
      )}
      onClick={onClick}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div className="h-10 w-62.5">
        <img
          src={
            isActive
              ? CharBgActived
              : isHovering
                ? CharBgHovering
                : CharBgUnfocused
          }
          className="h-full w-auto max-w-none object-contain"
        />
      </div>

      {isNew && (
        <div className="absolute top-0 right-0 bottom-0 left-0 flex items-center justify-center">
          <Plus
            className={cn("size-4", isHovering ? "text-black" : "text-white")}
          />
        </div>
      )}

      {!isNew && (
        <>
          <img
            src={MessageIcon}
            className={cn(
              "absolute top-2 left-3 size-7",
              !isActive && isHovering && "invert-50",
            )}
          />

          <div className="absolute top-0 right-4 bottom-1 flex w-44 items-center text-sm font-medium text-white/60">
            <span
              className={cn(
                "truncate",
                isActive && "text-white",
                !isActive && isHovering && "text-black/80",
              )}
            >
              {content}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
