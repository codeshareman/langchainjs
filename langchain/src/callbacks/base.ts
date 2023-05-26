import * as uuid from "uuid";
import {
  AgentAction,
  AgentFinish,
  BaseChatMessage,
  ChainValues,
  LLMResult,
} from "../schema/index.js";
import { Serializable, Serialized } from "../schema/load.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Error = any;

export interface BaseCallbackHandlerInput {
  ignoreLLM?: boolean;
  ignoreChain?: boolean;
  ignoreAgent?: boolean;
}

abstract class BaseCallbackHandlerMethodsClass {
  /**
   * Called at the start of an LLM or Chat Model run, with the prompt(s)
   * and the run ID.
   */
  handleLLMStart?(
    llm: { name: string },
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>
  ): Promise<void> | void;

  /**
   * Called when an LLM/ChatModel in `streaming` mode produces a new token
   */
  handleLLMNewToken?(
    token: string,
    runId: string,
    parentRunId?: string
  ): Promise<void> | void;

  /**
   * Called if an LLM/ChatModel run encounters an error
   */
  handleLLMError?(
    err: Error,
    runId: string,
    parentRunId?: string
  ): Promise<void> | void;

  /**
   * Called at the end of an LLM/ChatModel run, with the output and the run ID.
   */
  handleLLMEnd?(
    output: LLMResult,
    runId: string,
    parentRunId?: string
  ): Promise<void> | void;

  /**
   * Called at the start of a Chat Model run, with the prompt(s)
   * and the run ID.
   */
  handleChatModelStart?(
    llm: { name: string },
    messages: BaseChatMessage[][],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>
  ): Promise<void> | void;

  /**
   * Called at the start of a Chain run, with the chain name and inputs
   * and the run ID.
   */
  handleChainStart?(
    chain: { name: string },
    inputs: ChainValues,
    runId: string,
    parentRunId?: string
  ): Promise<void> | void;

  /**
   * Called if a Chain run encounters an error
   */
  handleChainError?(
    err: Error,
    runId: string,
    parentRunId?: string
  ): Promise<void> | void;

  /**
   * Called at the end of a Chain run, with the outputs and the run ID.
   */
  handleChainEnd?(
    outputs: ChainValues,
    runId: string,
    parentRunId?: string
  ): Promise<void> | void;

  /**
   * Called at the start of a Tool run, with the tool name and input
   * and the run ID.
   */
  handleToolStart?(
    tool: { name: string },
    input: string,
    runId: string,
    parentRunId?: string
  ): Promise<void> | void;

  /**
   * Called if a Tool run encounters an error
   */
  handleToolError?(
    err: Error,
    runId: string,
    parentRunId?: string
  ): Promise<void> | void;

  /**
   * Called at the end of a Tool run, with the tool output and the run ID.
   */
  handleToolEnd?(
    output: string,
    runId: string,
    parentRunId?: string
  ): Promise<void> | void;

  handleText?(
    text: string,
    runId: string,
    parentRunId?: string
  ): Promise<void> | void;

  /**
   * Called when an agent is about to execute an action,
   * with the action and the run ID.
   */
  handleAgentAction?(
    action: AgentAction,
    runId: string,
    parentRunId?: string
  ): Promise<void> | void;

  /**
   * Called when an agent finishes execution, before it exits.
   * with the final output and the run ID.
   */
  handleAgentEnd?(
    action: AgentFinish,
    runId: string,
    parentRunId?: string
  ): Promise<void> | void;
}

/**
 * Base interface for callbacks. All methods are optional. If a method is not
 * implemented, it will be ignored. If a method is implemented, it will be
 * called at the appropriate time. All methods are called with the run ID of
 * the LLM/ChatModel/Chain that is running, which is generated by the
 * CallbackManager.
 *
 * @interface
 */
export type CallbackHandlerMethods = BaseCallbackHandlerMethodsClass;

export abstract class BaseCallbackHandler
  extends BaseCallbackHandlerMethodsClass
  implements BaseCallbackHandlerInput, Serializable
{
  lc_namespace = ["langchain", "callbacks"];

  get lc_name() {
    return this.name;
  }

  lc_arguments: unknown[];

  abstract name: string;

  ignoreLLM = false;

  ignoreChain = false;

  ignoreAgent = false;

  constructor(input?: BaseCallbackHandlerInput) {
    super();
    this.lc_arguments = [input];
    if (input) {
      this.ignoreLLM = input.ignoreLLM ?? this.ignoreLLM;
      this.ignoreChain = input.ignoreChain ?? this.ignoreChain;
      this.ignoreAgent = input.ignoreAgent ?? this.ignoreAgent;
    }
  }

  copy(): BaseCallbackHandler {
    return new (this.constructor as new (
      input?: BaseCallbackHandlerInput
    ) => BaseCallbackHandler)(this);
  }

  toJSON(): Serialized {
    return Serializable.prototype.toJSON.call(this);
  }

  static fromMethods(methods: CallbackHandlerMethods) {
    class Handler extends BaseCallbackHandler {
      name = uuid.v4();

      constructor() {
        super();
        Object.assign(this, methods);
      }
    }
    return new Handler();
  }
}
