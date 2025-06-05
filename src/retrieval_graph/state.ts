import { BaseMessage } from "@langchain/core/messages";
import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

/**
 * This narrows the interface with the user.
 */
export const InputStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>,
});

/**
 * Claims validation result structure
 */
export interface ClaimsValidationResult {
  isCompliant: boolean;
  violatedClaims: string[];
  allowedClaims: string[];
  suggestions: string[];
  complianceScore: number;
}

/**
 * State that manages conversation messages and claims validation
 */
export const StateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  
  /**
   * Store the original response before claims validation
   */
  originalResponse: Annotation<string>,
  
  /**
   * Claims validation results
   */
  claimsValidation: Annotation<ClaimsValidationResult>,
  
  /**
   * Final validated and compliant response
   */
  validatedResponse: Annotation<string>,
});
