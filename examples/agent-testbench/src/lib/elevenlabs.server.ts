import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export type { ElevenLabs } from "@elevenlabs/elevenlabs-js";

const missingApiKeyMessage =
  "Missing ELEVENLABS_API_KEY. Add it to examples/agent-testbench/.env.local before starting the testbench.";

let client: ElevenLabsClient | null = null;

export function getElevenLabsClient() {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(missingApiKeyMessage);
  }

  if (!client) {
    client = new ElevenLabsClient({ apiKey });
  }

  return client;
}

export function getMissingApiKeyMessage() {
  return missingApiKeyMessage;
}
