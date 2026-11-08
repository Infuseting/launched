use std::{env, path::PathBuf, process::Command};

fn java_tool(name: &str) -> Command {
    let executable = format!("{name}{}", env::consts::EXE_SUFFIX);
    let path = env::var_os("JAVA_HOME")
        .map(PathBuf::from)
        .map(|home| home.join("bin").join(&executable))
        .filter(|path| path.is_file())
        .unwrap_or_else(|| PathBuf::from(executable));
    Command::new(path)
}

fn build_discord_agent() {
    println!("cargo:rerun-if-changed=java/DiscordPresenceAgent.java");
    println!("cargo:rerun-if-changed=java/discord-presence.mf");
    println!("cargo:rerun-if-env-changed=JAVA_HOME");

    let output = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    let status = java_tool("javac")
        .args(["--release", "8", "-d"])
        .arg(&output)
        .arg("java/DiscordPresenceAgent.java")
        .status()
        .expect("A JDK (Java 17 or newer) is required to build Launched's Discord agent");
    assert!(status.success(), "Could not compile the Discord agent");

    let status = java_tool("jar")
        .arg("cfm")
        .arg(output.join("discord-presence.jar"))
        .arg("java/discord-presence.mf")
        .arg("-C")
        .arg(&output)
        .arg("DiscordPresenceAgent.class")
        .status()
        .expect("The JDK jar tool is required to package the Discord agent");
    assert!(status.success(), "Could not package the Discord agent");
}

fn main() {
    build_discord_agent();
    tauri_build::build();
}
