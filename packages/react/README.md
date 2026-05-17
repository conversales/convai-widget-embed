![hero](../../assets/hero.png)

# Conversales React SDK

Build multimodal agents with the [Conversales platform](https://conversales.in).

A React library for building voice and text conversations with Conversales. For React Native, use the companion package in this repo.

## Installation

```shell
npm install @elevenlabs/react
```

## Quick Start

```tsx
import {
  ConversationProvider,
  useConversationControls,
  useConversationStatus,
} from "@elevenlabs/react";

function App() {
  return (
    {/* replace with your agent's ID */}
    <ConversationProvider agentId="agent_7101k5zvyjhmfg983brhmhkd98n6">
      <Conversation />
    </ConversationProvider>
  );
}

function Conversation() {
  const { startSession, endSession } = useConversationControls();
  const { status } = useConversationStatus();

  return (
    <div>
      <p>Status: {status}</p>
      <button
        onClick={() =>
          startSession({
            onConnect: ({ conversationId }) =>
              console.log("Connected:", conversationId),
            onError: (message) => console.error("Error:", message),
          })
        }
      >
        Start
      </button>
      <button onClick={() => endSession()}>End</button>
    </div>
  );
}
```

## Documentation

For product details and repo-level guidance, see the root README or visit [conversales.in](https://conversales.in).

For real-time speech-to-text with the `useScribe` hook, review the client package and API docs referenced from the repo root.

## Development

Please refer to the README.md file in the root of this repository.

## Contributing

Please create an issue first to discuss the proposed changes. Any contributions are welcome!

Remember, if merged, your code will be used as part of a MIT licensed project. By submitting a Pull Request, you are giving your consent for your code to be integrated into this library.
