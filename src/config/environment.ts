export function checkEnvironmentVariables() {
  if (!process.env.OPENAI_API_KEY) {
    console.warn(
      "OPENAI_API_KEY is not set. Will rely on routing-config based key selection if configured."
    );
  }

  if (!process.env.OPENAI_MODEL) {
    console.warn(
      "OPENAI_MODEL environment variable is not set, using default gpt-4.1"
    );
  }
}
