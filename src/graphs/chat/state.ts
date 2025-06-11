import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

function appendMessages(existing: BaseMessage[], newMsg: BaseMessage | BaseMessage[]): BaseMessage[] {
  return [...existing, ...(Array.isArray(newMsg) ? newMsg : [newMsg])];
}

export const ChatState = Annotation.Root({
  messages: Annotation<BaseMessage[], BaseMessage | BaseMessage[]>({
    reducer: appendMessages,
    default: () => [],
  }),
}); 