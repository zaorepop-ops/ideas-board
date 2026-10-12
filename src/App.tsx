import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, KeyboardSensor, closestCenter, useSensor, useSensors,
  MeasuringStrategy, type DragEndEvent, type DragMoveEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Board, Store } from './types';
import { loadStore, saveStore, exportJson, importJson } from './storage';
import {
  addIdea, countIdeas, deleteIdea, editIdea, emptyBoard, flatten, indent, moveDown, moveIdea, moveUp, outdent,
  projectDrop, setOpen, siblings, subtreeIds,
} from './tree';
import { IdeaRow } from './IdeaRow';
import { Sheet } from './Sheet';
import './App.css';

const useStep = () => {
  const q = '(min-width: 600px)';
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setWide(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return wide ? 28 : 18;
};

interface Toast { msg: string; undo?: Board }

export default function App() {
  const [store, setStore] = useState<Store>(loadStore);
  const board = store.boards.find((b) => b.id === store.currentId) ?? store.boards[0];
  const step = useStep();
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'boards' | 'more'>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dx, setDx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => saveStore(store), [store]);

  const flash = (t: Toast) => {
    setToast(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  };

  const update = useCallback((f: (b: Board) => Board) => {
    setStore((s) => ({ ...s, boards: s.boards.map((b) => (b.id === s.currentId ? f(b) : b)) }));
  }, []);

  const rows = useMemo(() => flatten(board, activeId ?? undefined), [board, activeId]);
  const projected = activeId && overId ? projectDrop(rows, activeId, overId, dx, step) : null;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dragEndAt = useRef(0);
  const resetDrag = () => { dragEndAt.current = Date.now(); setActiveId(null); setOverId(null); setDx(0); };
  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id)); setOverId(String(e.active.id)); setMenuId(null);
    navigator.vibrate?.(10);
  };
  const onDragMove = (e: DragMoveEvent) => setDx(e.delta.x);
  const onDragOver = (e: DragOverEvent) => setOverId(e.over ? String(e.over.id) : null);
  const onDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    const p = e.over ? projectDrop(rows, id, String(e.over.id), e.delta.x, step) : null;
    resetDrag();
    if (p) update((b) => moveIdea(b, id, p.parent, p.index));
  };

  const submitNew = (e: React.FormEvent) => {
    e.preventDefault();
    const t = newText.trim();
    if (!t) return;
    update((b) => addIdea(b, t).board);
    setNewText('');
    inputRef.current?.focus(); // keep the keyboard open for the next idea
    requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight }));
  };

  const addChild = (parent: string) => {
    const r = addIdea(board, '', parent);
    if (!r.id) return;
    update(() => r.board);
    setEditingId(r.id);
  };

  const commitEdit = (id: string, text: string) => {
    setEditingId(null);
    const t = text.trim();
    if (!t) {
      // an empty new idea is just dropped; an existing idea keeps its text
      if (!board.ideas[id]?.text) update((b) => deleteIdea(b, id));
      return;
    }
    update((b) => editIdea(b, id, t));
  };

  const remove = (id: string) => {
    const n = subtreeIds(board, id).length;
    const before = board;
    update((b) => deleteIdea(b, id));
    setMenuId(null);
    flash({ msg: n > 1 ? `Deleted ${n} ideas` : 'Deleted 1 idea', undo: before });
  };

  const undo = () => {
    const prev = toast?.undo;
    if (!prev) return;
    setStore((s) => ({ ...s, boards: s.boards.map((b) => (b.id === prev.id ? prev : b)) }));
    setToast(null);
  };

  // boards
  const newBoard = () => {
    const name = prompt('Name for the new board', 'New board');
    if (name === null) return;
    const b = emptyBoard(name.trim() || 'New board');
    setStore((s) => ({ ...s, boards: [...s.boards, b], currentId: b.id }));
    setSheet(null);
  };
  const renameBoard = (id: string) => {
    const cur = store.boards.find((b) => b.id === id);
    const name = prompt('Rename board', cur?.name ?? '');
    if (!name?.trim()) return;
    setStore((s) => ({ ...s, boards: s.boards.map((b) => (b.id === id ? { ...b, name: name.trim() } : b)) }));
  };
  const deleteBoard = (id: string) => {
    const b = store.boards.find((x) => x.id === id);
    if (!b || !confirm(`Delete “${b.name}” and its ${countIdeas(b)} ideas? This can't be undone.`)) return;
    setStore((s) => {
      let boards = s.boards.filter((x) => x.id !== id);
      if (!boards.length) boards = [emptyBoard()];
      return { ...s, boards, currentId: boards.some((x) => x.id === s.currentId) ? s.currentId : boards[0].id };
    });
  };

  const doExport = () => {
    const blob = new Blob([exportJson(store)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ideas-board-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setSheet(null);
  };
  const doImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      const r = importJson(store, await f.text());
      setStore(r.store);
      flash({ msg: `Imported ${r.added} board${r.added > 1 ? 's' : ''}` });
    } catch (err) {
      flash({ msg: `Import failed: ${err instanceof Error ? err.message : 'invalid file'}` });
    }
    setSheet(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const menuRow = menuId ? rows.find((r) => r.id === menuId) : undefined;
  const menuIdx = menuRow ? siblings(board, menuRow.parent).indexOf(menuRow.id) : -1;
  const menuSibs = menuRow ? siblings(board, menuRow.parent).length : 0;
  const act = (f: (b: Board) => Board) => { update(f); setMenuId(null); };
  const total = countIdeas(board);
  const activeRow = activeId ? rows.find((r) => r.id === activeId) : undefined;

  return (
    <div className="app" style={{ '--step': `${step}px` } as React.CSSProperties}>
      <header className="top">
        <button className="board-name" onClick={() => setSheet('boards')} aria-label="Switch board">
          <span className="name">{board.name}</span><span className="caret">▾</span>
        </button>
        <span className="count">{total === 1 ? '1 idea' : `${total} ideas`}</span>
        <button className="icon-btn" onClick={() => setSheet('more')} aria-label="Menu">⋯</button>
      </header>

      <main className="list">
        {rows.length === 0 && (
          <div className="empty">
            <div className="empty-icon" aria-hidden="true">💡</div>
            <h2>A blank board</h2>
            <p>Type an idea below and press Enter. Add as many as you like, then group them into a tree.</p>
          </div>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={onDragStart} onDragMove={onDragMove} onDragOver={onDragOver}
          onDragEnd={onDragEnd} onDragCancel={resetDrag}
        >
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            {rows.map((r) => (
              <IdeaRow
                key={r.id}
                row={r}
                depth={r.id === activeId && projected ? projected.depth : r.depth}
                editing={editingId === r.id}
                onEdit={() => setEditingId(r.id)}
                onCommit={(t) => commitEdit(r.id, t)}
                onToggle={() => update((b) => setOpen(b, r.id, !r.open))}
                onAddChild={() => addChild(r.id)}
                onMenu={() => { if (Date.now() - dragEndAt.current > 400) setMenuId(r.id); }}
              />
            ))}
          </SortableContext>
          <DragOverlay>
            {activeRow && <div className="card overlay"><span className="text">{activeRow.text}</span></div>}
          </DragOverlay>
        </DndContext>
        {rows.length > 0 && (
          <p className="hint">Tap text to edit · ＋ adds a sub-idea · tap ⠿ for more · hold ⠿ and drag to move (drag right to nest)</p>
        )}
      </main>

      <form className="composer" onSubmit={submitNew}>
        <input
          ref={inputRef}
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="New idea"
          enterKeyHint="send"
          aria-label="New idea"
        />
        <button className="add-btn" type="submit" disabled={!newText.trim()}
          onMouseDown={(e) => e.preventDefault()} onTouchEnd={(e) => { e.preventDefault(); submitNew(e as unknown as React.FormEvent); }}>
          Add
        </button>
      </form>

      {menuRow && (
        <Sheet title={menuRow.text || 'Idea'} onClose={() => setMenuId(null)}>
          <button onClick={() => { setMenuId(null); setEditingId(menuRow.id); }}>✎ Edit</button>
          <button onClick={() => { setMenuId(null); addChild(menuRow.id); }}>＋ Add sub-idea</button>
          {menuRow.childCount > 0 && (
            <button onClick={() => act((b) => setOpen(b, menuRow.id, !menuRow.open))}>
              {menuRow.open ? '▸ Collapse' : '▾ Expand'} ({menuRow.childCount})
            </button>
          )}
          <div className="sheet-grid">
            <button disabled={menuIdx <= 0} onClick={() => act((b) => moveUp(b, menuRow.id))}>↑ Up</button>
            <button disabled={menuIdx >= menuSibs - 1} onClick={() => act((b) => moveDown(b, menuRow.id))}>↓ Down</button>
            <button disabled={menuRow.parent === null} onClick={() => act((b) => outdent(b, menuRow.id))}>← Outdent</button>
            <button disabled={menuIdx <= 0} onClick={() => act((b) => indent(b, menuRow.id))}>→ Indent</button>
          </div>
          <button className="danger" onClick={() => remove(menuRow.id)}>
            🗑 Delete{menuRow.childCount ? ' with sub-ideas' : ''}
          </button>
        </Sheet>
      )}

      {sheet === 'boards' && (
        <Sheet title="Boards" onClose={() => setSheet(null)}>
          {store.boards.map((b) => (
            <div key={b.id} className={`board-item ${b.id === board.id ? 'current' : ''}`}>
              <button className="pick" onClick={() => { setStore((s) => ({ ...s, currentId: b.id })); setSheet(null); }}>
                <span className="name">{b.name}</span><span className="count">{countIdeas(b)}</span>
              </button>
              <button className="icon-btn" aria-label={`Rename ${b.name}`} onClick={() => renameBoard(b.id)}>✎</button>
              <button className="icon-btn" aria-label={`Delete ${b.name}`} onClick={() => deleteBoard(b.id)}>🗑</button>
            </div>
          ))}
          <button className="primary" onClick={newBoard}>＋ New board</button>
        </Sheet>
      )}

      {sheet === 'more' && (
        <Sheet title="The Ideas Board" onClose={() => setSheet(null)}>
          <button onClick={doExport}>⤓ Export backup (JSON)</button>
          <button onClick={() => fileRef.current?.click()}>⤒ Import backup…</button>
          <p className="sheet-note">Your ideas are stored only on this device. Export a backup now and then.</p>
        </Sheet>
      )}
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => doImport(e.target.files?.[0])} />

      {toast && (
        <div className="toast" role="status">
          <span>{toast.msg}</span>
          {toast.undo && <button onClick={undo}>Undo</button>}
        </div>
      )}
    </div>
  );
}

