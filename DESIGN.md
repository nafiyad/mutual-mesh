# Design System: Mutual Mesh

## 1. Visual Theme & Atmosphere

Mutual Mesh should feel like a civic architecture studio crossed with a calm operations room: serious, warm, legible, and quietly intelligent. Density is balanced at 5/10, composition variance is asymmetric at 7/10, and motion is restrained-fluid at 5/10. The coordination graph is the visual hero; surrounding controls support it instead of competing with it.

The page uses a contained editorial workspace rather than a full-width dashboard. A dark graph field creates a single moment of drama, while warm mineral surfaces and generous negative space prevent the interface from feeling technical or cold.

## 2. Color Palette & Roles

- **Limestone Canvas** (`#ECE8DE`) — page background and outer breathing room.
- **Chalk Surface** (`#F8F6F0`) — primary cards, drawers, and node surfaces.
- **Paper Highlight** (`#FFFDF8`) — raised controls and selected records.
- **Graphite Ink** (`#171C1A`) — primary text and the graph-stage field; never pure black.
- **Slate Copy** (`#58615D`) — secondary copy and metadata.
- **Hairline Stone** (`#D7D1C5`) — borders and structural dividers.
- **Civic Green** (`#32675C`) — the one brand accent for actions, active state, focus, and committed relationships.
- **Muted Clay** (`#9B5C49`) — semantic error or blocked state only, never a decorative accent.

No purple, neon blue, multicolor node taxonomy, decorative gradients, or outer glows.

## 3. Typography Rules

- **Display and UI:** Geist Sans, track-tight and weight-led. Headline range uses `clamp(2rem, 3vw, 3.8rem)` only when space supports it.
- **Body:** Geist Sans at 0.95–1rem with relaxed 1.55 line height and a 65-character reading width.
- **Metadata:** Geist Mono for versions, tool names, timestamps, and metrics.
- Minimum interface copy is 12px on desktop and 14px for interactive mobile controls.
- Banned: Inter, generic serif fonts, all-caps body copy, and tiny 7–9px labels.

## 4. Component Stylings

- **Primary action:** Civic Green fill, 12px radius, minimum 44px height, concise label, and a one-pixel tactile downward movement on press.
- **Secondary action:** Paper Highlight with a Hairline Stone border. No pill-shaped primary buttons.
- **Cards:** Use elevation only for the dark goal brief, central graph, and active workflow. Supporting panels rely on borders and negative space.
- **Graph nodes:** Chalk surfaces on Graphite Ink, 16px radius, strong labels, quiet metadata, and one status marker. All node families share the same visual language.
- **Graph connectors:** Use an orthogonal top-down hierarchy with explicit arrowheads and centered node anchors. Dashed edges communicate proposed plan flow; solid Civic Green edges communicate assignments or satisfied dependencies. Connectors never cross, terminate in empty space, or rely on arbitrary diagonal angles.
- **Inputs:** 44px minimum height, label or accessible name, Civic Green focus ring, no floating label.
- **State:** Status copy and geometry accompany color. Error uses Muted Clay only where behavior is blocked.
- **Drawers:** Full-height editorial sheets with large headings, readable 13–15px detail, and clear section rhythm.

## 5. Layout Principles

- Center the application within a 1680px maximum canvas so ultra-wide screens do not shrink the UI into distant columns.
- Desktop uses an asymmetric `320px / minmax(680px, 1fr) / 320px` grid with 20px gutters.
- The graph receives at least half the visual area and a fixed, intentional 640–700px stage rather than viewport-driven empty height.
- Side panels use vertical rhythm, not a pile of equally styled cards.
- Below 1180px, move operational status into a horizontal row beneath the graph.
- Below 820px, collapse to a single column with the graph first, then goal, workflow, contributions, and history.
- Below 600px, replace spatial connectors with a clean ordered node grid; never compress a desktop graph until lines or cards overlap.
- No horizontal scrolling; touch targets remain at least 44px.

## 6. Motion & Interaction

- Use weighty 180–240ms easing with `cubic-bezier(.2,.8,.2,1)`.
- Animate only transform and opacity for hover, selection, overlays, and status presence.
- The live WebMCP status may use a very subtle opacity pulse; no glow.
- New overlays enter with a 6px vertical translation and fade.
- Respect `prefers-reduced-motion` completely.

## 7. Anti-Patterns (Banned)

- No emojis, neon, purple AI styling, or multicolor gradients.
- No pure black, generic Inter, or serif dashboard typography.
- No tiny dashboard labels or unreadable metrics.
- No full-width stretch on ultra-wide displays.
- No three equal feature cards, card-inside-card stacking, or decorative metrics.
- No generic chatbot panel or large empty graph canvas.
- No inert buttons, filler controls, or fabricated external effects.
- No overlapping text, clipped labels, or color-only status.
- No copywriting clichés such as “seamless,” “next-gen,” or “unleash.”
