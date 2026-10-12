import { useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Row } from './tree';

interface Props {
  row: Row;
  depth: number;
  editing: boolean;
  onEdit: () => void;
  onCommit: (text: string) => void;
  onToggle: () => void;
  onAddChild: () => void;
  onMenu: () => void;
}

export function IdeaRow({ row, depth, editing, onEdit, onCommit, onToggle, onAddChild, onMenu }: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id });
  const [draft, setDraft] = useState(row.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!editing) return;
    setDraft(row.text);
    done.current = false;
    const t = ref.current;
    if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = ref.current;
    if (t) { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; }
  }, [draft, editing]);

  const finish = (text: string) => {
    if (done.current) return;
    done.current = true;
    onCommit(text);
  };

  // tree guides: ancestor columns + own elbow
  const guides = [];
  for (let k = 0; k < depth - 1; k++) {
    if (!isDragging && row.guides[k + 1]) guides.push(<span key={k} className="g-v" style={{ '--col': k } as React.CSSProperties} />);
  }
  if (depth > 0) guides.push(
    <span key="e" className={`g-elbow ${row.isLast || isDragging ? 'last' : ''}`} style={{ '--col': depth - 1 } as React.CSSProperties} />,
  );

  return (
    <div
      ref={setNodeRef}
      className={`row ${isDragging ? 'dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition, '--depth': depth } as React.CSSProperties}
      data-id={row.id}
    >
      {guides}
      <div className={`card ${editing ? 'editing' : ''}`}>
        {row.childCount > 0 ? (
          <button className={`chev ${row.open ? 'open' : ''}`} onClick={onToggle}
            aria-label={row.open ? 'Collapse' : 'Expand'} aria-expanded={row.open}>
            <span>▸</span>
            {!row.open && <span className="badge">{row.childCount}</span>}
          </button>
        ) : <span className="chev-spacer" />}
        {editing ? (
          <textarea
            ref={ref}
            className="edit"
            rows={1}
            value={draft}
            placeholder="Write the idea…"
            enterKeyHint="done"
            onChange={(e) => setDraft(e.target.value.replace(/\r?\n/g, ' '))}
            onBlur={() => finish(draft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); finish(draft); }
              else if (e.key === 'Escape') { e.preventDefault(); finish(row.text); }
            }}
          />
        ) : (
          <p className={`text ${row.text ? '' : 'placeholder'}`} onClick={onEdit}>{row.text || 'Untitled'}</p>
        )}
        <button className="row-btn add" onClick={onAddChild} aria-label="Add sub-idea">＋</button>
        <button
          ref={setActivatorNodeRef}
          className="row-btn handle"
          aria-label="More actions (hold to drag)"
          {...attributes}
          {...listeners}
          onClick={onMenu}
          onContextMenu={(e) => e.preventDefault()}
        >⠿</button>
      </div>
    </div>
  );
}
