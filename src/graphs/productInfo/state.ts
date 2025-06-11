import { Annotation } from "@langchain/langgraph";
import { SharedBaseState } from "../shared/baseState.js";

// Product information state - extends base state with product-specific fields
export const ProductInfoState = Annotation.Root({
  ...SharedBaseState.spec,
  
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