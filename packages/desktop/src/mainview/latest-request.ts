/** Ignore responses superseded by navigation; transport cancellation is not required. */
export class LatestRequest {
  private generation = 0;
  invalidate(): void { this.generation += 1; }
  capture(): () => boolean {
    const generation = this.generation;
    return () => this.generation === generation;
  }
  begin(): () => boolean {
    this.invalidate();
    return this.capture();
  }
}
