import { describe, expect, it } from 'vitest';
import { MinHeap, TopK } from '../../src/structures/min-heap.js';

describe('MinHeap', () => {
  it('pops in ascending order', () => {
    const h = new MinHeap<number>((a, b) => a - b);
    [5, 3, 8, 1, 9, 2, 7].forEach((n) => h.push(n));
    const out: number[] = [];
    while (h.size) out.push(h.pop() as number);
    expect(out).toEqual([1, 2, 3, 5, 7, 8, 9]);
  });

  it('peek does not remove and empty pop returns undefined', () => {
    const h = new MinHeap<number>((a, b) => a - b);
    expect(h.pop()).toBeUndefined();
    h.push(4);
    expect(h.peek()).toBe(4);
    expect(h.size).toBe(1);
  });

  it('matches Array.sort on random input', () => {
    const values = Array.from({ length: 500 }, (_, i) => (i * 7919) % 1009);
    const h = new MinHeap<number>((a, b) => a - b);
    values.forEach((v) => h.push(v));
    const out: number[] = [];
    while (h.size) out.push(h.pop() as number);
    expect(out).toEqual([...values].sort((a, b) => a - b));
  });
});

describe('TopK', () => {
  it('keeps the k highest scores, ordered descending', () => {
    const t = new TopK<string>(3);
    [['a', 1], ['b', 9], ['c', 5], ['d', 7], ['e', 3]].forEach(([s, n]) => t.add(s as string, n as number));
    expect(t.result()).toEqual(['b', 'd', 'c']);
  });

  it('returns fewer than k when not enough items and keeps first on ties', () => {
    const t = new TopK<string>(2);
    t.add('x', 1);
    expect(t.result()).toEqual(['x']);
    t.add('y', 1);
    t.add('z', 1);
    expect(t.result()).toEqual(['x', 'y']);
  });

  it('rejects invalid k', () => {
    expect(() => new TopK(0)).toThrow(RangeError);
  });
});
