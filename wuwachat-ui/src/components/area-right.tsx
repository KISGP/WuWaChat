import { useState, useRef, useEffect, useCallback } from "react";
import { useCharacter } from "../context/CharacterContext";
import { useSessions } from "../context/SessionsContext";
import { List, useDynamicRowHeight } from "react-window";
import { sendMessage, getSessionHistory, getAllSessions } from "../api";
import { cn } from "../utils";
import { Send, StopCircle } from "lucide-react";

import bgAvatar from "../assets/avatar-bg.png";
import bgRight from "../assets/T_PhoneSystemPanel_01.png";
import bgChar from "../assets/T_PhoneSystemModel03.png";
import bgLine from "../assets/T_PhoneSystemModel03Line.png";
import playerAvatar from "../assets/T_IconRoleHeadCircle256_5_a_UI.png";

import { type RowComponentProps } from "react-window";
import { useSettings } from "../context/SettingsContext";

interface Message {
  type: "human" | "AIMessageChunk";
  content: string;
  isPending?: boolean;
}

function MessageItem({
  index,
  messages,
  activateChar,
  style,
}: RowComponentProps<{
  messages: Message[];
  activateChar: Char;
}>) {
  const message = messages[index];
  const isUserMessage = message.type === "human";
  return (
    <div
      className={cn("flex gap-1", isUserMessage && "flex-row-reverse gap-5")}
      style={style}
    >
      {/* 头像 */}
      <div className={cn("relative size-15", isUserMessage ? "mr-4" : "ml-4")}>
        <img src={bgAvatar} />
        <img
          src={isUserMessage ? playerAvatar : activateChar?.avatar}
          className="absolute top-0.5 left-0.5 size-14"
          draggable="false"
        />
      </div>
      {/* 内容 */}
      <div
        className={cn(
          "flex flex-col",
          isUserMessage ? "items-end" : "items-start",
        )}
      >
        {/* 名字 */}
        <div>
          <span
            className={cn(
              "mt-2 block text-sm font-[550] text-[#555]/70",
              isUserMessage ? "float-" : "ml-2",
            )}
          >
            {isUserMessage ? "漂泊者" : activateChar?.name}
          </span>
        </div>
        {/* 消息框 */}

        <div className="relative mt-1 ml-4 max-w-md drop-shadow-[0_1px_2px_rgba(0,0,0,0.05)] filter">
          <div
            className={cn(
              "absolute -top-[0.25px] z-10 h-5 w-5 border-t border-[#e5e7eb]",
              isUserMessage
                ? "-right-5 bg-[radial-gradient(circle_at_100%_100%,transparent_19px,#393C4B_19.5px,#393C4B_20.5px,#393C4B_20.5px)]"
                : "-left-5 bg-[radial-gradient(circle_at_0_100%,transparent_19px,#e5e7eb_19.5px,#e5e7eb_20.5px,white_20.5px)]",
            )}
          />
          <div
            className={cn(
              "min-h-12  px-5 py-3 text-[#333]",
              isUserMessage
                ? "rounded-tl-md rounded-br-md rounded-bl-xl bg-[#393C4B] text-white"
                : "rounded-tr-md rounded-br-xl rounded-bl-md bg-white text-[#333]",
            )}
          >
            {message.isPending ? (
              <div className="flex h-6 items-center gap-1 px-1">
                <div className="size-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
                <div className="size-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
                <div className="size-2 animate-bounce rounded-full bg-gray-400" />
              </div>
            ) : (
              <p className="text-[15px] leading-relaxed font-medium tracking-wide select-text">
                {message.content}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MessagesList({ messages }: { messages: Message[] }) {
  const { activateChar } = useCharacter();

  const rowHeight = useDynamicRowHeight({
    defaultRowHeight: 80,
  });

  if (!activateChar) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        请选择一个角色开始聊天
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        开始新的一轮对话...
      </div>
    );
  }

  return (
    <List
      className="scrollbar-thin"
      rowComponent={MessageItem}
      rowCount={messages.length}
      rowHeight={rowHeight}
      rowProps={{ messages, activateChar }}
    />
  );
}

function InputArea({
  onSendMessage,
  onStop,
  isLoading,
  charId,
}: {
  onSendMessage: (message: string) => void;
  onStop?: () => void;
  isLoading: boolean;
  charId?: string;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (input.trim() && !isLoading && charId) {
      onSendMessage(input);
      setInput("");
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="absolute right-10 bottom-8 left-14 flex h-14 items-center gap-2 rounded-xl border-2 border-[#e5e7eb] bg-white/40 px-2 backdrop-blur-sm transition-colors focus-within:bg-white/90 hover:bg-white/60">
      <input
        ref={inputRef}
        type="text"
        placeholder="发送消息..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyUp={handleKeyPress}
        disabled={isLoading || !charId}
        className="h-full flex-1 bg-transparent px-3 text-[#333] outline-none placeholder:text-gray-400 disabled:opacity-50"
      />
      <button
        onClick={isLoading ? onStop : handleSend}
        disabled={(!input.trim() || !charId) && !isLoading}
        className="flex size-10 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-[#333] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? (
          <div className="group relative flex size-10 items-center justify-center">
            <div className="absolute size-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600 group-hover:opacity-0" />
            <StopCircle
              size={20}
              className="absolute size-4 opacity-0 transition-opacity group-hover:opacity-100"
            />
          </div>
        ) : (
          <Send size={20} />
        )}
      </button>
    </div>
  );
}

export default function AreaRight() {
  const { activateChar } = useCharacter();
  const { currentSessionId, setAllSessions, AllSessions } = useSessions();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const listRef = useRef(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { settings } = useSettings();

  useEffect(() => {
    if (!activateChar?.id) {
      return;
    }
    if (!currentSessionId) {
      setMessages([]);
      return;
    }

    // 只有已存在的会话才查询历史，新建的跳过
    const sessionExists = AllSessions.find((s) => s.char_id === activateChar.id)?.sessions.some((s) => s.session_id === currentSessionId);
    if (!sessionExists) {
      setMessages([]);
      return;
    }

    getSessionHistory(activateChar.id, currentSessionId).then((history) => {
      setMessages(history.messages);
    });
  }, [activateChar?.id, currentSessionId]);

  const handleStop = useCallback(() => {
    if (!abortControllerRef.current) return;

    abortControllerRef.current.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
  }, [abortControllerRef.current]);

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!activateChar?.id) return;

      const provider = settings.activeLLMProvider;
      const config = settings.LLMProviderConfigs[provider] || {};

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // 添加用户消息和 pending AI 消息
      setMessages((prev) => [
        ...prev,
        {
          type: "human",
          content: text,
        },
        {
          type: "AIMessageChunk",
          content: "",
          isPending: true,
        },
      ]);
      setIsLoading(true);

      // 收集 AI 响应
      let aiResponse = "";
      try {
        await sendMessage({
          text,
          charId: activateChar.id,
          sessionId: currentSessionId,
          modelType: provider,
          modelId: config.modelId || "",
          apiKey: config.apiKey,
          signal: controller.signal,
          onChunk: (chunk) => {
            aiResponse += chunk;
            // 实时更新消息
            setMessages((prev) => {
              const updated = [...prev];
              // 更新最后一条消息（即 pending 消息）
              const targetIndex = updated.length - 1;
              // 确保我们是在更新正确的消息
              if (
                updated[targetIndex] &&
                updated[targetIndex].type === "AIMessageChunk"
              ) {
                updated[targetIndex] = {
                  type: "AIMessageChunk",
                  content: aiResponse,
                  isPending: false, // 收到数据，移除 pending 状态
                };
              }
              return updated;
            });
          },
          onError: (error) => {
            if (error.name === "AbortError") {
              console.log("Chat aborted");
              // 如果中断时消息仍处于 pending 状态（未收到任何内容），则移除该消息和用户消息
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.type === "AIMessageChunk" && last.isPending) {
                  return prev.slice(0, -2); // 移除用户消息和 pending AI 消息
                }
                return prev;
              });
              return;
            }
            console.error("Failed to send message:", error);
            // 移除 pending 消息
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.type === "AIMessageChunk" && last.isPending) {
                return prev.slice(0, -2); // 移除用户消息和 pending AI 消息
              }
              return prev;
            });
            setIsLoading(false);
          },
          onComplete: () => {
            setIsLoading(false);
            abortControllerRef.current = null;

            getAllSessions().then((sessions) => {
              setAllSessions(sessions);
            });
          },
        });
      } catch (error) {
        setIsLoading(false);
      }
    },
    [activateChar?.id, currentSessionId, setAllSessions, settings],
  );

  return (
    <div className="relative h-156 w-205">
      <div className="relative h-156 w-205">
        <img
          src={bgRight}
          className="absolute top-0 left-0 object-contain drop-shadow-[0_0_0_#ffffff]"
          draggable="false"
        />

        <img
          src={bgChar}
          className="absolute top-1 left-2 z-10 scale-95 object-contain"
          draggable="false"
        />
        <img
          src={bgLine}
          className="absolute top-21 left-2 z-10 scale-95 object-contain"
          draggable="false"
        />
      </div>

      <span className="absolute top-4 left-12 z-20 text-lg font-semibold">
        {activateChar?.name}
      </span>

      <div className="absolute top-26 right-3 bottom-24 left-4" ref={listRef}>
        <MessagesList messages={messages} />
      </div>

      <InputArea
        onSendMessage={handleSendMessage}
        onStop={handleStop}
        isLoading={isLoading}
        charId={activateChar?.id}
      />
    </div>
  );
}
