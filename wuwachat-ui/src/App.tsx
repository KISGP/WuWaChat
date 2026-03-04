import { useState } from "react";
import Header from "./components/header";
import AreaLeft from "./components/area-left";
import AreaRight from "./components/area-right";
import Settings from "./components/settings";

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="relative h-screen w-full overflow-hidden">
      <div
        className={`absolute inset-0 transition-all duration-300 ease-in-out ${isSettingsOpen ? "translate-y-4 opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
          }`}
      >
        <Header onOpenSettings={() => setIsSettingsOpen(true)} />
        <div className="flex justify-center pb-5">
          <AreaLeft />
          <AreaRight />
        </div>
      </div>

      <div
        className={`absolute inset-0 transition-all duration-300 ease-in-out ${isSettingsOpen ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 pointer-events-none"
          }`}
      >
        <div className="flex h-full w-full overflow-hidden bg-black/60 backdrop-blur-md">
          <Settings onClose={() => setIsSettingsOpen(false)} />
        </div>
      </div>
    </div>
  );
}

export default App;
