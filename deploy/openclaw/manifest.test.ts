import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

interface PluginPackage {
  version: string;
}

async function readRepositoryFile(relativePath: string): Promise<string> {
  const repositoryRoot = resolve(import.meta.dir, "..", "..");
  return Bun.file(resolve(repositoryRoot, relativePath)).text();
}

describe("OpenClaw deployment manifests", () => {
  test("reference the released OpenClaw plugin version", async () => {
    const packageJson = JSON.parse(
      await readRepositoryFile("plugins/openclaw/package.json"),
    ) as PluginPackage;
    const [compose, kubernetes] = await Promise.all([
      readRepositoryFile("deploy/openclaw/docker-compose.yml"),
      readRepositoryFile("deploy/openclaw/kubernetes.yaml"),
    ]);

    expect(compose).toContain(`image: bloommd-openclaw-plugin:${packageJson.version}`);
    expect(kubernetes).toContain(
      `image: ghcr.io/moellenbeck-digital/bloommd-openclaw-plugin:${packageJson.version}`,
    );
  });
});
