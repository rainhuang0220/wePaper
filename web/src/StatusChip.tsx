import {
  autoUpdate,
  FloatingPortal,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type SyntheticEvent } from "react";
import { LABELS, STATUSES, type ReadingStatus } from "./readingStatus";

type Props = {
  value: ReadingStatus | null;
  onChange: (next: ReadingStatus | null) => void;
};

const MENU_GAP = 4;
const VIEW_PADDING = 8;

function scrollNodeIntoContainer(item: HTMLElement, container: HTMLElement) {
  const port = container.getBoundingClientRect();
  const portTop = port.top + container.clientTop;
  const portBottom = portTop + container.clientHeight;
  const box = item.getBoundingClientRect();
  if (box.top < portTop) container.scrollTop -= portTop - box.top;
  else if (box.bottom > portBottom) container.scrollTop += box.bottom - portBottom;
}

function collisionOptions(rootBoundary: "viewport" | "layoutViewport") {
  return {
    padding: VIEW_PADDING,
    rootBoundary,
  };
}

function applyAvailableMenuHeight(element: HTMLElement, availableHeight: number) {
  const next = Math.max(0, availableHeight);
  const scrollTop = element.scrollTop;
  element.style.maxHeight = "none";
  const natural = element.scrollHeight;
  element.style.maxHeight = next >= natural ? "" : `${next}px`;
  element.scrollTop = scrollTop;
}

export function StatusChip({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const closeTimer = useRef(0);
  const preferVisualViewport = useRef(false);

  function setOpenSafe(next: boolean) {
    window.clearTimeout(closeTimer.current);
    setOpen(next);
  }

  const { refs, floatingStyles, context, isPositioned } = useFloating({
    open,
    onOpenChange: setOpenSafe,
    placement: "bottom-start",
    strategy: "fixed",
    transform: false,
    whileElementsMounted(reference, floating, update) {
      const visual = window.visualViewport;
      let windowResizeAt = 0;
      const onWindowResize = () => {
        preferVisualViewport.current = false;
        windowResizeAt = Date.now();
      };
      const onVisualResize = () => {
        preferVisualViewport.current = Date.now() - windowResizeAt > 100;
      };
      window.addEventListener("resize", onWindowResize, true);
      visual?.addEventListener("resize", onVisualResize);
      const stop = autoUpdate(reference, floating, update, {
        ancestorScroll: true,
        ancestorResize: true,
        elementResize: true,
        layoutShift: true,
        animationFrame: false,
      });
      return () => {
        stop();
        window.removeEventListener("resize", onWindowResize, true);
        visual?.removeEventListener("resize", onVisualResize);
      };
    },
    middleware: [
      offset(MENU_GAP),
      shift(() => ({
        ...collisionOptions(preferVisualViewport.current ? "viewport" : "layoutViewport"),
        crossAxis: true,
      })),
      size(() => ({
        ...collisionOptions(preferVisualViewport.current ? "viewport" : "layoutViewport"),
        apply({ availableHeight, elements }) {
          applyAvailableMenuHeight(elements.floating, availableHeight);
        },
      })),
    ],
  });
  const click = useClick(context);
  const dismiss = useDismiss(context, { outsidePressEvent: "click" });
  const role = useRole(context, { role: "menu" });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useLayoutEffect(() => {
    if (!open || !isPositioned) return;
    const menuEl = refs.floating.current;
    if (!menuEl) return;
    const selected = menuEl.querySelector<HTMLElement>('[aria-checked="true"]');
    if (selected) scrollNodeIntoContainer(selected, menuEl);
  }, [open, isPositioned, value, refs]);

  function stopBubble(event: SyntheticEvent) {
    event.stopPropagation();
  }

  function choose(next: ReadingStatus | null) {
    onChange(next);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 80);
  }

  return (
    <div className={`status-wrap${open ? " is-open" : ""}`}>
      <button
        type="button"
        className={`status-chip ${value ? `is-${value}` : "is-empty"}`}
        data-status={value ?? ""}
        aria-label={value ? `阅读状态：${LABELS[value]}` : "设置阅读状态"}
        {...getReferenceProps({
          ref: refs.setReference,
          onPointerDown: stopBubble,
          onClick: stopBubble,
        })}
      >
        {value ? LABELS[value] : "状态"}
      </button>
      {open ? (
        <FloatingPortal>
          <button
            type="button"
            className="status-scrim"
            aria-label="关闭状态菜单"
            onPointerDown={stopBubble}
            onClick={(event) => {
              stopBubble(event);
              setOpenSafe(false);
            }}
          />
          <div
            className="status-menu"
            data-testid="status-menu"
            {...getFloatingProps({
              ref: refs.setFloating,
              id: menuId,
              "aria-label": "阅读状态",
              onPointerDown: stopBubble,
              style: floatingStyles,
            })}
          >
            <button
              type="button"
              role="menuitemradio"
              aria-checked={value === null}
              onPointerDown={stopBubble}
              onClick={(event) => {
                stopBubble(event);
                choose(null);
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
                onPointerDown={stopBubble}
                onClick={(event) => {
                  stopBubble(event);
                  choose(status);
                }}
              >
                {LABELS[status]}
              </button>
            ))}
          </div>
        </FloatingPortal>
      ) : null}
    </div>
  );
}
