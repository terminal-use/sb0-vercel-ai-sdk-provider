# Vercel AI SDK - sb0 Provider

The official Vercel AI SDK provider for [sb0](https://www.sb0.dev), the platform for deploying Claude Agent SDK agents in minutes.

## Installation

```bash
npm install @sb0/vercel-ai-sdk-provider
```

## Usage

```typescript
import { createSb0 } from "@sb0/vercel-ai-sdk-provider";
import { streamText } from "ai";

const sb0 = createSb0({
  baseUrl: "https://gateway.sb0.dev",
  apiKey: process.env.SB0_API_KEY,
});

const result = streamText({
  model: sb0.languageModel("your-agent-name"),
  providerOptions: {
    sb0: {
      chatId: "...", // Identifies conversation
      sandboxKey: "...", // Scopes the sandbox and filesystem
    },
  },
  prompt: "Say hello",
});

for await (const textPart of result.textStream) {
  process.stdout.write(textPart);
}
```
### Get sb0 API key

Sign up at [sb0](https://www.sb0.dev) and get your sb0 API key on the [settings page](https://www.sb0.dev/dashboard/settings).

### Choosing `chatId` and `sandboxKey`

- `chatId` identifies the conversation session. Use any non-empty string, typically a UUID stored with the chat history. Reusing the same `chatId` lets sb0 resume the Claude session so follow-up turns stay in context.
- `sandboxKey` scopes the sandbox (filesystem, packages, etc.) that backs the chat. Keep it stable for a given end user if you want their chats to share a warm sandbox, or set it equal to a freshly generated `chatId` when you want every conversation to start from a clean sandbox.
- Both values accept arbitrary strings—no UUID requirement—so adapt them to your app’s identifiers.

## Next Steps

To build a complete chat UI with `useChat`, see the [AI SDK Chatbot guide](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot).

For a deeper understanding of how streaming works under the hood, check out the [Stream Protocol documentation](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol).
