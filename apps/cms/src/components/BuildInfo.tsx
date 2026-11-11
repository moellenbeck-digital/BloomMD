import { getCmsBuildInfo } from "../lib/build-info";

/** Version and build information inside the admin UI: login page and navigation (AGENTS.md). */
export function BuildInfoLogin() {
  const info = getCmsBuildInfo();
  return (
    <p data-testid="cms-build-info" style={{ fontSize: "0.8rem", opacity: 0.7, margin: "0 0 1rem" }}>
      {info.displayVersion}
    </p>
  );
}

export function BuildInfoNav() {
  const info = getCmsBuildInfo();
  return (
    <p data-testid="cms-build-info" title={info.buildTime ? `Build ${info.buildTime}` : undefined} style={{ fontSize: "0.75rem", opacity: 0.6, marginTop: "1rem" }}>
      {info.displayVersion}
    </p>
  );
}
