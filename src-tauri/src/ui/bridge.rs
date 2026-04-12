/**
 * Injects a JS bridge into the loaded WebView.
 */
pub fn inject_bridge(window: &tauri::Window) -> Result<(), String> {
    let script = r#"
        document.addEventListener('click', (e) => {
            if (e.target.id === 'playButton') {
                window.__TAURI__.invoke('launch_game');
            }
        });
    "#;
    window.eval(script).map_err(|e| e.to_string())
}
