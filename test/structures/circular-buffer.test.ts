import { describe, expect, it } from 'vitest';
import { CircularBuffer } from '../../src/structures/circular-buffer.js';

describe('CircularBuffer', () => {
  it('rejects invalid capacities', () => {
    expect(() => new CircularBuffer(0)).toThrow(RangeError);
    expect(() => new CircularBuffer(2.5)).toThrow(RangeError);
  });

  it('keeps insertion order while not full', () => {
    const b = new CircularBuffer<number>(3);
    b.push(1);
    b.push(2);
    expect(b.toArray()).toEqual([1, 2]);
    expect(b.size).toBe(2);
    expect(b.isFull).toBe(false);
  });

  it('overwrites the oldest element when full and returns the evicted one', () => {
    const b = new CircularBuffer<number>(3);
    [1, 2, 3].forEach((n) => b.push(n));
    expect(b.push(4)).toBe(1);
    expect(b.push(5)).toBe(2);
    expect(b.toArray()).toEqual([3, 4, 5]);
    expect(b.peekOldest()).toBe(3);
    expect(b.peekNewest()).toBe(5);
  });

  it('shifts from the oldest end and wraps around correctly', () => {
    const b = new CircularBuffer<string>(2);
    b.push('a');
    b.push('b');
    expect(b.shift()).toBe('a');
    b.push('c');
    expect([...b]).toEqual(['b', 'c']);
    expect(b.shift()).toBe('b');
    expect(b.shift()).toBe('c');
    expect(b.shift()).toBeUndefined();
  });

  it('clears', () => {
    const b = new CircularBuffer<number>(2);
    b.push(1);
    b.clear();
    expect(b.size).toBe(0);
    expect(b.peekNewest()).toBeUndefined();
  });
});
