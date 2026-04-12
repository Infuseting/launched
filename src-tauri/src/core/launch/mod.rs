/**
 * Handles building JVM arguments and launching the game.
 */
pub mod args;

use std::process::{Command, Stdio};
use crate::core::launch::args::LaunchArguments;

pub struct LaunchService;

impl LaunchService {
    /**
     * Launches the game process.
     */
    pub fn launch(&self, args: LaunchArguments, show_logs: bool) -> Result<(), String> {
        let mut cmd = Command::new(&args.java_path);
        cmd.args(args.build());
        
        if show_logs {
            cmd.stdout(Stdio::inherit())
               .stderr(Stdio::inherit());
        } else {
            cmd.stdout(Stdio::null())
               .stderr(Stdio::null());
        }
        
        cmd.spawn().map_err(|e| e.to_string())?;
        
        Ok(())
    }
}
