use std::future::Future;
use std::time::Duration;

/// Retry delays in seconds: 10s, 20s, 30s, 60s
const RETRY_DELAYS: &[u64] = &[10, 20, 30, 60];

/// Executes a closure with progressive retry logic.
/// On failure, waits with increasing delays and retries.
/// If it succeeds at any point, returns the result immediately.
/// The delay sequence is: 10s, 20s, 30s, 60s, then gives up.
pub async fn retry_with_backoff<F, Fut, T>(mut f: F) -> Result<T, String>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, String>>,
{
    // First attempt
    match f().await {
        Ok(result) => return Ok(result),
        Err(e) => log::warn!("First attempt failed: {}", e),
    }

    // Retry with increasing delays
    for (attempt, &delay_secs) in RETRY_DELAYS.iter().enumerate() {
        log::info!(
            "Retry attempt {} - waiting {}s before retry...",
            attempt + 1,
            delay_secs
        );
        tokio::time::sleep(Duration::from_secs(delay_secs)).await;

        match f().await {
            Ok(result) => {
                log::info!("Retry attempt {} succeeded", attempt + 1);
                return Ok(result);
            }
            Err(e) => {
                log::warn!("Retry attempt {} failed: {}", attempt + 1, e);
                // If this is the last retry, the loop will end and we'll return the error
            }
        }
    }

    // All retries exhausted
    Err("Download failed after all retry attempts".to_string())
}
