/** An ordered set of paint keys that swatch panes switch on and off, and that tells its listeners. */
export class Selection {
  private ids: string[] = [];
  private readonly listeners = new Set<() => void>();

  get(): readonly string[] {
    return this.ids;
  }

  has(id: string): boolean {
    return this.ids.includes(id);
  }

  /** Replaces the selection, keeping the given order and the first of any repeats. */
  set(ids: Iterable<string>): void {
    const next = [...new Set(ids)];
    if (next.length === this.ids.length && next.every((id, i) => id === this.ids[i])) return;
    this.ids = next;
    for (const fn of this.listeners) fn();
  }

  /** Appends the ids that are not selected yet. */
  add(ids: Iterable<string>): void {
    this.set([...this.ids, ...ids]);
  }

  remove(ids: Iterable<string>): void {
    const gone = new Set(ids);
    this.set(this.ids.filter((id) => !gone.has(id)));
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
