import Close from "../assets/close.png";
import { cn } from "../utils";

export default function MinIcon({ className, onClick }: { className?: string, onClick?: () => void }) {
    return (
        <div className={cn("group z-10 size-10 cursor-pointer scale-90", className)} onClick={onClick}>
            <div className="relative size-full">
                <img
                    src={Close}
                    alt="close"
                    className="absolute rotate-45 top-3 right-0 size-4 object-contain transition-transform duration-200 group-hover:translate-x-0.5 "
                />
                <img
                    src={Close}
                    alt="close"
                    className="absolute top-3 right-6 size-4 rotate-225 object-contain transition-transform duration-200 group-hover:-translate-x-0.5"
                />
            </div>
        </div>
    );
}
