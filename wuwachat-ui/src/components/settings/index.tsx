import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Tab from "../tab";
import SettingIcon from "../../assets/settingIcon.png";
import CloseIcon from "../close";
import { ModelTab } from "./ModelTab";
import { PromptTab } from "./PromptTab";
import { BackgroundTab } from "./BackgroundTab";
import { LogTab } from "./LogTab";

export default function Settings({ onClose }: { onClose?: () => void }) {
    const [activeTab, setActiveTab] = useState<string>("model");

    const handleClose = () => {
        if (onClose) {
            onClose();
        } else {
            getCurrentWindow().close();
        }
    };

    return (
        <div className="flex w-full flex-col font-sans overflow-hidden h-full">
            {/* 顶部标题栏 & 拖拽区 */}
            <div
                data-tauri-drag-region
                className="relative h-16 shrink-0 items-center justify-between"
            >
                <div
                    data-tauri-drag-region
                    className="absolute bottom-2 left-6 flex items-center gap-1"
                >
                    <img src={SettingIcon} className="size-8 object-contain" alt="" />
                    <span className="tracking-wider text-white">界面设置</span>
                </div>
                <CloseIcon className=" absolute bottom-2 right-6" onClick={handleClose} />
            </div>

            {/* Tab */}
            <div className="mx-8 mt-2 flex gap-2 border-b border-white/20 pb-2">
                <Tab
                    active={activeTab === "model"}
                    onClick={() => setActiveTab("model")}
                >
                    模型
                </Tab>
                <Tab
                    active={activeTab === "prompt"}
                    onClick={() => setActiveTab("prompt")}
                >
                    提示词
                </Tab>
                <Tab active={activeTab === "bg"} onClick={() => setActiveTab("bg")}>
                    聊天背景
                </Tab>
                <Tab active={activeTab === "log"} onClick={() => setActiveTab("log")}>
                    日志
                </Tab>
            </div>

            {/* 内容 */}
            <div className="h-148 overflow-hidden">
                {activeTab === "model" && <ModelTab />}
                {activeTab === "prompt" && <PromptTab />}
                {activeTab === "bg" && <BackgroundTab />}
                {activeTab === "log" && <LogTab />}
            </div>
        </div>
    );
}
