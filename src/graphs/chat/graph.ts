import { StateGraph } from "@langchain/langgraph";
import { ChatState } from "./state.js";
import { initChatModel } from "langchain/chat_models/universal";
import { RunnableConfig } from "@langchain/core/runnables";
import { defaultContextManager } from "../../utils/contextManager.js";

async function respond(
  state: typeof ChatState.State,
  _config: RunnableConfig
): Promise<typeof ChatState.Update> {
  const model = await initChatModel("gpt-4o-mini");

  // Use context manager to build messages with system prompt and rolling window
  // Pass myShopifyDomain from thread metadata as dynamic shop name
  const messages = defaultContextManager.buildContextMessages(
    state.messages,
    [] // no additional system messages
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
