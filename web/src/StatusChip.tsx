import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";
import { LABELS, STATUSES, type ReadingStatus } from "./readingStatus";

type Props = {
  value: ReadingStatus | null;
  onChange: (next: ReadingStatus | null) => void;
};

export function StatusChip({ value, onChange }: Props) {
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

  return (
    <div className={`status-wrap${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`status-chip ${value ? `is-${value}` : "is-empty"}`}
        data-status={value ?? ""}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={value ? `阅读状态：${LABELS[value]}` : "设置阅读状态"}
        onClick={(event) => {
          stop(event);
          setOpen((next) => !next);
        }}
        onPointerDown={stop}
      >
        {value ? LABELS[value] : "状态"}
      </button>
      {open ? (
        <button
          type="button"
          className="status-scrim"
          aria-label="关闭状态菜单"
          onPointerDown={stop}
          onClick={(event) => {
            stop(event);
            setOpen(false);
          }}
        />
      ) : null}
      {open ? (
        <div className="status-menu" id={menuId} role="menu" aria-label="阅读状态">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={value === null}
            onPointerDown={stop}
            onClick={(event) => {
              stop(event);
              onChange(null);
              window.setTimeout(() => setOpen(false), 80);
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
                window.setTimeout(() => setOpen(false), 80);
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
