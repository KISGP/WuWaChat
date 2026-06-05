import ReactDOM from 'react-dom/client'

import { CharacterProvider } from './context/CharacterContext'
import { MemoryProvider } from './context/MemoryContext'
import { SessionProvider } from './context/SessionsContext'
import { SettingsProvider } from './context/SettingsContext'

import App from './App'

import './style/main.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <SettingsProvider>
    <MemoryProvider>
      <CharacterProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </CharacterProvider>
    </MemoryProvider>
  </SettingsProvider>
)
