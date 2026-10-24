import {
  listenForWorkspaceAgentTasks,
  runAgentCommand,
  runWorkspaceAgentTurn,
  type AgentRunnerOptions,
} from "../../../packages/agent-runtime/src/index";
import { chmod, copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  definePluginEntry,
  type OpenClawPluginApi,
} from "openclaw/plugin-sdk/plugin-entry";

interface BloomMDAgentPluginConfig {
  enabled: boolean;
  profile: string;
  pollIntervalSeconds: number;
  agentTimeoutSeconds: number;
  openClawAgentId?: string;
  workingDirectory?: string;
}

function positiveInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : fallback;
}

function configFor(api: OpenClawPluginApi): BloomMDAgentPluginConfig {
  const config = api.pluginConfig ?? {};
  return {
    enabled: config.enabled === true,
    profile:
      typeof config.profile === "string" && config.profile.trim()
        ? config.profile.trim()
        : "default",
    pollIntervalSeconds: positiveInteger(
      config.pollIntervalSeconds,
      60,
      30,
      300,
    ),
    agentTimeoutSeconds: positiveInteger(
      config.agentTimeoutSeconds,
      600,
      30,
      3_600,
    ),
    ...(typeof config.openClawAgentId === "string" &&
    config.openClawAgentId.trim()
      ? { openClawAgentId: config.openClawAgentId.trim() }
      : {}),
    ...(typeof config.workingDirectory === "string" &&
    config.workingDirectory.trim()
      ? { workingDirectory: config.workingDirectory }
      : {}),
  };
}

function runnerOptions(
  config: BloomMDAgentPluginConfig,
  workspaceDir?: string,
): AgentRunnerOptions {
  return {
    profile: config.profile,
    openClawBin: "openclaw",
    ...(config.openClawAgentId
      ? { openClawAgentId: config.openClawAgentId }
      : {}),
    workingDirectory: config.workingDirectory ?? workspaceDir ?? process.cwd(),
    timeoutSeconds: config.agentTimeoutSeconds,
    reportResult: false,
  };
}

async function installSkill(
  api: OpenClawPluginApi,
  workspaceDir: string | undefined,
): Promise<void> {
  if (!workspaceDir || !api.rootDir) return;
  const source = join(
    api.rootDir,
    "skills",
    "bloommd-workspace-agent",
    "SKILL.md",
  );
  const destinationDirectory = join(
    workspaceDir,
    "skills",
    "bloommd-workspace-agent",
  );
  const destination = join(destinationDirectory, "SKILL.md");
  await mkdir(destinationDirectory, { recursive: true, mode: 0o700 });
  await copyFile(source, destination);
  await chmod(destination, 0o600);
}

function registerCli(api: OpenClawPluginApi): void {
  api.registerCli(
    ({ program }) => {
      const bloommd = program
        .command("bloommd")
        .description("Pair and inspect the local BloomMD workspace agent.");
      bloommd
        .command("pair")
        .description(
          "Pair this OpenClaw installation with a BloomMD workspace agent.",
        )
        .requiredOption("--server <url>", "BloomMD server URL")
        // `--profile` is reserved by OpenClaw itself. A plugin option with the same name
        // makes Commander treat `bloommd` as an unknown command when the flag is present.
        .requiredOption(
          "--bloommd-profile <name>",
          "local BloomMD agent profile",
        )
        .requiredOption(
          "--pairing-code-file <path>",
          "file containing the one-time pairing code",
        )
        .action(
          async (options: {
            server: string;
            bloommdProfile: string;
            pairingCodeFile: string;
          }) => {
            const exitCode = await runAgentCommand([
              "pair",
              "--server",
              options.server,
              "--profile",
              options.bloommdProfile,
              "--pairing-code-file",
              options.pairingCodeFile,
            ]);
            if (exitCode !== 0) process.exitCode = exitCode;
          },
        );
      bloommd
        .command("status")
        .description("Show the paired BloomMD workspace-agent status.")
        .option(
          "--bloommd-profile <name>",
          "local BloomMD agent profile",
          configFor(api).profile,
        )
        .action(async (options: { bloommdProfile: string }) => {
          const exitCode = await runAgentCommand([
            "status",
            "--profile",
            options.bloommdProfile,
          ]);
          if (exitCode !== 0) process.exitCode = exitCode;
        });
      bloommd
        .command("forget")
        .description("Remove the local BloomMD token for an agent profile.")
        .option(
          "--bloommd-profile <name>",
          "local BloomMD agent profile",
          configFor(api).profile,
        )
        .action(async (options: { bloommdProfile: string }) => {
          const exitCode = await runAgentCommand([
            "forget",
            "--profile",
            options.bloommdProfile,
          ]);
          if (exitCode !== 0) process.exitCode = exitCode;
        });
    },
    {
      descriptors: [
        {
          name: "bloommd",
          description: "Pair and operate a local BloomMD workspace agent",
          hasSubcommands: true,
        },
      ],
    },
  );
}

const plugin = definePluginEntry({
  id: "bloommd-workspace-agent",
  name: "BloomMD Workspace Agent",
  description: "Local review-first workspace agent for BloomMD.",
  register(api) {
    registerCli(api);
    let timer: ReturnType<typeof setInterval> | undefined;
    let realtimeAbort: AbortController | undefined;
    let running = false;

    api.registerService({
      id: "bloommd-workspace-agent-runner",
      reload: {
        configPrefixes: ["plugins.entries.bloommd-workspace-agent.config"],
      },
      async start(context) {
        const config = configFor(api);
        if (!config.enabled) {
          api.logger.info(
            "BloomMD workspace agent runner is waiting for explicit plugin configuration.",
          );
          return;
        }
        try {
          await installSkill(api, context.workspaceDir);
        } catch (error) {
          context.serviceHealth?.reportFailure(error);
          api.logger.error(
            `BloomMD workspace agent skill could not be installed: ${error instanceof Error ? error.message : String(error)}`,
          );
          return;
        }
        const cycle = async (): Promise<void> => {
          if (running) return;
          running = true;
          try {
            const result = await runWorkspaceAgentTurn(
              runnerOptions(config, context.workspaceDir),
            );
            if (result.status === "completed")
              api.logger.info(
                `BloomMD workspace task ${result.taskId ?? "unknown"} prepared a proposal.`,
              );
            context.serviceHealth?.clearFailure();
          } catch (error) {
            context.serviceHealth?.reportFailure(error);
            api.logger.error(
              `BloomMD workspace agent runner failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          } finally {
            running = false;
          }
        };
        const connectRealtime = async (): Promise<void> => {
          while (!realtimeAbort?.signal.aborted) {
            try {
              await listenForWorkspaceAgentTasks({
                profile: config.profile,
                signal: realtimeAbort!.signal,
                onTaskAvailable: () => void cycle(),
                onConnected: () =>
                  api.logger.info(
                    `BloomMD workspace agent realtime connection established as profile ${config.profile}.`,
                  ),
              });
            } catch (error) {
              if (realtimeAbort?.signal.aborted) return;
              api.logger.warn(
                `BloomMD realtime connection unavailable; fallback polling remains active: ${error instanceof Error ? error.message : String(error)}`,
              );
              await new Promise((resolve) => setTimeout(resolve, 5_000));
            }
          }
        };
        realtimeAbort = new AbortController();
        void connectRealtime();
        // The streaming connection wakes the runner immediately. This deliberately sparse poll is
        // only a network fallback and does not consume a model turn while no task is queued.
        timer = setInterval(() => {
          void cycle();
        }, config.pollIntervalSeconds * 1_000);
        timer.unref?.();
        api.logger.info(
          `BloomMD workspace agent listens in real time as profile ${config.profile}; model turns start only for claimed tasks.`,
        );
      },
      async stop() {
        realtimeAbort?.abort();
        realtimeAbort = undefined;
        if (timer) clearInterval(timer);
        timer = undefined;
      },
    });
  },
});

export default plugin;
