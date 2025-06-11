import { BaseMessage, AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";

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
 * Custom reducer that adds timestamps to new incoming messages
 */
function addTimestampsToMessages(
  existing: BaseMessage[], 
  newMessages: BaseMessage | BaseMessage[]
): BaseMessage[] {
  const messagesToAdd = Array.isArray(newMessages) ? newMessages : [newMessages];
  const currentTime = new Date().toISOString();
  
  const timestampedMessages = messagesToAdd.map(msg => {
    // Only add timestamps to messages that don't already have them
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    if (content.includes('*[2')) { // Simple check for existing timestamp
      return msg;
    }
    
    // Create proper message objects with timestamp
    const timestampedContent = `${content}\n\n*[${currentTime}]*`;
    
    // Check message type using constructor name or instanceof
    if (msg instanceof HumanMessage || msg.constructor.name === 'HumanMessage') {
      return new HumanMessage(timestampedContent);
    } else if (msg instanceof AIMessage || msg.constructor.name === 'AIMessage') {
      return new AIMessage(timestampedContent);
    } else if (msg instanceof SystemMessage || msg.constructor.name === 'SystemMessage') {
      return new SystemMessage(timestampedContent);
    }
    
    // Fallback - return original message if type unknown
    return msg;
  });
  
  return [...existing, ...timestampedMessages];
}

/**
 * State that manages conversation messages and claims validation
 */
export const StateAnnotation = Annotation.Root({
  /**
   * Messages with automatic timestamp addition
   */
  messages: Annotation<BaseMessage[], BaseMessage | BaseMessage[]>({
    reducer: addTimestampsToMessages,
    default: () => [],
  }),
  
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
