import { AsyncCaller, AsyncCallerParams } from "../../util/async_caller.js";
import {
  getEnvironmentVariable,
  getRuntimeEnvironment,
} from "../../util/env.js";
import { BaseCallbackHandlerInput } from "../base.js";
import { BaseTracer, Run, BaseRun } from "./tracer.js";

export interface RunCreate extends BaseRun {
  child_runs: this[];
  session_id: string; // uuid
}

export interface BaseTracerSession {
  start_time: number;
  name?: string;
}

export interface BaseTracerSessionV2 extends BaseTracerSession {
  tenant_id: string; // uuid
}

export interface TracerSessionCreateV2 extends BaseTracerSessionV2 {
  id?: string; // uuid. Auto-generated if not provided
}

export interface TracerSession extends BaseTracerSessionV2 {
  id: string; // uuid
}

export interface LangChainTracerFields extends BaseCallbackHandlerInput {
  exampleId?: string;
  tenantId?: string;
  sessionName?: string;
  sessionExtra?: Record<string, unknown>;
  callerParams?: AsyncCallerParams;
}

export class LangChainTracer
  extends BaseTracer
  implements LangChainTracerFields
{
  name = "langchain_tracer";

  protected endpoint =
    getEnvironmentVariable("LANGCHAIN_ENDPOINT") || "http://localhost:1984";

  protected headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  sessionName: string;

  sessionExtra?: LangChainTracerFields["sessionExtra"];

  protected session: TracerSession;

  exampleId?: string;

  tenantId?: string;

  caller: AsyncCaller;

  constructor(fields: LangChainTracerFields = {}) {
    super(fields);
    const { exampleId, tenantId, sessionName, sessionExtra, callerParams } =
      fields;

    const apiKey = getEnvironmentVariable("LANGCHAIN_API_KEY");
    if (apiKey) {
      this.headers["x-api-key"] = apiKey;
    }

    this.tenantId = tenantId ?? getEnvironmentVariable("LANGCHAIN_TENANT_ID");
    this.sessionName =
      sessionName ?? getEnvironmentVariable("LANGCHAIN_SESSION") ?? "default";
    this.sessionExtra = sessionExtra;
    this.exampleId = exampleId;
    this.caller = new AsyncCaller(callerParams ?? {});
  }

  protected async ensureSession(): Promise<TracerSession> {
    if (this.session) {
      return this.session;
    }
    const tenantId = await this.ensureTenantId();
    const endpoint = `${this.endpoint}/sessions?upsert=true`;
    const res = await this.caller.call(fetch, endpoint, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        name: this.sessionName,
        tenant_id: tenantId,
        extra: this.sessionExtra,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Failed to create session: ${res.status} ${res.statusText} ${body}`
      );
    }
    const session = await res.json();
    this.session = session;
    return session;
  }

  protected async ensureTenantId(): Promise<string> {
    if (this.tenantId) {
      return this.tenantId;
    }
    const endpoint = `${this.endpoint}/tenants`;
    const response = await this.caller.call(fetch, endpoint, {
      method: "GET",
      headers: this.headers,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Failed to fetch tenant ID: ${response.status} ${response.statusText} ${body}`
      );
    }

    const tenants = await response.json();
    if (!tenants || tenants.length === 0) {
      throw new Error(`No tenants found for endpoint ${endpoint}`);
    }

    const tenantId = tenants[0].id;
    this.tenantId = tenantId;
    return tenantId;
  }

  private async _convertToCreate(
    run: Run,
    example_id: string | undefined = undefined
  ): Promise<RunCreate> {
    const session = await this.ensureSession();
    const runExtra = run.extra ?? {};
    runExtra.runtime = await getRuntimeEnvironment();
    const persistedRun: RunCreate = {
      id: run.id,
      name: run.name,
      start_time: run.start_time,
      end_time: run.end_time,
      run_type: run.run_type,
      reference_example_id: example_id,
      extra: runExtra,
      execution_order: run.execution_order,
      serialized: run.serialized,
      error: run.error,
      inputs: run.inputs,
      outputs: run.outputs ?? {},
      session_id: session.id,
      child_runs: await Promise.all(
        run.child_runs.map((child_run) => this._convertToCreate(child_run))
      ),
    };
    return persistedRun;
  }

  protected async persistRun(run: Run): Promise<void> {
    const persistedRun: RunCreate = await this._convertToCreate(
      run,
      this.exampleId
    );
    const endpoint = `${this.endpoint}/runs`;
    const response = await this.caller.call(fetch, endpoint, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(persistedRun),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Failed to persist run: ${response.status} ${response.statusText} ${body}`
      );
    }
  }
}
