import { describe, expect, it } from 'vitest';
import { Graph } from '../../src/structures/graph.js';

describe('Graph', () => {
  it('accumulates symmetric edge weights and ignores self loops', () => {
    const g = new Graph();
    g.addEdge('sleep', 'stress');
    g.addEdge('stress', 'sleep', 2);
    g.addEdge('sleep', 'sleep');
    expect(g.weight('sleep', 'stress')).toBe(3);
    expect(g.weight('stress', 'sleep')).toBe(3);
    expect(g.nodes()).toHaveLength(2);
    expect(g.strength('sleep')).toBe(3);
  });

  it('lists each edge once, heaviest first', () => {
    const g = new Graph();
    g.addEdge('a', 'b', 1);
    g.addEdge('b', 'c', 5);
    g.addEdge('c', 'a', 3);
    expect(g.edges().map((e) => e.weight)).toEqual([5, 3, 1]);
  });

  it('traverses with BFS and finds components', () => {
    const g = new Graph();
    g.addEdge('a', 'b');
    g.addEdge('b', 'c');
    g.addEdge('x', 'y');
    g.addNode('z');
    expect(g.bfs('a')).toEqual(['a', 'b', 'c']);
    expect(g.bfs('nope')).toEqual([]);
    expect(g.components()).toEqual([['a', 'b', 'c'], ['x', 'y'], ['z']]);
  });
});
