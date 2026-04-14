import { listen } from "@tauri-apps/api/event";

document.addEventListener("DOMContentLoaded", () => {
    const logContainer = document.getElementById("log-container");
    
    if (logContainer) {
        listen<string>("game-log", (event) => {
            const entry = document.createElement("div");
            entry.className = "log-entry";
            entry.textContent = event.payload;
            logContainer.appendChild(entry);
            
            // Auto-scroll to bottom
            logContainer.scrollTop = logContainer.scrollHeight;
        });
    }
});
