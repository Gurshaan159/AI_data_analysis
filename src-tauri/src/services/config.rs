use std::env;

const DEFAULT_LAVA_API_BASE_URL: &str = "http://localhost:3000";
const DEFAULT_AI_PROVIDER: &str = "mock";

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub lava_api_base_url: String,
    pub ai_provider: String,
}

impl AppConfig {
    pub fn load() -> Self {
        let lava_api_base_url = env::var("VITE_LAVA_API_BASE_URL")
            .or_else(|_| env::var("LAVA_API_BASE_URL"))
            .unwrap_or_else(|_| DEFAULT_LAVA_API_BASE_URL.to_string());
        let ai_provider = normalize_provider(env::var("VITE_AI_PROVIDER").ok());

        Self {
            lava_api_base_url,
            ai_provider,
        }
    }
}

fn normalize_provider(value: Option<String>) -> String {
    match value.as_deref() {
        Some("mock") => "mock".to_string(),
        Some("lava") => "lava".to_string(),
        _ => DEFAULT_AI_PROVIDER.to_string(),
    }
}
