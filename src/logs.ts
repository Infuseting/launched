import { listen } from "@tauri-apps/api/event";

document.addEventListener("DOMContentLoaded", () => {
    const logContainer = document.getElementById("log-container");
    let isFirstLog = true;
    const MAX_LINES = 5000;
    
    if (logContainer) {
        listen<string>("game-log", (event) => {
            if (isFirstLog) {
                logContainer.innerHTML = "";
                isFirstLog = false;
            }
            
            const entry = document.createElement("div");
            entry.className = "log-entry";
            entry.textContent = event.payload;
            
            // Highlight errors
            if (event.payload.includes("[ERROR]") || event.payload.toLowerCase().includes("error")) {
                entry.style.color = "#e74c3c";
            }
            
            logContainer.appendChild(entry);
            
            // Limit line count
            if (logContainer.children.length > MAX_LINES) {
                logContainer.removeChild(logContainer.firstChild!);
            }
            
            // Auto-scroll to bottom
            logContainer.scrollTop = logContainer.scrollHeight;
        });
    }
});
