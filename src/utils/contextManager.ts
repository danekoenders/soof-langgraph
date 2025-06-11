/**
 * Context Manager for handling rolling window conversation context
 * 
 * EXAMPLE USAGE:
 * 
 * Original conversation (15 messages):
 * [SystemMsg, User1, AI1, User2, AI2, ..., User7, AI7, User8]
 * 
 * With windowSize=10, buildContextMessages() returns:
 * [BaseSystemPrompt, TaskSystemMsg, User2, AI2, User3, AI3, ..., User8]
 * 
 * This ensures:
 * 1. Base system prompt is ALWAYS first
 * 2. Task-specific context comes second
 * 3. Rolling window keeps the most recent conversation
 * 4. Consistent context across all graphs
 */

import { BaseMessage, SystemMessage } from "@langchain/core/messages";
import { BASE_CHAT_SYSTEM_PROMPT_TEMPLATE } from "../prompts/index.js";

export interface ContextManagerConfig {
  chatbotName?: string;
  shopName?: string;
  windowSize?: number; // Number of messages to keep in rolling window
  baseSystemPrompt?: boolean; // Whether to include the base system prompt (default: true)
}

export class ContextManager {
  private config: Required<ContextManagerConfig>;

  constructor(config: ContextManagerConfig = {}) {
    this.config = {
      chatbotName: config.chatbotName || 'Soof',
      shopName: config.shopName || 'Test Shop',
      windowSize: config.windowSize || 10,
      baseSystemPrompt: config.baseSystemPrompt !== undefined ? config.baseSystemPrompt : true,
    };
  }

  /**
   * Gets the base system prompt with current context
   */
  private getBaseSystemPrompt(): SystemMessage {
    const systemPrompt = BASE_CHAT_SYSTEM_PROMPT_TEMPLATE
      .replace('{chatbotName}', this.config.chatbotName)
      .replace('{shopName}', this.config.shopName)
      .replace('{systemTime}', new Date().toISOString());
    
    return new SystemMessage(systemPrompt);
  }

  /**
   * Ensures the conversation always starts with the base system prompt
   * and maintains a rolling window of the most recent messages
   */
  buildContextMessages(
    messages: BaseMessage[], 
    additionalSystemMessages: SystemMessage[] = []
  ): BaseMessage[] {

    // Apply rolling window to messages (keep last N messages)
    const recentMessages = messages.slice(-this.config.windowSize);

    // Build the final message array:
    // 1. Base system prompt (always first, if enabled)
    // 2. Additional system messages (task-specific context)
    // 3. Recent conversation messages (rolling window)
    const contextMessages: BaseMessage[] = [
      ...(this.config.baseSystemPrompt ? [this.getBaseSystemPrompt()] : []),
      ...additionalSystemMessages,
      ...recentMessages,
    ];

    return contextMessages;
  }

  /**
   * Convenience method for creating task-specific system messages
   */
  createTaskSystemMessage(content: string): SystemMessage {
    return new SystemMessage(content);
  }

  /**
   * Update the context manager configuration
   */
  updateConfig(config: Partial<ContextManagerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<ContextManagerConfig> {
    return { ...this.config };
  }
}

/**
 * Default context manager instance
 */
export const defaultContextManager = new ContextManager(); 