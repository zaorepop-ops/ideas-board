import type { Board, Idea, Store } from './types';
import { emptyBoard, newId } from './tree';

export const KEY = 'ideas-board:v1';

/** Clean up a board from untrusted JSON: drop unknown ids, duplicates and cycles */
export function sanitizeBoard(raw: unknown): Board | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Board>;
  if (!r.ideas || typeof r.ideas !== 'object' || !Array.isArray(r.roots)) return null;
  const now = Date.now();
  const ideas: Record<string, Idea> = {};
  for (const [id, i] of Object.entries(r.ideas as Record<string, Partial<Idea>>)) {
    if (!i || typeof i.text !== 'string') continue;
    ideas[id] = {
      id, text: i.text, open: i.open !== false,
      createdAt: typeof i.createdAt === 'number' ? i.createdAt : now,
      updatedAt: typeof i.updatedAt === 'number' ? i.updatedAt : now,
    };
  }
  const rawKids = (r.children && typeof r.children === 'object' ? r.children : {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const take = (ids: unknown) => (Array.isArray(ids) ? ids : []).filter(
    (id): id is string => typeof id === 'string' && !!ideas[id] && !seen.has(id) && !!seen.add(id));
  const roots = take(r.roots);
  const children: Record<string, string[]> = {};
  const queue = [...roots];
  while (queue.length) {
    const id = queue.shift()!;
    const kids = take(rawKids[id]);
    if (kids.length) children[id] = kids;
    queue.push(...kids);
  }
  for (const id of Object.keys(ideas)) if (!seen.has(id)) { seen.add(id); roots.push(id); }
  return {
    id: typeof r.id === 'string' && r.id ? r.id : newId('b'),
    name: typeof r.name === 'string' && r.name.trim() ? r.name : 'Imported',
    ideas, roots, children,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now,
  };
}

export function sanitizeStore(raw: unknown): Store | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Store>;
  if (!Array.isArray(r.boards)) return null;
  const ids = new Set<string>();
  const boards: Board[] = [];
  for (const x of r.boards) {
    const b = sanitizeBoard(x);
    if (!b) continue;
    if (ids.has(b.id)) b.id = newId('b');
    ids.add(b.id);
    boards.push(b);
  }
  if (!boards.length) boards.push(emptyBoard());
  const currentId = boards.some((b) => b.id === r.currentId) ? r.currentId! : boards[0].id;
  return { version: 1, boards, currentId };
}

export function freshStore(): Store {
  const b = emptyBoard();
  return { version: 1, boards: [b], currentId: b.id };
}

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return sanitizeStore(JSON.parse(raw)) ?? freshStore();
  } catch { /* corrupted: start fresh */ }
  return freshStore();
}

export function saveStore(s: Store) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota */ }
}

export function exportJson(s: Store): string {
  return JSON.stringify({ app: 'ideas-board', exportedAt: new Date().toISOString(), ...s }, null, 2);
}

/**
 * Import a backup (a whole export or a single board). Imported boards are added next to the
 * existing ones; boards whose id already exists get a new id so nothing is overwritten.
 */
export function importJson(current: Store, text: string): { store: Store; added: number } {
  const data = JSON.parse(text);
  const incoming = Array.isArray(data?.boards)
    ? sanitizeStore(data)?.boards ?? []
    : [sanitizeBoard(data)].filter((b): b is Board => !!b);
  if (!incoming.length) throw new Error('No boards found in this file.');
  const ids = new Set(current.boards.map((b) => b.id));
  const added = incoming.map((b) => (ids.has(b.id) ? { ...b, id: newId('b') } : b));
  return { store: { ...current, boards: [...current.boards, ...added], currentId: added[0].id }, added: added.length };
}
