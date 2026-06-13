import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import "./styles.css"

// In the Electron shell the window is frameless (titleBarStyle: hiddenInset),
// so the app reserves room for the macOS traffic lights and owns the drag region.
if (navigator.userAgent.includes("Electron")) {
  document.documentElement.dataset["platform"] = "desktop"
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
