import { RunnableConfig } from "@langchain/core/runnables";
import { StateGraph } from "@langchain/langgraph";
import {
  ConfigurationAnnotation,
  ensureConfiguration,
} from "./configuration.js";
import { StateAnnotation, InputStateAnnotation } from "./state.js";
import { loadChatModel, productRetrievalTool } from "./utils.js";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage } from "@langchain/core/messages";

const toolNode = new ToolNode([productRetrievalTool]);

async function respond(
  state: typeof StateAnnotation.State,
  config: RunnableConfig
): Promise<typeof StateAnnotation.Update> {
  /**
   * Call the LLM to respond to the user.
   */
  const configuration = ensureConfiguration(config);

  const model = await loadChatModel(configuration.responseModel);
  
  const modelWithTools = (model as any).bindTools 
    ? (model as any).bindTools([productRetrievalTool]) 
    : model;

  const systemMessage = configuration.responseSystemPromptTemplate
    .replace("{systemTime}", new Date().toISOString());
  
  const messageValue = [
    { role: "system", content: systemMessage },
    ...state.messages,
  ];
  
  const response = await modelWithTools.invoke(messageValue);
  return { messages: [response] };
}

function shouldContinue(state: typeof StateAnnotation.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  // If the last message is an AI message with tool calls, go to tools
  if (lastMessage && 'tool_calls' in lastMessage) {
    const aiMessage = lastMessage as AIMessage;
    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      return "tools";
    }
  }

  return "__end__";
}

const builder = new StateGraph(
  {
    stateSchema: StateAnnotation,
    input: InputStateAnnotation,
  },
  ConfigurationAnnotation
)
  .addNode("respond", respond)
  .addNode("tools", toolNode)
  .addEdge("__start__", "respond")
  .addConditionalEdges("respond", shouldContinue)
  .addEdge("tools", "respond");

// Compile the graph
export const graph = builder.compile({
  interruptBefore: [],
  interruptAfter: [],
});

graph.name = "Product Chat Graph";
