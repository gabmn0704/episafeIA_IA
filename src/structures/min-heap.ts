export type Comparator<T> = (a: T, b: T) => number;

/** Binary min-heap backed by an array. push/pop are O(log n), peek is O(1). */
export class MinHeap<T> {
  private readonly data: T[] = [];

  constructor(private readonly compare: Comparator<T>) {}

  get size(): number {
    return this.data.length;
  }

  peek(): T | undefined {
    return this.data[0];
  }

  push(item: T): void {
    this.data.push(item);
    this.siftUp(this.data.length - 1);
  }

  pop(): T | undefined {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0 && last !== undefined) {
      this.data[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  toArray(): T[] {
    return [...this.data];
  }

  private siftUp(start: number): void {
    let i = start;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(this.data[i] as T, this.data[parent] as T) >= 0) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  private siftDown(start: number): void {
    let i = start;
    const n = this.data.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let smallest = i;
      if (l < n && this.compare(this.data[l] as T, this.data[smallest] as T) < 0) smallest = l;
      if (r < n && this.compare(this.data[r] as T, this.data[smallest] as T) < 0) smallest = r;
      if (smallest === i) return;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(i: number, j: number): void {
    const tmp = this.data[i] as T;
    this.data[i] = this.data[j] as T;
    this.data[j] = tmp;
  }
}

/**
 * Keeps the k items with the highest score using a bounded min-heap:
 * O(n log k) instead of sorting everything.
 */
export class TopK<T> {
  private readonly heap: MinHeap<{ score: number; seq: number; item: T }>;
  private seq = 0;

  constructor(private readonly k: number) {
    if (!Number.isInteger(k) || k <= 0) throw new RangeError('k must be a positive integer');
    // Lower score first; on ties, the most recent insertion is evicted first (stable keep-first).
    this.heap = new MinHeap((a, b) => a.score - b.score || b.seq - a.seq);
  }

  add(item: T, score: number): void {
    const entry = { score, seq: this.seq++, item };
    if (this.heap.size < this.k) {
      this.heap.push(entry);
    } else {
      const min = this.heap.peek();
      if (min && score > min.score) {
        this.heap.pop();
        this.heap.push(entry);
      }
    }
  }

  /** Items ordered from highest to lowest score. */
  result(): T[] {
    return this.heap
      .toArray()
      .sort((a, b) => b.score - a.score || a.seq - b.seq)
      .map((e) => e.item);
  }
}
