/**
 * Injects a JS bridge into the loaded WebView.
 */
pub fn inject_bridge(window: &tauri::Webview) -> Result<(), String> {
    let script = r#"
        (function() {
            if (window.__LAUNCHED_BRIDGE_INJECTED__) return;
            window.__LAUNCHED_BRIDGE_INJECTED__ = true;

            const idToCommand = {
                'playButton': 'launch_game',
                'sessionSwitcher': 'open_session_switcher',
                'loginButton': 'login_microsoft'
            };

            function findElementInShadow(id) {
                let el = document.getElementById(id);
                if (el) return el;
                const allElements = document.querySelectorAll('*');
                for (const element of allElements) {
                    if (element.shadowRoot) {
                        el = element.shadowRoot.getElementById(id);
                        if (el) return el;
                    }
                }
                return null;
            }

            function triggerTauriCommand(command, args = {}) {
                const p = (window.__TAURI__ && window.__TAURI__.invoke) 
                    ? window.__TAURI__.invoke(command, args)
                    : (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke)
                        ? window.__TAURI_INTERNALS__.invoke(command, args)
                        : null;

                if (p) {
                    p.catch(err => {
                        console.error('[Bridge] Command failed:', err);
                        alert('Error: ' + err);
                    });
                } else {
                    console.error('[Bridge] Tauri IPC not found. Command ignored:', command);
                }
            }

            // Listen for clicks on specific IDs
            document.addEventListener('click', (e) => {
                let command = idToCommand[e.target.id];
                if (!command) {
                    for (const [id, cmd] of Object.entries(idToCommand)) {
                        const target = findElementInShadow(id);
                        if (target && (target === e.target || target.contains(e.target))) {
                            command = cmd;
                            break;
                        }
                    }
                }

                if (command) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[Bridge] Triggering command:', command);
                    triggerTauriCommand(command, { showLogs: true });
                }
            }, true); // Use capture phase to catch events early

            console.log('[Bridge] Injected and listening.');
        })();
    "#;
    window.eval(script).map_err(|e| e.to_string())
}
