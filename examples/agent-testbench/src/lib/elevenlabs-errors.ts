export const MISSING_API_KEY_MESSAGE =
  "Missing ELEVENLABS_API_KEY. Add it to examples/agent-testbench/.env.local before starting the testbench.";

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.includes("ELEVENLABS_API_KEY")) {
    return MISSING_API_KEY_MESSAGE;
  }
  return fallback;
}
