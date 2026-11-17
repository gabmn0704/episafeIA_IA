/**
 * Fixed-capacity ring buffer. Pushing into a full buffer overwrites the
 * oldest element. All operations are O(1) except toArray (O(n)).
 */
export class CircularBuffer<T> {
  private readonly items: (T | undefined)[];
  private head = 0; // index of the oldest element
  private count = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError('capacity must be a positive integer');
    }
    this.items = new Array<T | undefined>(capacity).fill(undefined);
  }

  get size(): number {
    return this.count;
  }

  get isFull(): boolean {
    return this.count === this.capacity;
  }

  /** Adds an element; returns the evicted one when the buffer was full. */
  push(item: T): T | undefined {
    let evicted: T | undefined;
    if (this.count === this.capacity) {
      evicted = this.items[this.head];
      this.items[this.head] = item;
      this.head = (this.head + 1) % this.capacity;
    } else {
      this.items[(this.head + this.count) % this.capacity] = item;
      this.count++;
    }
    return evicted;
  }

  /** Oldest element without removing it. */
  peekOldest(): T | undefined {
    return this.count === 0 ? undefined : this.items[this.head];
  }

  /** Newest element without removing it. */
  peekNewest(): T | undefined {
    return this.count === 0 ? undefined : this.items[(this.head + this.count - 1) % this.capacity];
  }

  /** Removes and returns the oldest element. */
  shift(): T | undefined {
    if (this.count === 0) return undefined;
    const value = this.items[this.head];
    this.items[this.head] = undefined;
    this.head = (this.head + 1) % this.capacity;
    this.count--;
    return value;
  }

  /** Elements ordered from oldest to newest. */
  toArray(): T[] {
    const out: T[] = [];
    for (let i = 0; i < this.count; i++) {
      out.push(this.items[(this.head + i) % this.capacity] as T);
    }
    return out;
  }

  clear(): void {
    this.items.fill(undefined);
    this.head = 0;
    this.count = 0;
  }

  *[Symbol.iterator](): IterableIterator<T> {
    for (let i = 0; i < this.count; i++) {
      yield this.items[(this.head + i) % this.capacity] as T;
    }
  }
}
