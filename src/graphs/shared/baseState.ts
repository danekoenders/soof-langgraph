import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

/**
 * Shared base state that all graphs should extend from
 * This ensures consistent message handling across the entire system
 */
export const SharedBaseState = Annotation.Root({
  // Core conversation - same across ALL graphs
  messages: Annotation<BaseMessage[], BaseMessage | BaseMessage[]>({
    reducer: (existing, newMsg) => [...existing, ...(Array.isArray(newMsg) ? newMsg : [newMsg])],
    default: () => [],
  }),
  
  // Store context - automatically populated from thread metadata
  myShopifyDomain: Annotation<string>({
    reducer: (_, n) => n || "",
    default: () => "",
  }),
  
  // Thread/conversation metadata
  threadId: Annotation<string>({
    reducer: (_, n) => n || "",
    default: () => "",
  }),
  
  // Last updated timestamp for tracking
  lastUpdated: Annotation<string>({
    reducer: (_, n) => n || new Date().toISOString(),
    default: () => new Date().toISOString(),
  }),
});

/**
 * Helper function to populate SharedBaseState with thread metadata
 * Call this at the start of any graph node that needs thread metadata
 */
export function populateSharedBaseStateFromConfig(config: any): Partial<typeof SharedBaseState.State> {
  console.log("Config:", config);
  const threadMetadata = config?.configurable || {};
  console.log("Thread metadata:", threadMetadata);
  
  return {
    myShopifyDomain: threadMetadata.myShopifyDomain || "",
    threadId: threadMetadata.thread_id || "",
  };
} 