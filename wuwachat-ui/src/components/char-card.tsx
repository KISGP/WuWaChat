import { useState } from "react";
import BG1 from "../assets/1.png";
import BG2 from "../assets/2.png";
import BG4 from "../assets/4.png";
import { cn } from "../utils";
import { useCharacter } from "../context/CharacterContext";
import { useSessions } from "../context/SessionsContext";
import ConversationItem from "./conversation-item";
import { nanoid } from 'nanoid'

export default function CharCard({ char }: { char: Char }) {
  const { activateChar, setActivateChar } = useCharacter();
  const { AllSessions, currentSessionId, setCurrentSessionId } = useSessions();
  const isActive = activateChar?.id == char.id;

  const [isHovering, setIsHovering] = useState(false);

  let currentBg = isActive ? BG4 : isHovering ? BG2 : BG1;

  return (
    <div className="flex flex-col gap-2 transition-all duration-300">
      <div
        className={cn(
          "h-fit w-full cursor-pointer rounded-sm border-2 border-transparent p-0.5 transition-all duration-200",
          !isActive
            ? "hover:scale-101 hover:border-white"
            : "border-transparent",
        )}
        onClick={() => setActivateChar(char)}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <div className="relative z-10 h-fit w-full cursor-pointer">
          <img src={currentBg} className="object-contain" draggable="false" />

          <img
            src={char.avatar}
            className="pointer-events-none absolute top-2 left-4 size-15"
            draggable="false"
          />

          <span
            className={cn(
              "pointer-events-none absolute top-3.5 left-26 text-lg font-semibold",
              isActive
                ? "text-black"
                : isHovering
                  ? "text-black/60"
                  : "text-white",
            )}
          >
            {char.name}
          </span>
        </div>
      </div>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          isActive ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className={cn(!isActive && "hidden")}>
          <div className="flex flex-col gap-2 px-1">
            {AllSessions.find((item) => item.char_id === char.id)?.sessions.map(
              (session) => (
                <ConversationItem
                  key={session.session_id}
                  content={session.last_message.content}
                  isActive={session.session_id === currentSessionId}
                  onClick={() => {
                    setCurrentSessionId(session.session_id);
                  }}
                />
              ),
            )}
            <ConversationItem isNew onClick={() => {
              setActivateChar(char)
              setCurrentSessionId(nanoid())
            }} />
          </div>
        </div>
      </div>
    </div>
  );
}
