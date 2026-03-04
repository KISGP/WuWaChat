import ReactDOM from "react-dom/client";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { CharacterProvider } from "./context/CharacterContext";
import { SessionProvider } from "./context/SessionsContext";
import { SettingsProvider } from "./context/SettingsContext";

import App from "./App";

import "./style.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <SettingsProvider>
    <CharacterProvider>
      <SessionProvider>
        <App />
        <ToastContainer
          position="top-center"
          autoClose={2000}
          hideProgressBar
          theme="dark"
          pauseOnHover={false}
          toastClassName="!min-h-0 !py-2 !px-4 !rounded-md text-sm border border-white/10 !bg-black/80 backdrop-blur-md"
        />
      </SessionProvider>
    </CharacterProvider>
  </SettingsProvider>
);
