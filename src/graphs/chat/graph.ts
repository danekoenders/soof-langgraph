import { StateGraph } from "@langchain/langgraph";
import { ChatState } from "./state.js";
import { initChatModel } from "langchain/chat_models/universal";
import { RunnableConfig } from "@langchain/core/runnables";
import { defaultContextManager } from "../../utils/contextManager.js";
import { SystemMessage } from "@langchain/core/messages";

async function respond(
  state: typeof ChatState.State,
  config: RunnableConfig
): Promise<typeof ChatState.Update> {
  const model = await initChatModel("gpt-4o-mini");

  // Read any extra system messages injected by the router or other callers
  const extraSystemMessages: SystemMessage[] =
    (config.configurable?.extraSystemMessages as SystemMessage[]) ?? [];

  // Use context manager to build messages with system prompt and rolling window
  const messages = defaultContextManager.buildContextMessages(
    state.messages,
    extraSystemMessages
  );

  // Simple chat response - no routing tools needed since router handles classification
  const response = await model.invoke(messages);

  // Return both the response and the thread metadata
  return {
    messages: [response],
  };
}

const builder = new StateGraph({ stateSchema: ChatState })
  .addNode("respond", respond)
  .addEdge("__start__", "respond")
  .addEdge("respond", "__end__");

export const graph = builder.compile();
graph.name = "General Chat Graph";
