import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { useCharacter } from "../../context/CharacterContext";
import { getPrompt } from "../../api";
import { cn } from "../../utils";
import { useAsyncAction } from "../../hooks/useAsyncAction";

export function PromptTab() {
    const { characters: chars } = useCharacter();
    const [selectedCharId, setSelectedCharId] = useState<string>("");
    const [promptText, setPromptText] = useState<string>("");

    const { loading: isSaving, status: saveStatus, run: handleSave, setStatus: setSaveStatus } = useAsyncAction(
        async () => {
            if (!selectedCharId) throw new Error("No character selected");
            const { updatePrompt } = await import("../../api");
            await updatePrompt(selectedCharId, promptText);
        },
        {
            successMessage: "提示词保存成功",
            errorMessage: "提示词保存失败",
            onSuccess: () => {
                setTimeout(() => setSaveStatus("idle"), 2000);
            }
        }
    );

    useEffect(() => {
        if (chars.length > 0 && !selectedCharId) {
            setSelectedCharId(chars[0].id);
        }
    }, [chars, selectedCharId]);

    useEffect(() => {
        if (selectedCharId) {
            getPrompt(selectedCharId)
                .then((text) => setPromptText(text))
                .catch((err) => {
                    console.error("Failed to load prompt:", err);
                    setPromptText("");
                });
            setSaveStatus("idle");
        }
    }, [selectedCharId, setSaveStatus]);

    return (
        <div className="flex h-full w-full px-6">
            <div className="flex w-1/3 flex-col gap-1 border-r border-white/10 p-2">
                <div className="scrollbar-thin flex flex-1 flex-col gap-1 overflow-y-auto pr-1">
                    {chars.map((char) => (
                        <button
                            key={char.id}
                            onClick={() => setSelectedCharId(char.id)}
                            className={cn(
                                "relative flex h-13 items-center justify-between overflow-hidden rounded border px-3 py-2 text-left transition-colors",
                                selectedCharId === char.id
                                    ? "bg-white/10 text-[#e8c690]"
                                    : "text-white/70 hover:bg-white/5",
                            )}
                        >
                            <span className="capitalize ml-24 z-10">{char.name}</span>
                            {selectedCharId === char.id && <Check className="size-4 z-10" />}
                            {char.card_bg && (
                                <img
                                    src={char.card_bg}
                                    className="absolute top-0 left-0 bottom-0 object-contain z-0"
                                    alt=""
                                />
                            )}
                        </button>
                    ))}
                    {chars.length === 0 && (
                        <div className="py-4 text-center text-sm text-white/50">
                            暂无角色
                        </div>
                    )}
                </div>
            </div>

            {/* 右侧极简编辑器 */}
            <div className="flex flex-1 flex-col p-6">
                {selectedCharId ? (
                    <div className="group relative flex h-full flex-col">
                        <div className="mb-3 flex items-center gap-4 px-1">
                            <div className="size-14 shrink-0 overflow-hidden rounded-full border border-white/20 bg-black/50">
                                <img
                                    src={chars.find((c) => c.id === selectedCharId)?.avatar}
                                    className="size-full object-cover"
                                    alt=""
                                />
                            </div>

                            <div className="flex flex-1 flex-col justify-center gap-1.5">
                                <span className="text-sm font-medium text-white/80">
                                    {chars.find((c) => c.id === selectedCharId)?.name || selectedCharId}
                                </span>
                                <span className="font-mono text-xs text-white/40">
                                    提示词设定
                                </span>
                            </div>
                        </div>
                        <textarea
                            value={promptText}
                            onChange={(e) => {
                                setPromptText(e.target.value);
                                setSaveStatus("idle");
                            }}
                            className="scrollbar-thin w-full flex-1 resize-none rounded border border-white/10 bg-black/40 p-4 text-sm leading-relaxed text-white/90 transition-colors outline-none focus:border-[#e8c690]"
                            placeholder="在这里编写角色的设定 Prompt..."
                        />
                        {/* 保存按钮在右下角悬浮 */}
                        <div className="absolute right-4 bottom-4 flex items-center gap-3">
                            {saveStatus === "success" && (
                                <span className="text-xs text-green-400">保存成功</span>
                            )}
                            {saveStatus === "error" && (
                                <span className="text-xs text-red-400">保存失败</span>
                            )}

                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="rounded bg-[#e8c690]/90 px-4 py-1.5 text-sm font-medium text-black shadow-lg transition-colors hover:bg-[#e8c690] disabled:opacity-50"
                            >
                                {isSaving ? "保存中..." : "保存"}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex h-full items-center justify-center text-white/50">
                        请选择一个角色
                    </div>
                )}
            </div>
        </div>
    );
}
