import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

// Product information state - standalone with its own messages and product-specific fields
export const ProductInfoState = Annotation.Root({
  // Core conversation for product info
  messages: Annotation<BaseMessage[], BaseMessage | BaseMessage[]>({
    reducer: (existing, newMsg) => {
      const incoming = Array.isArray(newMsg) ? newMsg : [newMsg];
      return [...existing, ...incoming];
    },
    default: () => [],
  }),
  
  // Product search and context
  searchQuery: Annotation<string>({
    reducer: (_, n) => n || "",
    default: () => "",
  }),
  
  productResults: Annotation<any[]>({
    reducer: (_, n) => n || [],
    default: () => [],
  }),
  
  // Processing status for streaming updates
  processingStatus: Annotation<string>({
    reducer: (_, n) => n || "",
    default: () => "",
  }),
  
  // Error tracking
  error: Annotation<string | null>({
    reducer: (_, n) => n,
    default: () => null,
  }),
}); 