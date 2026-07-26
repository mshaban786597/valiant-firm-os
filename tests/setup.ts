// Global test setup. Ensure AI provider keys are absent so any code path that
// reaches the LLM layer deterministically falls back to rule-based output,
// keeping tests hermetic and offline.
delete process.env.OPENAI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
