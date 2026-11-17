export interface Edge<N extends string> {
  a: N;
  b: N;
  weight: number;
}

/** Undirected weighted graph (adjacency map). Used for trigger co-occurrence. */
export class Graph<N extends string = string> {
  private readonly adj = new Map<N, Map<N, number>>();

  addNode(n: N): void {
    if (!this.adj.has(n)) this.adj.set(n, new Map());
  }

  /** Adds `weight` to the edge a-b, creating it when missing. */
  addEdge(a: N, b: N, weight = 1): void {
    if (a === b) return;
    this.addNode(a);
    this.addNode(b);
    this.adj.get(a)!.set(b, (this.adj.get(a)!.get(b) ?? 0) + weight);
    this.adj.get(b)!.set(a, (this.adj.get(b)!.get(a) ?? 0) + weight);
  }

  hasNode(n: N): boolean {
    return this.adj.has(n);
  }

  weight(a: N, b: N): number {
    return this.adj.get(a)?.get(b) ?? 0;
  }

  nodes(): N[] {
    return [...this.adj.keys()];
  }

  neighbors(n: N): N[] {
    return [...(this.adj.get(n)?.keys() ?? [])];
  }

  /** Sum of the weights of the edges touching n. */
  strength(n: N): number {
    let s = 0;
    for (const w of this.adj.get(n)?.values() ?? []) s += w;
    return s;
  }

  /** Each undirected edge once, heaviest first. */
  edges(): Edge<N>[] {
    const out: Edge<N>[] = [];
    const seen = new Set<string>();
    for (const [a, nbrs] of this.adj) {
      for (const [b, weight] of nbrs) {
        const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ a, b, weight });
      }
    }
    return out.sort((x, y) => y.weight - x.weight || (x.a + x.b).localeCompare(y.a + y.b));
  }

  /** Breadth-first traversal from `start` (nodes in visit order). */
  bfs(start: N): N[] {
    if (!this.adj.has(start)) return [];
    const order: N[] = [];
    const seen = new Set<N>([start]);
    const queue: N[] = [start];
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i] as N;
      order.push(cur);
      for (const nb of this.neighbors(cur)) {
        if (!seen.has(nb)) {
          seen.add(nb);
          queue.push(nb);
        }
      }
    }
    return order;
  }

  /** Connected components, each sorted alphabetically; largest first. */
  components(): N[][] {
    const seen = new Set<N>();
    const out: N[][] = [];
    for (const n of this.adj.keys()) {
      if (seen.has(n)) continue;
      const comp = this.bfs(n);
      comp.forEach((c) => seen.add(c));
      out.push(comp.sort());
    }
    return out.sort((a, b) => b.length - a.length);
  }
}
