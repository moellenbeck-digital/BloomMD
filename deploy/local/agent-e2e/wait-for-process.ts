export interface AgentE2EWaitOptions {
  wait: Promise<number>;
  timeoutMs: number;
  cancel(): void;
}

export interface AgentE2EWaitResult {
  exitCode: number | null;
  timedOut: boolean;
}

export function agentE2ETimeoutMilliseconds(value: string | undefined): number {
  const timeoutSeconds = Number(value ?? "900");
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 30 || timeoutSeconds > 3_600) {
    throw new Error("BLOOMMD_AGENT_E2E_TIMEOUT_SECONDS must be an integer between 30 and 3600.");
  }
  return timeoutSeconds * 1_000;
}

export async function waitForAgentE2EProcess(options: AgentE2EWaitOptions): Promise<AgentE2EWaitResult> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<AgentE2EWaitResult>((resolve) => {
    timeout = setTimeout(() => {
      options.cancel();
      resolve({ exitCode: null, timedOut: true });
    }, options.timeoutMs);
  });
  const exited = options.wait.then((exitCode) => ({ exitCode, timedOut: false }));

  const result = await Promise.race([exited, expired]);
  if (timeout) clearTimeout(timeout);
  return result;
}
