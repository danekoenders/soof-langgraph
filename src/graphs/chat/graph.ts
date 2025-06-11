import { StateGraph } from "@langchain/langgraph";
import { ChatState } from "./state.js";
import { initChatModel } from "langchain/chat_models/universal";
import { RunnableConfig } from "@langchain/core/runnables";

async function respond(
  state: typeof ChatState.State,
  _config: RunnableConfig,
): Promise<typeof ChatState.Update> {
  const model = await initChatModel("gpt-4o-mini");
  
  // Simple chat response - no routing tools needed since router handles classification
  const response = await model.invoke(state.messages);
  return { messages: [response] };
}

const builder = new StateGraph({ stateSchema: ChatState })
  .addNode("respond", respond)
  .addEdge("__start__", "respond")
  .addEdge("respond", "__end__");

export const graph = builder.compile();
graph.name = "General Chat Graph"; 