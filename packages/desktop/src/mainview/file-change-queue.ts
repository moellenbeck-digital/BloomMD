/** Coalesce bursts while preserving changes received during an in-flight refresh. */
export class FileChangeQueue {
  private pending = new Set<string>();
  private running = false;
  constructor(
    private readonly refresh: (files: ReadonlySet<string>) => Promise<void>,
    private readonly onError: (error: unknown) => void,
  ) {}
  add(filename: string): void {
    this.pending.add(filename);
    if (!this.running) {
      this.running = true;
      queueMicrotask(() => { void this.drain(); });
    }
  }
  clear(): void { this.pending.clear(); }
  private async drain(): Promise<void> {
    try {
      while (this.pending.size > 0) {
        const files = this.pending;
        this.pending = new Set();
        try { await this.refresh(files); }
        catch (error) { this.onError(error); }
      }
    } finally {
      this.running = false;
    }
  }
}
