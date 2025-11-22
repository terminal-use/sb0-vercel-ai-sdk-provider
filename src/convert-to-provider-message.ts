import { InvalidPromptError, type LanguageModelV2DataContent, type LanguageModelV2Message, UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { convertToBase64 } from '@ai-sdk/provider-utils';
import { generateId } from 'ai';

function convertBinaryToBase64(data: LanguageModelV2DataContent): string {
    if (data instanceof URL) {
        // TODO(sb0) Add support for URL in message parts
        throw new UnsupportedFunctionalityError({
            functionality: 'File URL data',
        });
    }

    return convertToBase64(data);
}

interface Sb0MessagePart_Text {
    readonly type: "text";
    readonly text: string;
}
interface Sb0MessagePart_File {
    readonly type: "file";
    readonly name: string;
    readonly mimeType: string;
    readonly base64: string;
}
export type Sb0MessagePart = 
    | Sb0MessagePart_Text
    | Sb0MessagePart_File

export function convertToProviderMessage(messages: LanguageModelV2Message[]): Sb0MessagePart[] {
    const lastMessage = messages[messages.length - 1];

    if (lastMessage == null) {
        return [];
    }

    if (lastMessage.role !== "user") {
        throw new InvalidPromptError({
            message: "Expected a user message",
            prompt: lastMessage,
        })
    }

    const result: Sb0MessagePart[] = []
    for (const part of lastMessage.content) {
        switch (part.type) {
            case "text":
                result.push({
                    type: "text",
                    text: part.text
                })
                continue;
            case "file":
                result.push({
                    type: "file",
                    name: part.filename ?? generateId(),
                    mimeType: part.mediaType,
                    base64: convertBinaryToBase64(part.data),
                })
                continue;
            default:
                continue;
        }
    }
    return result;
}
 