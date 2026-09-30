/**
 * Array-backed binary min-heap of integer values ordered by (priority, tie).
 * Equal priorities pop in ascending `tie` order, which keeps searches deterministic.
 */
export class MinHeap {
  #priority: number[] = [];
  #tie: number[] = [];
  #value: number[] = [];

  get size(): number {
    return this.#value.length;
  }

  push(priority: number, tie: number, value: number): void {
    let i = this.#value.length;
    this.#priority.push(priority);
    this.#tie.push(tie);
    this.#value.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.#less(i, parent)) break;
      this.#swap(i, parent);
      i = parent;
    }
  }

  /** The priority of the smallest entry, or Infinity when empty. */
  peekPriority(): number {
    return this.#priority[0] ?? Infinity;
  }

  /** Removes and returns the smallest entry's value; -1 when empty. */
  pop(): number {
    const size = this.#value.length;
    if (!size) return -1;
    const top = this.#value[0]!;
    const last = size - 1;
    this.#swap(0, last);
    this.#priority.pop();
    this.#tie.pop();
    this.#value.pop();
    let i = 0;
    for (;;) {
      const left = 2 * i + 1,
        right = left + 1;
      let smallest = i;
      if (left < last && this.#less(left, smallest)) smallest = left;
      if (right < last && this.#less(right, smallest)) smallest = right;
      if (smallest === i) break;
      this.#swap(i, smallest);
      i = smallest;
    }
    return top;
  }

  #less(a: number, b: number): boolean {
    const pa = this.#priority[a]!,
      pb = this.#priority[b]!;
    return pa < pb || (pa === pb && this.#tie[a]! < this.#tie[b]!);
  }

  #swap(a: number, b: number): void {
    const p = this.#priority[a]!,
      t = this.#tie[a]!,
      v = this.#value[a]!;
    this.#priority[a] = this.#priority[b]!;
    this.#tie[a] = this.#tie[b]!;
    this.#value[a] = this.#value[b]!;
    this.#priority[b] = p;
    this.#tie[b] = t;
    this.#value[b] = v;
  }
}
