use std::process::Command;

/**
 * Handles building JVM arguments and launching the game.
 */
pub struct LaunchService;

impl LaunchService {
    /**
     * Launches the game process.
     */
    pub fn launch(&self, _jvm_args: Vec<String>, _show_logs: bool) -> Result<(), String> {
        // Build Command and spawn.
        Ok(())
    }
}
