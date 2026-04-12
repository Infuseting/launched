use std::path::PathBuf;

pub struct LaunchArguments {
    pub java_path: PathBuf,
    pub jvm_args: Vec<String>,
    pub classpath: Vec<PathBuf>,
    pub main_class: String,
    pub minecraft_args: Vec<String>,
}

impl LaunchArguments {
    pub fn build(&self) -> Vec<String> {
        let mut args = self.jvm_args.clone();
        
        // Add classpath
        args.push("-cp".to_string());
        let cp = self.classpath.iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect::<Vec<String>>()
            .join(if cfg!(windows) { ";" } else { ":" });
        args.push(cp);
        
        // Add main class
        args.push(self.main_class.clone());
        
        // Add Minecraft args
        args.extend(self.minecraft_args.clone());
        
        args
    }
}
