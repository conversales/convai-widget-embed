![hero](../../assets/hero.png)

# Conversales React Native SDK

Build multimodal agents with [Conversales](https://conversales.in) in React Native.

This package is the React Native companion to the React SDK in this repo. It re-exports the full conversation API and automatically configures the platform for voice conversations on React Native.

## Installation

```shell
npm install @elevenlabs/react-native @livekit/react-native @livekit/react-native-webrtc
```

The LiveKit peer dependencies provide the native WebRTC modules required for voice conversations in React Native.

> **Note:** This SDK requires Expo development builds. Expo Go is not supported due to native module requirements.

## Quick Start

```tsx
import {
  ConversationProvider,
  useConversationControls,
  useConversationStatus,
} from "@elevenlabs/react-native";

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
    <>
      <Text>Status: {status}</Text>
      <Button
        title="Start"
        onPress={() =>
          startSession({
            onConnect: ({ conversationId }) =>
              console.log("Connected:", conversationId),
            onError: (message) => console.error("Error:", message),
          })
        }
      />
      <Button title="End" onPress={() => endSession()} />
    </>
  );
}
```

## Example App

See the [Expo example app](../../examples/react-native-expo) for a complete working example.

## Documentation

For product details and repo-level guidance, see the root README or visit [conversales.in](https://conversales.in).

## Development

Please refer to the README.md file in the root of this repository.

## Contributing

Please create an issue first to discuss the proposed changes. Any contributions are welcome!

Remember, if merged, your code will be used as part of a MIT licensed project. By submitting a Pull Request, you are giving your consent for your code to be integrated into this library.
