import {
  type JSONObject,
  type LanguageModelV2,
  type LanguageModelV2CallOptions,
  type LanguageModelV2FinishReason,
  type LanguageModelV2StreamPart,
  UnsupportedFunctionalityError
} from '@ai-sdk/provider';
import {
  createEventSourceResponseHandler,
  createStatusCodeErrorResponseHandler,
  type ParseResult,
  postToApi
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { convertToProviderMessage as convertToSb0MessageParts, type Sb0MessagePart } from './convert-to-provider-message';


interface Sb0Message {
  readonly parts: Sb0MessagePart[]
  readonly kwargs?: JSONObject
}

const sb0SseChunk = z
  .looseObject({
    type: z.literal('agent_message'),
    // Allow any message_type (e.g., SystemMessage, StreamEvent, AssistantMessage, ResultMessage)
    message_type: z.string().optional(),
    payload: z
      .looseObject({
        // StreamEvent structure
        event: z
          .object({
            type: z.string().optional(),
            delta: z
              .object({
                text: z.string().optional(),
                stop_reason: z.string().optional(),
              })
              .optional(),
          })
          .optional(),
        // AssistantMessage structure (text blocks and tool use)
        // UserMessage structure (tool results)
        content: z.array(z.looseObject({
          text: z.string().optional(),
          id: z.string().optional(),
          name: z.string().optional(),
          input: z.any().optional(),
          tool_use_id: z.string().optional(),
          content: z.string().optional(),
        })).optional(),
        // ResultMessage structure
        subtype: z.string().optional(),
      })
      .optional(),
  });

type Sb0SseChunk = z.infer<typeof sb0SseChunk>;

export class Sb0Agent implements LanguageModelV2 {
  readonly specificationVersion = "v2" as const;
  readonly provider = "sb0";
  readonly modelId = "placeholder"; // required by ai sdk v5, but we're not using it

  private static readonly RESERVED_AGENT_NAME_KEY = '__sb0_reserved_agent_name__';

  constructor(
    readonly baseUrl: string,
    readonly name: string,
    readonly apiKey: string,
  ) {}


  async doGenerate(_options: LanguageModelV2CallOptions): Promise<never> {
    throw new UnsupportedFunctionalityError({
      functionality: 'Non-streaming output',
      message: 'Sb0 language model does not support non-streaming output yet. Use streaming output and reach out!'
    });
  }

  async doStream(options: LanguageModelV2CallOptions) {
    const parts = convertToSb0MessageParts(options.prompt);

    const message: Sb0Message = {
      kwargs: {
        [Sb0Agent.RESERVED_AGENT_NAME_KEY]: this.name,
        ...options.providerOptions?.[this.provider],
      },
      parts,
    };

    const body = {
        content: JSON.stringify(message),
        values: message,
      }
    const { value: responseStream, responseHeaders } = await postToApi({
      url: `${this.baseUrl}/query`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body,
      abortSignal: options.abortSignal,
      failedResponseHandler: createStatusCodeErrorResponseHandler(),
      successfulResponseHandler: createEventSourceResponseHandler(sb0SseChunk),
    });

    const stream = responseStream
      .pipeThrough(this.createStreamTransformer());

    return { 
      stream,
      request: { body },
      response: { headers: responseHeaders },
     };
  }

  private createStreamTransformer() {
    let activeTextId: string | null = null;
    let finishReason: LanguageModelV2FinishReason = 'unknown';
    return new TransformStream<ParseResult<Sb0SseChunk>, LanguageModelV2StreamPart>({
      start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] });
      },
      transform(chunk, controller) {
        if (!chunk.success) {
          finishReason = 'error'
          controller.enqueue({ type: 'error', error: chunk.error });
          return;
        }

        const v = chunk.value;

        // Handle AssistantMessage with content blocks
        if (v?.message_type === 'AssistantMessage' && v?.payload?.content) {
          const content = v.payload.content;
          for (const block of content) {
            // Handle tool use blocks
            if (block.id && block.name && block.input !== undefined) {
              controller.enqueue({
                type: 'tool-call',
                toolCallId: block.id,
                toolName: block.name,
                args: JSON.stringify(block.input),
              });
            }
          }
          return;
        }

        // Handle StreamEvent (for streaming text deltas)
        if (v?.message_type === 'StreamEvent') {
          const event = v?.payload?.event;
          const eventType = event?.type;

          if (eventType === 'content_block_delta') {
            const textDelta = event?.delta?.text;
            if (textDelta) {
              if (activeTextId == null) {
                activeTextId = 'txt-0';
                controller.enqueue({ id: activeTextId, type: 'text-start' });
              }
              controller.enqueue({ id: activeTextId, type: 'text-delta', delta: textDelta });
            }
          }

          if (eventType === 'message_delta' && event?.delta?.stop_reason) {
            if (event.delta.stop_reason === 'tool_use') {
              finishReason = 'tool-calls';
            } else if (event.delta.stop_reason === 'end_turn' || event.delta.stop_reason === 'stop_sequence') {
              finishReason = 'stop';
            }
          }

          if (eventType === 'message_stop' && finishReason === 'unknown') {
            finishReason = 'stop';
          }
          return;
        }

        // Handle UserMessage (tool results)
        if (v?.message_type === 'UserMessage' && v?.payload?.content) {
          const content = v.payload.content;
          for (const block of content) {
            if (block.tool_use_id) {
              controller.enqueue({
                type: 'tool-result',
                toolCallId: block.tool_use_id,
                result: block.content || '',
              });
            }
          }
          return;
        }

        if (v?.message_type === 'ResultMessage') {
          const subtype = v?.payload?.subtype as string | undefined;
          if (subtype === 'error') finishReason = 'error';
          else if (subtype === 'success' && finishReason === 'unknown') finishReason = 'stop';
          else if (finishReason === 'unknown') finishReason = 'other';
          return;
        }
      },
      flush(controller) {
        // Close any remaining open text block (from StreamEvents)
        if (activeTextId != null) {
          controller.enqueue({
            id: activeTextId,
            type: 'text-end',
          });
          activeTextId = null;
        }

        controller.enqueue({
          type: "finish",
          finishReason,
          usage: {
            inputTokens: undefined,
            outputTokens: undefined,
            totalTokens: undefined,
          }
        })
      }
    });
  }

  // Supported URL patterns for native file handling
  get supportedUrls() {
    return {
      // TODO(sb0) Make this configurable
      'image/*': [/^https:\/\/example\.com\/images\/.*/],
    };
  }
}
