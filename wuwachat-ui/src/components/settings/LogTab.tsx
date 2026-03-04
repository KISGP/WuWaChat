import { useEffect, useState, useRef } from "react";
import { getLogs } from "../../api";

export function LogTab() {
    const [logs, setLogs] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const logContainerRef = useRef<HTMLDivElement>(null);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const data = await getLogs(200);
            setLogs(data);
        } catch (error) {
            console.error("Failed to fetch logs:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div className="flex h-full flex-col px-8 py-4">
            <div className="flex items-center justify-between pb-4">
                <span className="text-white">系统日志</span>
                <button
                    onClick={fetchLogs}
                    disabled={loading}
                    className="rounded bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20 disabled:opacity-50"
                >
                    {loading ? "刷新中..." : "刷新"}
                </button>
            </div>
            
            <div 
                ref={logContainerRef}
                className="flex-1 overflow-y-auto rounded bg-black/30 p-4 font-mono text-sm text-white/80"
            >
                {logs.length === 0 ? (
                    <div className="text-white/50">暂无日志</div>
                ) : (
                    logs.map((log, index) => (
                        <div key={index} className="whitespace-pre-wrap py-0.5">
                            {log}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
