import {
    SystemMessage,
    ToolMessage
} from "@langchain/core/messages";
import { SYSTEM_PROMPT } from "./prompts.js";

/**
 * Builds the context for the LLM: system prompt + 10 latest human/AI messages.
 * @param messages The full message history
 * @returns Array of messages to feed to the LLM
 */

// Helper to filter out 'metadata' from ToolMessage content
function filterMetadataFromToolMessages(messages: any[]) {
  return messages.map(msg => {
    // If it's a ToolMessage and has content as an object with metadata, filter it
    if (
      msg instanceof ToolMessage &&
      msg.content &&
      typeof msg.content === "object" &&
      "metadata" in msg.content
    ) {
      // Clone and remove metadata
      const { metadata, ...rest } = msg.content;
      return new ToolMessage({
        ...msg,
        content: rest,
      });
    }
    // If it's a ToolMessage and content is a stringified object, try to parse and filter
    if (
      msg instanceof ToolMessage &&
      typeof msg.content === "string"
    ) {
      try {
        const parsed = JSON.parse(msg.content);
        if ("metadata" in parsed) {
          const { metadata, ...rest } = parsed;
          return new ToolMessage({
            ...msg,
            content: JSON.stringify(rest),
          });
        }
      } catch {
        throw new Error("Failed to parse tool message");
      }
    }
    return msg;
  });
}

export function buildChatContext(messages: any[]) {
  // Take the last 10 messages (after filtering)
  const filtered = filterMetadataFromToolMessages(messages);
  const recent = filtered.slice(-10);
  // Prepend the system prompt
  return [new SystemMessage(SYSTEM_PROMPT), ...recent];
}
