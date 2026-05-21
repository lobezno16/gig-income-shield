## 2026-04-24 - Accessibility labels on admin dashboard selects
**Learning:** Native `<select>` elements used within control panels often miss explicit labels to save space, breaking screen reader navigation.
**Action:** Always add `aria-label` to standalone or inline `<select>` inputs used for filtering or controls when no explicit `<label>` element is present.
## 2026-05-21 - Added aria-pressed to custom selection buttons
**Learning:** Custom toggle buttons or selection cards built with generic `<button>` elements don't inherently communicate their selected state to screen readers, unlike native radio buttons or checkboxes.
**Action:** Always add `aria-pressed={selected}` or `aria-selected={selected}` (if part of a tablist) to custom buttons that function as stateful selectors (like choosing a platform or plan) so assistive technologies can announce their active status.
