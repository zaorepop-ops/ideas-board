import type { Board, Idea } from './types';

export function newId(prefix = 'i') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function emptyBoard(name = 'My ideas'): Board {
  const t = Date.now();
  return { id: newId('b'), name, ideas: {}, roots: [], children: {}, createdAt: t, updatedAt: t };
}

const touch = (b: Board): Board => ({ ...b, updatedAt: Date.now() });

/** Parent id of an idea (null = top level, undefined = not found) */
export function parentOf(b: Board, id: string): string | null | undefined {
  if (b.roots.includes(id)) return null;
  for (const [p, ids] of Object.entries(b.children)) if (ids.includes(id)) return p;
  return undefined;
}

export function siblings(b: Board, parent: string | null): string[] {
  return parent === null ? b.roots : b.children[parent] ?? [];
}

function setSiblings(b: Board, parent: string | null, list: string[]): Board {
  if (parent === null) return { ...b, roots: list };
  const children = { ...b.children };
  if (list.length) children[parent] = list;
  else delete children[parent];
  return { ...b, children };
}

/** The idea and all of its descendants */
export function subtreeIds(b: Board, id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const x = stack.pop()!;
    if (out.includes(x)) continue;
    out.push(x);
    stack.push(...(b.children[x] ?? []));
  }
  return out;
}

export function addIdea(b: Board, text: string, parent: string | null = null): { board: Board; id: string } {
  if (parent !== null && !b.ideas[parent]) return { board: b, id: '' };
  const t = Date.now();
  const idea: Idea = { id: newId(), text, open: true, createdAt: t, updatedAt: t };
  let next: Board = { ...b, ideas: { ...b.ideas, [idea.id]: idea } };
  next = setSiblings(next, parent, [...siblings(next, parent), idea.id]);
  if (parent !== null) next.ideas[parent] = { ...next.ideas[parent], open: true };
  return { board: touch(next), id: idea.id };
}

export function editIdea(b: Board, id: string, text: string): Board {
  const i = b.ideas[id];
  if (!i || i.text === text) return b;
  return touch({ ...b, ideas: { ...b.ideas, [id]: { ...i, text, updatedAt: Date.now() } } });
}

export function setOpen(b: Board, id: string, open: boolean): Board {
  const i = b.ideas[id];
  if (!i || i.open === open) return b;
  return { ...b, ideas: { ...b.ideas, [id]: { ...i, open } } };
}

/** Delete an idea together with all of its children */
export function deleteIdea(b: Board, id: string): Board {
  const parent = parentOf(b, id);
  if (parent === undefined) return b;
  let next = setSiblings(b, parent, siblings(b, parent).filter((x) => x !== id));
  const gone = subtreeIds(b, id);
  const ideas = { ...next.ideas };
  const children = { ...next.children };
  for (const x of gone) { delete ideas[x]; delete children[x]; }
  next = { ...next, ideas, children };
  return touch(next);
}

/**
 * Move an idea (with its children) under `parent` (null = top level) at `index`
 * (index in the list after removing the idea; omitted = end). Moving into its own subtree is refused.
 */
export function moveIdea(b: Board, id: string, parent: string | null, index?: number): Board {
  const from = parentOf(b, id);
  if (from === undefined) return b;
  if (parent !== null && (!b.ideas[parent] || subtreeIds(b, id).includes(parent))) return b;
  let next = setSiblings(b, from, siblings(b, from).filter((x) => x !== id));
  const list = [...siblings(next, parent)];
  const at = index === undefined || index < 0 || index > list.length ? list.length : index;
  list.splice(at, 0, id);
  next = setSiblings(next, parent, list);
  if (parent !== null) next = setOpen(next, parent, true);
  return touch(next);
}

export function moveUp(b: Board, id: string): Board {
  const p = parentOf(b, id);
  if (p === undefined) return b;
  const i = siblings(b, p).indexOf(id);
  return i > 0 ? moveIdea(b, id, p, i - 1) : b;
}

export function moveDown(b: Board, id: string): Board {
  const p = parentOf(b, id);
  if (p === undefined) return b;
  const list = siblings(b, p);
  const i = list.indexOf(id);
  return i >= 0 && i < list.length - 1 ? moveIdea(b, id, p, i + 1) : b;
}

/** Make the idea the last child of the sibling above it */
export function indent(b: Board, id: string): Board {
  const p = parentOf(b, id);
  if (p === undefined) return b;
  const list = siblings(b, p);
  const i = list.indexOf(id);
  return i > 0 ? moveIdea(b, id, list[i - 1]) : b;
}

/** Move the idea out of its parent, right after the parent */
export function outdent(b: Board, id: string): Board {
  const p = parentOf(b, id);
  if (p === undefined || p === null) return b;
  const gp = parentOf(b, p);
  if (gp === undefined) return b;
  const at = siblings(b, gp).indexOf(p) + 1;
  return moveIdea(b, id, gp, at);
}

export interface Row {
  id: string;
  text: string;
  depth: number;
  parent: string | null;
  childCount: number;
  open: boolean;
  isLast: boolean;
  /** For each ancestor level: whether a vertical guide continues (ancestor is not the last child) */
  guides: boolean[];
}

/** Visible rows in display order (children of closed ideas are hidden) */
export function flatten(b: Board, hide?: string): Row[] {
  const rows: Row[] = [];
  const walk = (ids: string[], parent: string | null, depth: number, guides: boolean[]) => {
    const list = ids.filter((x) => b.ideas[x]);
    list.forEach((id, n) => {
      const kids = (b.children[id] ?? []).filter((x) => b.ideas[x]);
      const idea = b.ideas[id];
      const isLast = n === list.length - 1;
      rows.push({ id, text: idea.text, depth, parent, childCount: kids.length, open: idea.open, isLast, guides });
      if (idea.open && kids.length && id !== hide) walk(kids, id, depth + 1, [...guides, !isLast]);
    });
  };
  walk(b.roots, null, 0, []);
  return rows;
}

export function countIdeas(b: Board) {
  return Object.keys(b.ideas).length;
}

/**
 * Drag projection for a flat list: where would `activeId` land if dropped over `overId`
 * with a horizontal offset of `dx` px (indent step `step`)?
 */
export function projectDrop(rows: Row[], activeId: string, overId: string, dx: number, step: number):
  { parent: string | null; index: number; depth: number } | null {
  const from = rows.findIndex((r) => r.id === activeId);
  const to = rows.findIndex((r) => r.id === overId);
  if (from < 0 || to < 0) return null;
  const active = rows[from];
  // rows without the dragged one, with it re-inserted at the target slot
  const moved = rows.filter((r) => r.id !== activeId);
  moved.splice(to, 0, active);
  const prev = moved[to - 1];
  const nextRow = moved[to + 1];
  const wanted = active.depth + Math.round(dx / step);
  const max = prev ? prev.depth + 1 : 0;
  const min = nextRow ? nextRow.depth : 0;
  const depth = Math.max(min, Math.min(max, wanted));
  // parent = nearest previous row at depth-1
  let parent: string | null = null;
  if (depth > 0) {
    for (let i = to - 1; i >= 0; i--) if (moved[i].depth === depth - 1) { parent = moved[i].id; break; }
  }
  // index among visible siblings above the slot
  let index = 0;
  for (let i = to - 1; i >= 0; i--) {
    if (moved[i].depth < depth) break;
    if (moved[i].depth === depth) index++;
  }
  return { parent, index, depth };
}
