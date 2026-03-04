import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { toast } from "react-toastify";
import { useSettings } from "../../context/SettingsContext";
import { getSupportedModels } from "../../api";
import { cn } from "../../utils";
import { useAsyncAction } from "../../hooks/useAsyncAction";

export function ModelTab() {
    const { settings, updateSettings, updateLLMProviderConfig } = useSettings();
    const [supportedModels, setSupportedModels] = useState<string[]>([]);
    const [testMessage, setTestMessage] = useState("");

    const selectedProvider = settings.activeLLMProvider;

    const currentConfig = settings.LLMProviderConfigs[selectedProvider] || {
        modelId: "",
        apiKey: "",
    };

    const { status: testStatus, data, run: runTestConnection, setStatus: setTestStatus } = useAsyncAction(
        async () => {
            const { testConnection } = await import("../../api");
            return await testConnection(selectedProvider, currentConfig.modelId, currentConfig.apiKey);
        },
        {
            onSuccess: (result) => {
                setTestMessage(result.message);
                if (result.status === "success") {
                    toast.success("测试连接成功");
                    setTimeout(() => setTestStatus("idle"), 5000);
                } else {
                    toast.error("测试连接失败");
                    // The hook catch block won't catch it if the function doesn't throw,
                    // so we still manually adjust our visual status here state if it is a 'failure' response
                }
            },
            onError: () => {
                setTestMessage("请求遇到网络错误");
            }
        }
    );

    useEffect(() => {
        getSupportedModels()
            .then(async (models) => {
                const defaultModels =
                    models.length > 0
                        ? models
                        : ["ollama", "gemini", "deepseek", "openai", "anthropic"];
                setSupportedModels(defaultModels);

                if (!settings.activeLLMProvider) {
                    updateSettings({ activeLLMProvider: defaultModels[0] });
                }
            })
            .catch((err) => {
                console.error("Failed to fetch models", err);
                const fallback = [
                    "ollama",
                    "gemini",
                    "deepseek",
                    "openai",
                    "anthropic",
                ];
                setSupportedModels(fallback);
                if (!settings.activeLLMProvider) {
                    updateSettings({ activeLLMProvider: fallback[0] });
                }
            });
    }, []);

    return (
        <div className="flex h-full w-full px-6">
            <div className="flex w-1/3 flex-col gap-1 overflow-y-auto border-r border-white/10 p-2">
                {supportedModels.map((model) => (
                    <button
                        key={model}
                        onClick={() => {
                            updateSettings({ activeLLMProvider: model });
                            toast.success(`已切换至 ${model}`);
                        }}
                        className={cn(
                            "flex h-13 items-center justify-between overflow-hidden rounded border px-3 py-2 text-left transition-colors",
                            selectedProvider === model
                                ? "bg-white/10 text-[#e8c690]"
                                : "text-white/70 hover:bg-white/5",
                        )}
                    >
                        <span className="capitalize">{model}</span>
                        {selectedProvider === model && <Check className="size-4" />}
                    </button>
                ))}
            </div>

            <div className="flex flex-1 flex-col gap-6 p-6">
                {selectedProvider ? (
                    <>
                        <div className="flex flex-col gap-2">
                            <label className="text-white/80">模型 ID (Model ID)</label>
                            <input
                                type="text"
                                value={currentConfig.modelId}
                                onChange={(e) =>
                                    updateLLMProviderConfig(selectedProvider, {
                                        modelId: e.target.value,
                                    })
                                }
                                className="rounded border border-white/20 bg-black/20 px-3 py-2 text-white transition-colors outline-none focus:border-[#e8c690]"
                                placeholder="例如: gpt-3.5-turbo"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-white/80">API Key</label>
                            <input
                                type="password"
                                value={currentConfig.apiKey}
                                onChange={(e) =>
                                    updateLLMProviderConfig(selectedProvider, {
                                        apiKey: e.target.value,
                                    })
                                }
                                className="rounded border border-white/20 bg-black/20 px-3 py-2 text-white transition-colors outline-none focus:border-[#e8c690]"
                                placeholder="sk-..."
                            />
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={runTestConnection}
                                disabled={!currentConfig.modelId || testStatus === "loading"}
                                className="rounded border border-white/20 bg-white/5 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:opacity-40"
                            >
                                {testStatus === "loading" ? "测试中..." : "测试连接"}
                            </button>

                            {testStatus === "success" && data?.status === "success" && (
                                <span className="text-sm text-green-400">✅ {testMessage}</span>
                            )}
                            {testStatus === "success" && data?.status === "error" && (
                                <span className="text-sm text-red-400">❌ {testMessage}</span>
                            )}
                            {testStatus === "error" && (
                                <span className="text-sm text-red-400">❌ {testMessage}</span>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex h-full items-center justify-center text-white/50">
                        请选择一个模型
                    </div>
                )}
            </div>
        </div>
    );
}
