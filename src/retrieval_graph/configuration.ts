/**
 * Define the configurable parameters for the agent.
 */
import { RunnableConfig } from "@langchain/core/runnables";
import { RESPONSE_SYSTEM_PROMPT_TEMPLATE } from "./prompts.js";
import { Annotation } from "@langchain/langgraph";

/**
 * Simple configuration for the chat agent.
 */
export const ConfigurationAnnotation = Annotation.Root({
  /**
   * The system prompt used for generating responses.
   */
  responseSystemPromptTemplate: Annotation<string>,

  /**
   * The language model used for generating responses. Should be in the form: provider/model-name.
   */
  responseModel: Annotation<string>,
});

/**
 * Create a configuration instance from a RunnableConfig object.
 */
export function ensureConfiguration(
  config: RunnableConfig | undefined = undefined,
): typeof ConfigurationAnnotation.State {
  const configurable = (config?.configurable || {}) as Partial<
    typeof ConfigurationAnnotation.State
  >;

  return {
    responseSystemPromptTemplate:
      configurable.responseSystemPromptTemplate ||
      RESPONSE_SYSTEM_PROMPT_TEMPLATE,
    responseModel:
      configurable.responseModel || "openai/gpt-4o-mini",
  };
}
