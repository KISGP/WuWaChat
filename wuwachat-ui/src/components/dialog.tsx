import * as DialogPrimitive from "@radix-ui/react-dialog";
import CloseIcon from "./close";
import { cn } from "../utils";
import BG2 from "../assets/T_CommonPopupBg2.png";
import Github from "../assets/github.png";
import { openUrl } from '@tauri-apps/plugin-opener';

interface DialogProps {
    isOpen: boolean;
    onClose: () => void;
    className?: string;
}

export default function Dialog({ isOpen, onClose, className }: DialogProps) {
    return (
        <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay
                    className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-300 ease-in-out"
                />

                {/* Wrap the content in a fixed inset container to center it like the original portal approach */}
                <div className="fixed inset-0 z-100 flex items-center justify-center pointer-events-none">
                    <DialogPrimitive.Content
                        className={cn(
                            "pointer-events-auto outline-none focus:outline-none relative flex gap-0.25 pr-0.5 h-fit w-186 flex-col border-l-8 border-r-3 border-b-3 rounded-sm border-white data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:slide-in-from-bottom-4 duration-300 ease-in-out",
                            className
                        )}
                        onPointerDownOutside={() => {
                            // Radix handles clicking outside to close
                        }}
                    >
                        {/* 顶部拖拽区域 & 关闭按钮 */}
                        <div
                            data-tauri-drag-region
                            className="relative h-14 shrink-0 w-full bg-white rounded-br-3xl"
                        >
                            <span className="absolute top-3 left-3 scale-90 z-100 text-2xl font-semibold">飞讯说明</span>
                            <CloseIcon
                                className="absolute top-2 right-4 scale-90 z-100"
                                onClick={onClose}
                            />

                            <img src={BG2} draggable="false" className="h-14 z-50 right-0 absolute object-cover invert" />
                        </div>

                        {/* 内容区域 */}
                        <div className="flex-1 relative min-h-96 w-full p-6 bg-[#FCFCFC] rounded-tr-3xl rounded-br-3xl px-12">
                            <span className="text-neutral-700 text-lg">飞讯是先行公约为终端开发的远程通讯程序，生活在索拉里斯的人们可以用飞讯互相联系。</span>

                            <div className="absolute bottom-4 flex gap-2 items-center">
                                <img src={Github} className="size-5" />
                                <span>项目链接：</span>
                                <span className="hover:text-[#e8c690] cursor-pointer" onClick={async () => await openUrl('https://github.com/wuwachat/wuwacha')}>https://github.com/wuwachat/wuwacha</span>
                            </div>
                        </div>
                    </DialogPrimitive.Content>
                </div>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
