export type TriggerBox = {
  top: number;
  bottom: number;
  left: number;
};

export type PanelBox = {
  height: number;
  width: number;
};

export type ViewportBox = {
  height: number;
  width: number;
  offsetTop?: number;
  offsetLeft?: number;
};

export type MenuPlacement = {
  top: number;
  left: number;
  maxHeight: number;
  shifted: boolean;
};

export const STATUS_MENU_GAP = 4;
export const STATUS_MENU_MARGIN = 8;
export const STATUS_MENU_MAX_PX = 22 * 16;
export const STATUS_MENU_MIN_PX = 44;

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function placeStatusMenu(input: {
  trigger: TriggerBox;
  panel: PanelBox;
  viewport: ViewportBox;
}): MenuPlacement {
  const viewTop = input.viewport.offsetTop ?? 0;
  const viewLeft = input.viewport.offsetLeft ?? 0;
  const viewBottom = viewTop + input.viewport.height;
  const viewRight = viewLeft + input.viewport.width;
  const available = Math.max(STATUS_MENU_MIN_PX, input.viewport.height - 2 * STATUS_MENU_MARGIN);
  const maxHeight = Math.max(
    STATUS_MENU_MIN_PX,
    Math.min(STATUS_MENU_MAX_PX, input.panel.height, available),
  );
  const desiredTop = input.trigger.bottom + STATUS_MENU_GAP;
  const minTop = viewTop + STATUS_MENU_MARGIN;
  const maxTop = viewBottom - STATUS_MENU_MARGIN - maxHeight;
  const top = clamp(desiredTop, minTop, maxTop);
  const desiredLeft = input.trigger.left;
  const minLeft = viewLeft + STATUS_MENU_MARGIN;
  const maxLeft = viewRight - STATUS_MENU_MARGIN - input.panel.width;
  const left = clamp(desiredLeft, minLeft, maxLeft);
  return {
    top,
    left,
    maxHeight,
    shifted: top < desiredTop - 0.5,
  };
}

export function viewportBox(): ViewportBox {
  const view = window.visualViewport;
  return {
    height: Math.min(window.innerHeight, view?.height ?? window.innerHeight),
    width: Math.min(window.innerWidth, view?.width ?? window.innerWidth),
    offsetTop: view?.offsetTop ?? 0,
    offsetLeft: view?.offsetLeft ?? 0,
  };
}

export function applyStatusMenuPlacement(menu: HTMLElement, trigger: HTMLElement): MenuPlacement {
  const triggerRect = trigger.getBoundingClientRect();
  const next = placeStatusMenu({
    trigger: { top: triggerRect.top, bottom: triggerRect.bottom, left: triggerRect.left },
    panel: { height: menu.scrollHeight, width: menu.offsetWidth },
    viewport: viewportBox(),
  });
  menu.style.position = "fixed";
  menu.style.top = `${next.top}px`;
  menu.style.left = `${next.left}px`;
  menu.style.right = "auto";
  menu.style.bottom = "auto";
  menu.style.maxHeight = `${next.maxHeight}px`;
  menu.removeAttribute("data-placement");
  return next;
}

export function scrollSelectedStatusIntoMenu(menu: HTMLElement, selected?: HTMLElement | null) {
  const item = selected ?? menu.querySelector<HTMLElement>('[aria-checked="true"]');
  if (!item) return;
  const portTop = menu.getBoundingClientRect().top + menu.clientTop;
  const portBottom = portTop + menu.clientHeight;
  const itemRect = item.getBoundingClientRect();
  if (itemRect.top < portTop) menu.scrollTop -= portTop - itemRect.top;
  else if (itemRect.bottom > portBottom) menu.scrollTop += itemRect.bottom - portBottom;
}
