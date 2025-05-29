import { RunnableConfig } from "@langchain/core/runnables";
import { StateGraph } from "@langchain/langgraph";
import {
  ConfigurationAnnotation,
  ensureConfiguration,
} from "./configuration.js";
import { StateAnnotation, InputStateAnnotation } from "./state.js";
import { loadChatModel } from "./utils.js";

async function respond(
  state: typeof StateAnnotation.State,
  config: RunnableConfig
): Promise<typeof StateAnnotation.Update> {
  /**
   * Call the LLM to respond to the user.
   */
  const configuration = ensureConfiguration(config);

  const model = await loadChatModel(configuration.responseModel);

  // Create system message with current time
  const systemMessage = configuration.responseSystemPromptTemplate
    .replace("{systemTime}", new Date().toISOString());
  
  const messageValue = [
    { role: "system", content: systemMessage },
    ...state.messages,
  ];
  
  const response = await model.invoke(messageValue);
  // We return a list, because this will get added to the existing list
  return { messages: [response] };
}

// Create a simple graph with just a respond node
const builder = new StateGraph(
  {
    stateSchema: StateAnnotation,
    input: InputStateAnnotation,
  },
  ConfigurationAnnotation
)
  .addNode("respond", respond)
  .addEdge("__start__", "respond");

// Compile the graph
export const graph = builder.compile({
  interruptBefore: [],
  interruptAfter: [],
});

graph.name = "Simple Chat Graph";
