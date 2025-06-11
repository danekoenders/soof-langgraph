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
  
  // Last updated timestamp for tracking
  lastUpdated: Annotation<string>({
    reducer: (_, n) => n || new Date().toISOString(),
    default: () => new Date().toISOString(),
  }),
});