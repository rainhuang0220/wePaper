"""Keep in lockstep with web/src/canvasScale.ts and web/src/zoomSteps.ts."""

MAX_CANVAS_PIXELS = 32_000_000
MAX_DPR = 3
ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4]


def output_scale(css_width: float, css_height: float, dpr: float) -> float:
    area = max(css_width, 1) * max(css_height, 1)
    want = min(max(dpr or 1, 1), MAX_DPR)
    if area * want * want <= MAX_CANVAS_PIXELS:
        return want
    return max(1.0, (MAX_CANVAS_PIXELS / area) ** 0.5)


def next_zoom(current: float, direction: int) -> float:
    if direction > 0:
        for step in ZOOM_STEPS:
            if step > current + 0.001:
                return step
        return ZOOM_STEPS[-1]
    for step in reversed(ZOOM_STEPS):
        if step < current - 0.001:
            return step
    return ZOOM_STEPS[0]


def test_retina_is_not_capped_at_2() -> None:
    assert output_scale(1000, 1400, 3) == 3


def test_backing_is_dpr_times_css() -> None:
    ratio = output_scale(612, 792, 2)
    assert ratio == 2
    assert int(612 * ratio) == 1224
    assert int(792 * ratio) == 1584


def test_huge_zoom_clamps_pixels() -> None:
    ratio = output_scale(2500, 3500, 3)
    assert ratio * 2500 * ratio * 3500 <= MAX_CANVAS_PIXELS + 1


def test_mobile_300_is_sharper_than_200() -> None:
    at200 = output_scale(1224, 1584, 3)
    at300 = output_scale(1836, 2376, 3)
    assert int(1836 * at300) > int(1224 * at200)


def test_zoom_ladder() -> None:
    assert next_zoom(1, 1) == 1.25
    assert next_zoom(2, 1) == 2.5
    assert next_zoom(3, 1) == 4
    assert next_zoom(4, 1) == 4
    assert next_zoom(1, -1) == 0.75
