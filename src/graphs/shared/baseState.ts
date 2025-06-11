import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

/**
 * Shared base state that all graphs should extend from
 * This ensures consistent message handling across the entire system
 */
export const SharedBaseState = Annotation.Root({
  // Core conversation - same across ALL graphs
  messages: Annotation<BaseMessage[], BaseMessage | BaseMessage[]>({
    reducer: (existing, newMsg) => {
      const incoming = Array.isArray(newMsg) ? newMsg : [newMsg];
      let combined = [...existing, ...incoming];

      // Deduplicate consecutive identical messages (by role & content)
      combined = combined.filter((msg, idx, arr) => {
        if (idx === 0) return true;
        const prev = arr[idx - 1];
        // Only compare role + content for dedup
        // @ts-ignore
        if (msg.role && prev.role && msg.role === prev.role && msg.content === prev.content) {
          return false;
        }
        return true;
      });

      // Keep only last 30 messages to avoid unbounded growth
      const MAX_HISTORY = 30;
      if (combined.length > MAX_HISTORY) {
        combined = combined.slice(-MAX_HISTORY);
      }
      return combined;
    },
    default: () => [],
  }),
  
  // Last updated timestamp for tracking
  lastUpdated: Annotation<string>({
    reducer: (_, n) => n || new Date().toISOString(),
    default: () => new Date().toISOString(),
  }),
});