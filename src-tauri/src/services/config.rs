use std::env;

const DEFAULT_AI_PROVIDER: &str = "mock";

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub ai_provider: String,
}

impl AppConfig {
    pub fn load() -> Self {
        let ai_provider = normalize_provider(
            env::var("VITE_AI_PROVIDER").ok(),
            env::var("VITE_OPENAI_API_KEY").ok(),
            env::var("VITE_LAVA_API_KEY").ok(),
        );

        Self { ai_provider }
    }
}

/// Explicit `mock` / `openai` / legacy `lava`; otherwise OpenAI when a non-empty API key is set (`VITE_OPENAI_*` or legacy `VITE_LAVA_API_KEY`).
fn normalize_provider(
    provider: Option<String>,
    openai_api_key: Option<String>,
    legacy_lava_api_key: Option<String>,
) -> String {
    let has_key = [openai_api_key, legacy_lava_api_key]
        .into_iter()
        .flatten()
        .any(|s| !s.trim().is_empty());
    match provider.as_deref().map(str::trim) {
        Some("mock") => "mock".to_string(),
        Some("openai") | Some("lava") => {
            if has_key {
                "openai".to_string()
            } else {
                DEFAULT_AI_PROVIDER.to_string()
            }
        }
        Some(_) | None => {
            if has_key {
                "openai".to_string()
            } else {
                DEFAULT_AI_PROVIDER.to_string()
            }
        }
    }
}
