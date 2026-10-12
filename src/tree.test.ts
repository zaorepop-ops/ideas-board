import { describe, expect, it } from 'vitest';
import { addIdea, deleteIdea, emptyBoard, flatten, indent, moveDown, moveIdea, moveUp, outdent, parentOf, projectDrop } from './tree';
import { exportJson, freshStore, importJson, sanitizeBoard } from './storage';
import type { Board } from './types';

function build() {
  let b = emptyBoard('T');
  const add = (t: string, p: string | null = null) => { const r = addIdea(b, t, p); b = r.board; return r.id; };
  const a = add('A'); const a1 = add('A1', a); const a1x = add('A1x', a1); const bb = add('B'); const c = add('C');
  return { get b() { return b; }, a, a1, a1x, bb, c };
}

describe('tree ops', () => {
  it('adds top-level and child ideas', () => {
    const t = build();
    expect(t.b.roots).toEqual([t.a, t.bb, t.c]);
    expect(t.b.children[t.a]).toEqual([t.a1]);
    expect(flatten(t.b).map((r) => [r.text, r.depth])).toEqual([['A', 0], ['A1', 1], ['A1x', 2], ['B', 0], ['C', 0]]);
  });
  it('indents, outdents and nests', () => {
    const t = build();
    let b = indent(t.b, t.bb);
    expect(parentOf(b, t.bb)).toBe(t.a);
    expect(b.children[t.a]).toEqual([t.a1, t.bb]);
    b = outdent(b, t.bb);
    expect(b.roots).toEqual([t.a, t.bb, t.c]);
    expect(indent(b, t.a)).toBe(b); // first item cannot be indented
  });
  it('moves up/down and refuses cycles', () => {
    const t = build();
    expect(moveUp(t.b, t.c).roots).toEqual([t.a, t.c, t.bb]);
    expect(moveDown(t.b, t.a).roots).toEqual([t.bb, t.a, t.c]);
    expect(moveIdea(t.b, t.a, t.a1x)).toBe(t.b);
    const m = moveIdea(t.b, t.a1, null, 0);
    expect(m.roots).toEqual([t.a1, t.a, t.bb, t.c]);
    expect(m.children[t.a1]).toEqual([t.a1x]); // children travel along
  });
  it('deletes an idea with all its children', () => {
    const t = build();
    const b = deleteIdea(t.b, t.a);
    expect(Object.keys(b.ideas).sort()).toEqual([t.bb, t.c].sort());
    expect(b.children).toEqual({});
  });
  it('projects drag drops with horizontal offset', () => {
    const t = build();
    const rows = flatten(t.b);
    // C dragged one step right nests under B
    expect(projectDrop(rows, t.c, t.c, 20, 20)).toEqual({ parent: t.bb, index: 0, depth: 1 });
    expect(projectDrop(rows, t.c, t.c, 0, 20)).toEqual({ parent: null, index: 2, depth: 0 });
  });
});

describe('import / export', () => {
  it('round-trips and never overwrites existing boards', () => {
    const t = build();
    const store = { ...freshStore(), boards: [t.b], currentId: t.b.id };
    const json = exportJson(store);
    const r = importJson(store, json);
    expect(r.added).toBe(1);
    expect(r.store.boards).toHaveLength(2);
    const copy = r.store.boards[1];
    expect(copy.id).not.toBe(t.b.id);
    expect(flatten(copy).map((x) => x.text)).toEqual(flatten(t.b).map((x) => x.text));
  });
  it('sanitizes broken data and rejects junk', () => {
    const b = sanitizeBoard({ ideas: { x: { text: 'X' }, y: { text: 'Y' } }, roots: ['x', 'x', 'nope'], children: { x: ['y', 'x'] } }) as Board;
    expect(b.roots).toEqual(['x']);
    expect(b.children).toEqual({ x: ['y'] });
    expect(() => importJson(freshStore(), '{"hello":1}')).toThrow();
  });
});
