import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";
import { LABELS, STATUSES, type ReadingStatus } from "./readingStatus";

type Props = {
  value: ReadingStatus | null;
  owner: boolean;
  onChange: (next: ReadingStatus | null) => void;
  onFilter?: (next: ReadingStatus) => void;
};

export function StatusChip({ value, owner, onChange, onFilter }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function stop(event: SyntheticEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (!owner) {
    if (!value) return null;
    return (
      <button
        type="button"
        className={`status-chip is-${value}`}
        data-status={value}
        aria-label={`阅读状态：${LABELS[value]}`}
        onClick={(event) => {
          stop(event);
          onFilter?.(value);
        }}
        onPointerDown={stop}
      >
        {LABELS[value]}
      </button>
    );
  }

  return (
    <div className={`status-wrap${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`status-chip ${value ? `is-${value}` : "is-add"}`}
        data-status={value ?? ""}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={value ? `阅读状态：${LABELS[value]}` : "添加阅读状态"}
        onClick={(event) => {
          stop(event);
          setOpen((next) => !next);
        }}
        onPointerDown={stop}
      >
        {value ? LABELS[value] : "+"}
      </button>
      {open ? (
        <div className="status-menu" id={menuId} role="menu" aria-label="Reading status">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={value === null}
            onPointerDown={stop}
            onClick={(event) => {
              stop(event);
              onChange(null);
              window.setTimeout(() => setOpen(false), 160);
            }}
          >
            无状态
          </button>
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              role="menuitemradio"
              aria-checked={value === status}
              className={`is-${status}`}
              onPointerDown={stop}
              onClick={(event) => {
                stop(event);
                onChange(status);
                window.setTimeout(() => setOpen(false), 160);
              }}
            >
              {LABELS[status]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
