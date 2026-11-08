import java.io.IOException;

public final class DiscordPresenceAgent {
    // The JVM owns the writer. Even a forced exit closes it and wakes the worker.
    private static Process worker;

    public static void premain(String options) {
        try {
            String executable = System.getenv("LAUNCHED_DISCORD_WORKER");
            if (executable == null) {
                return;
            }
            ProcessBuilder command = new ProcessBuilder(executable, "--discord-presence-worker")
                    .redirectOutput(ProcessBuilder.Redirect.INHERIT)
                    .redirectError(ProcessBuilder.Redirect.INHERIT);
            String libraryPath = System.getenv("LAUNCHED_DISCORD_LIBRARY_PATH");
            if (libraryPath != null) {
                // The game has an isolated library path for its JRE.
                if (libraryPath.isEmpty()) {
                    command.environment().remove("LD_LIBRARY_PATH");
                } else {
                    command.environment().put("LD_LIBRARY_PATH", libraryPath);
                }
            }
            worker = command.start();
        } catch (IOException | RuntimeException | LinkageError error) {
            System.err.println("[Launched] Discord Rich Presence: " + error.getMessage());
        }
    }
}
