import { StateGraph } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";
import { SystemMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { initChatModel } from "langchain/chat_models/universal";
import { z } from "zod";
import { defaultContextManager } from "../../utils/contextManager.js";
import { SharedBaseState } from "../shared/baseState.js";

// Import specialized graphs
import { graph as chatGraph } from "../chat/graph.js";
import { graph as productInfoGraph } from "../productInfo/graph.js";
// TODO: import other specialized graphs when created
// import { graph as recommendationGraph } from "../recommendation/graph.js";
// import { graph as orderGraph } from "../order/graph.js";

// Router state - extends base state with router-specific fields
const RouterState = Annotation.Root({
  ...SharedBaseState.spec,
  
  // Router-specific fields
  detectedIntent: Annotation<string>({
    reducer: (_, n) => n || "general_chat",
    default: () => "general_chat",
  }),
  routingReason: Annotation<string>({
    reducer: (_, n) => n || "",
    default: () => "",
  }),
});

// Structured output schema for intent classification
const IntentClassificationSchema = z.object({
  intent: z.enum(["product_info", "recommendation", "order_lookup", "handoff", "general_chat"])
    .describe("The classified intent based on the user's message"),
  confidence: z.number().min(0).max(1)
    .describe("Confidence score for the classification (0.0 to 1.0)"),
  reasoning: z.string()
    .describe("Brief explanation for why this intent was chosen"),
});

type IntentClassification = z.infer<typeof IntentClassificationSchema>;

async function classifyIntent(
  state: typeof RouterState.State,
  _config: RunnableConfig
): Promise<typeof RouterState.Update> {
  const model = await initChatModel("gpt-4o-mini");
  const structuredModel = model.withStructuredOutput(IntentClassificationSchema);
  
  // Extract the latest user message
  const latestMessage = state.messages[state.messages.length - 1];
  const conversationContext = state.messages.slice(-5).map(m => m.content?.toString() || "");
  
  const classificationPrompt = `
You are an intent classifier for a health supplement chatbot. Analyze the user's message and classify it into one of these intents:

## Intent Categories:

1. **product_info** - Questions about specific products, ingredients, health benefits, claims validation
   - Examples: "What are the benefits of omega-3?", "Is this product safe for pregnancy?", "What ingredients are in your protein powder?"
   - Use when: User asks about product details, health claims, ingredients, safety, or medical interactions

2. **recommendation** - Requests for product recommendations or suggestions
   - Examples: "What supplement should I take for energy?", "Can you recommend a vitamin for seniors?"
   - Use when: User wants product suggestions, comparisons, or personalized recommendations

3. **order_lookup** - Order status, tracking, returns, account issues
   - Examples: "Where is my order?", "I want to return this product", "Check my order status"
   - Use when: User mentions order numbers, tracking, returns, refunds, or account issues

4. **handoff** - Complex issues requiring human customer service
   - Examples: "I'm not satisfied with your service", "This is urgent", "I need to speak to a manager"
   - Use when: User expresses frustration, urgency, complex complaints, or explicitly requests human help

5. **general_chat** - General conversation, greetings, company info, simple questions
   - Examples: "Hello", "How are you?", "What is your company about?", "Thank you"
   - Use when: Casual conversation, greetings, general company questions, or simple acknowledgments

## CRITICAL COMPLIANCE RULES:
- ⚠️ Product health claims MUST go to **product_info** for compliance validation
- ⚠️ Any mention of medical conditions, pregnancy, medications → **product_info**
- ⚠️ Order numbers, tracking, returns → **order_lookup**
- ⚠️ Frustrated or urgent language → **handoff**

## User Context:
- Latest message: "${latestMessage.content}"
- Previous context: ${conversationContext.join(" → ")}

Classify this message with high confidence and provide clear reasoning.
`;

  try {
    // Use context manager to build messages for classification
    const classificationSystemMessage = defaultContextManager.createTaskSystemMessage(classificationPrompt);
    const messages = defaultContextManager.buildContextMessages(
      [latestMessage], // Only use the latest message for classification
      [classificationSystemMessage]
    );

    const classification: IntentClassification = await structuredModel.invoke(messages);

    // Validate the classification (extra safety check)
    const validatedClassification = IntentClassificationSchema.parse(classification);
    
    return {
      detectedIntent: validatedClassification.intent,
      routingReason: `${validatedClassification.reasoning} (Confidence: ${(validatedClassification.confidence * 100).toFixed(1)}%)`,
      // Pass through config values if we want them in state later (optional)
    };
    
  } catch (error) {
    // Fallback if structured output fails
    console.log("Intent classification error, falling back to general_chat:", error);
    
    return {
      detectedIntent: "general_chat",
      routingReason: "Fallback to general chat due to classification error",
    };
  }
}

async function delegateToGraph(
  state: typeof RouterState.State,
  config: RunnableConfig,
): Promise<typeof RouterState.Update> {
  const intent = state.detectedIntent;
  
  try {
    let result;
    
    switch (intent) {
      case "product_info":
        // All states are now compatible - direct delegation
        result = await productInfoGraph.invoke(state, config);
        break;
        
      case "recommendation":
        // TODO: Delegate to recommendation graph
        // result = await recommendationGraph.invoke(state, config);
        result = await chatGraph.invoke({
          ...state,
          messages: [
            ...state.messages,
            new SystemMessage(`[ROUTER] Product recommendation request detected. Reason: ${state.routingReason}. TODO: Implement specialized recommendation graph.`)
          ]
        }, config);
        break;
        
      case "order_lookup":
        // TODO: Delegate to order graph
        // result = await orderGraph.invoke(state, config);
        result = await chatGraph.invoke({
          ...state,
          messages: [
            ...state.messages,
            new SystemMessage(`[ROUTER] Order lookup request detected. Reason: ${state.routingReason}. TODO: Implement specialized order graph.`)
          ]
        }, config);
        break;
        
      case "handoff":
        result = await chatGraph.invoke({
          ...state,
          messages: [
            ...state.messages,
            new SystemMessage(`[ROUTER] Customer service handoff requested. Reason: ${state.routingReason}. Escalating to human agent.`)
          ]
        }, config);
        break;
        
      case "general_chat":
      default:
        // Direct delegation - states are compatible
        result = await chatGraph.invoke(state, config);
        break;
    }
    
    return result as typeof RouterState.Update;
  } catch (error) {
    // Fallback to general chat on any error
    console.log(`Router delegation error for intent ${intent}:`, error);
    const fallbackResult = await chatGraph.invoke({
      ...state,
      messages: [
        ...state.messages,
        new SystemMessage(`[ROUTER ERROR] Fallback to general chat due to error in ${intent} handler.`)
      ]
    }, config);
    
    return fallbackResult as typeof RouterState.Update;
  }
}

// Build the router graph
const builder = new StateGraph({ stateSchema: RouterState })
  .addNode("classifyIntent", classifyIntent)
  .addNode("delegateToGraph", delegateToGraph)
  .addEdge("__start__", "classifyIntent")
  .addEdge("classifyIntent", "delegateToGraph")
  .addEdge("delegateToGraph", "__end__");

export const graph = builder.compile();
graph.name = "Smart Router Graph"; 