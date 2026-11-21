import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource-variable/hanken-grotesk'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/ibm-plex-sans-arabic/400.css'
import '@fontsource/ibm-plex-sans-arabic/500.css'
import '@fontsource/ibm-plex-sans-arabic/600.css'
import '@fontsource/caveat/500.css'
import '@fontsource/amiri/400.css'
import '@fontsource/amiri/700.css'
import { App } from './App'
import { SettingsProvider } from './lib/settings'

document.documentElement.dataset.theme = localStorage.getItem('ff-theme') === 'dark' ? 'dark' : 'light'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </React.StrictMode>,
)
