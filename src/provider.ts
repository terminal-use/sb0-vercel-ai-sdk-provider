import { NoSuchModelError, type ProviderV2 } from '@ai-sdk/provider';
import {
  withoutTrailingSlash
} from '@ai-sdk/provider-utils';
import { Sb0Agent } from './sb0-agent';

export interface Sb0ProviderSettings {
  /**
   * The sb0 Gateway URL.
   */
  readonly baseUrl: string;
  /**
   * The sb0 API key.
   * 
   * Generate one at https://sb0.dev/
   */
  readonly apiKey: string;
}

interface Sb0Provider extends ProviderV2 {
  (agentName: string): Sb0Agent;
}

export function createSb0(options: Sb0ProviderSettings): Sb0Provider {
  const createSb0Agent = (
    agentName: string
  ) => {
    const baseUrl = withoutTrailingSlash(options.baseUrl) ?? ""

    if (baseUrl == null) {
      throw new Error('Expected baseUrl to be set')
    }

    return new Sb0Agent(baseUrl, agentName, options.apiKey)
  };

  const provider = function (agentName: string) {
    if (new.target) {
      throw new Error(
        'The model factory function cannot be called with the new keyword.',
      );
    }

    return createSb0Agent(agentName);
  };

  provider.languageModel = createSb0Agent;
  provider.imageModel = () => {throw new NoSuchModelError({
      modelId: 'languageModel',
      modelType: 'languageModel',
    });
  };
  provider.textEmbeddingModel = () => {throw new NoSuchModelError({
      modelId: 'languageModel',
      modelType: 'languageModel',
    });
  };

  return provider;
}
