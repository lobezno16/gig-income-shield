## 2026-04-24 - Accessibility labels on admin dashboard selects
**Learning:** Native `<select>` elements used within control panels often miss explicit labels to save space, breaking screen reader navigation.
**Action:** Always add `aria-label` to standalone or inline `<select>` inputs used for filtering or controls when no explicit `<label>` element is present.
