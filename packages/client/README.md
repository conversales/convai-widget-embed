![hero](../../assets/hero.png)

# Conversales TypeScript SDK

Build multimodal agents with [Conversales](https://conversales.in).

A TypeScript / JavaScript client library for using Conversales agents, or as a base for framework-specific libraries. If you're using React, consider using the React package in this repo instead.

## Installation

```shell
npm install @elevenlabs/client
```

## Quick Start

```js
import { Conversation } from "@elevenlabs/client";

const conversation = await Conversation.startSession({
  agentId: "agent_7101k5zvyjhmfg983brhmhkd98n6", // replace with your agent's ID
  onConnect: ({ conversationId }) => {
    console.log("Connected:", conversationId);
  },
  onDisconnect: () => {
    console.log("Disconnected");
  },
  onMessage: (message) => {
    console.log("Message:", message);
  },
  onAgentResponseCorrection: ({ original_agent_response, corrected_agent_response }) => {
    console.log("Agent response corrected:", original_agent_response, "->", corrected_agent_response);
  },
  onError: (message) => {
    console.error("Error:", message);
  },
});

// End the conversation
await conversation.endSession();
```

## Documentation

For product details and repo-level guidance, see the root README or visit [conversales.in](https://conversales.in).

## Development

Please refer to the README.md file in the root of this repository.

## Contributing

Please create an issue first to discuss the proposed changes. Any contributions are welcome!

Remember, if merged, your code will be used as part of a MIT licensed project. By submitting a Pull Request, you are giving your consent for your code to be integrated into this library.
