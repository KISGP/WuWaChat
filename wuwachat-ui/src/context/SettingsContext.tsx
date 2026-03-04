import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { LazyStore } from '@tauri-apps/plugin-store';

const store = new LazyStore("settings.json");

export interface LLMProviderConfig {
    modelId: string;
    apiKey: string;
}

export interface AppSettings {
    activeLLMProvider: string;
    LLMProviderConfigs: Record<string, LLMProviderConfig>;
}

export interface SettingsContextType {
    settings: AppSettings;
    setSettings: (settings: AppSettings) => void;
    updateSettings: (partial: Partial<AppSettings>) => void;
    updateLLMProviderConfig: (
        provider: string,
        config: Partial<LLMProviderConfig>,
    ) => void;
}

const defaultSettings: AppSettings = {
    activeLLMProvider: "openai",
    LLMProviderConfigs: {
        openai: { modelId: "gpt-3.5-turbo", apiKey: "" },
    },
};

const SettingsContext = createContext<SettingsContextType | undefined>(
    undefined,
);

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<AppSettings>(defaultSettings);
    const [isLoaded, setIsLoaded] = useState(false);
    const isSyncingFromStoreRef = useRef(false);

    // 1. 初始化，从 store 加载数据，并监听跨窗口的数据变更
    useEffect(() => {
        let unlisten: (() => void) | undefined;

        const loadSettings = async () => {
            try {
                const storedSettings = await store.get<AppSettings>("appSettings");
                if (storedSettings) {
                    setSettings(storedSettings);
                }

                // 绑定跨窗口状态监听
                // 当 settings.json 中的 appSettings 发生变化时，如果不是当前窗口修改的，就同步过来
                unlisten = await store.onKeyChange<AppSettings>("appSettings", (newValue) => {
                    if (newValue) {
                        isSyncingFromStoreRef.current = true; // 告诉下方的 useEffect 别触发重新 save
                        setSettings(newValue);
                    }
                });

            } catch (error) {
                console.error("Failed to load settings from store:", error);
            } finally {
                setIsLoaded(true);
            }
        };
        loadSettings();

        // 组件卸载时取消监听，防止内存泄漏
        return () => {
            if (unlisten) {
                unlisten();
            }
        };
    }, []);

    // 2. 监听 settings 变化，如果是当前界面的交互行为，才自动保存到 store
    useEffect(() => {
        if (!isLoaded) return; // 避免初始化覆盖已有存档

        if (isSyncingFromStoreRef.current) {
            // 如果这次 render 是由 onKeyChange（别的窗口修改的）引起的，则直接跳过，把标志复位
            isSyncingFromStoreRef.current = false;
            return;
        }

        const saveSettings = async () => {
            try {
                await store.set("appSettings", settings);
                await store.save();
            } catch (error) {
                console.error("Failed to save settings to store:", error);
            }
        };
        saveSettings();
    }, [settings, isLoaded]);

    const updateSettings = (partial: Partial<AppSettings>) => {
        setSettings((prev) => ({ ...prev, ...partial }));
    };

    const updateLLMProviderConfig = (
        provider: string,
        config: Partial<LLMProviderConfig>,
    ) => {


        setSettings((prev) => ({
            ...prev,
            LLMProviderConfigs: {
                ...prev.LLMProviderConfigs,
                [provider]: {
                    ...(prev.LLMProviderConfigs[provider] || { modelId: "", apiKey: "" }),
                    ...config,
                },
            },
        }));
    };

    return (
        <SettingsContext.Provider
            value={{ settings, setSettings, updateSettings, updateLLMProviderConfig }}
        >
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error("useSettings must be used within a SettingsProvider");
    }
    return context;
}
