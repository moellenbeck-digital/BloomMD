export interface StartupTarget {
  path: string;
  nodeId: string | null;
}

/**
 * Notes handed to BloomMD while it starts (a launching `bloommd://` link, a handoff from Obsidian or
 * a second launch) must not race startup: opening one while settings load or a remembered server
 * reconnects lets the restored workspace replace it. Until startup settles, targets are only
 * recorded; startup drains them on its own awaited path. Afterwards they open directly.
 */
export class StartupTargets {
  private pending: StartupTarget | null = null;
  private settled = false;

  /** Records a target during startup (the newest wins) and returns true; false once settled. */
  offer(target: StartupTarget): boolean {
    if (this.settled) return false;
    this.pending = target;
    return true;
  }

  get hasPending(): boolean {
    return this.pending !== null;
  }

  get isSettled(): boolean {
    return this.settled;
  }

  /** Opens the recorded target (or `first` when none was recorded), then any that arrive meanwhile. */
  async drain(open: (target: StartupTarget) => Promise<void>, first: StartupTarget | null = null): Promise<void> {
    let next = this.pending ?? first;
    while (next) {
      this.pending = null;
      await open(next);
      next = this.pending;
    }
  }

  /** From now on targets open directly. */
  async settle(open: (target: StartupTarget) => Promise<void>): Promise<void> {
    await this.drain(open);
    this.settled = true;
  }
}
