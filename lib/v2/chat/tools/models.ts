import {
  LanguageModelV3Middleware,
  LanguageModelV3Message,
} from '@ai-sdk/provider';

/**
 * Middleware that copies providerOptions.vertex to providerOptions.google for all messages and parts.
 * This is a temporary fix for an AI SDK beta bug where thought signatures are stored in
 * providerOptions.vertex but read from providerOptions.google.
 * This middleware will be removed once this is resolved: https://github.com/vercel/ai/issues/11181
 */
export const vertexToGoogleProviderOptionsMiddleware =
  (): LanguageModelV3Middleware => {
    return {
      specificationVersion: 'v3',
      transformParams: async ({ params }) => {
        if (!params.prompt || !Array.isArray(params.prompt)) {
          return params;
        }

        const newMessages: LanguageModelV3Message[] = params.prompt.map(
          (message) => {
            // Copy vertex to google at message level
            const newMessage = copyVertexToGoogle(message);

            // Process content array if it exists and is an array
            if ('content' in newMessage && Array.isArray(newMessage.content)) {
              return {
                ...newMessage,
                content: newMessage.content.map((part) =>
                  copyVertexToGoogle(part),
                ),
              } as LanguageModelV3Message;
            }

            return newMessage;
          },
        );

        return {
          ...params,
          prompt: newMessages,
        };
      },
    };
  };

/**
 * Copies providerOptions.vertex to providerOptions.google if vertex exists.
 * Returns a new object with the copied provider options.
 */
function copyVertexToGoogle<T>(obj: T): T {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const record = obj as Record<string, unknown>;
  const providerOptions = record.providerOptions as
    | Record<string, unknown>
    | undefined;

  if (!providerOptions?.vertex) {
    return obj;
  }

  return {
    ...obj,
    providerOptions: {
      ...providerOptions,
      google: {
        ...(providerOptions.vertex as Record<string, unknown>),
        ...(providerOptions.google as Record<string, unknown> | undefined),
      },
    },
  };
}
