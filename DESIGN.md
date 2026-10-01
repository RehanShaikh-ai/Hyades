# Visual Design System: Hyades

This document establishes the durable visual identity and design system for **Hyades** (formerly Knowledge Atlas). The product is a knowledge-management and knowledge-graph platform with an astronomy/observatory and classical archival identity.

*(Note: In user-facing UI and brand copy, the application is named **Hyades**. Internal repository identifiers and backend configurations continue to use knowledge-atlas).*

## 1. Visual Direction & Identity

**Theme:** Ivory Observatory & Scholarly Stoa
**Atmosphere:** Editorial, refined, calm, and intellectually profound.
**Metaphor:** An ancient-yet-modern observatory and classical library peristyle. A quiet place for focused study, where complex information is charted like constellations and organized with classical architectural proportion.

We actively reject the standard "AI SaaS Dashboard" aesthetic (no dark-mode card walls, no cyan/purple gradients, no neon glows, no dense icon sidebars). Instead, the interface relies on generous whitespace, strong typographic contrast, natural light and shadow, and restrained color to create a book-like reading and operating experience.

## 2. Global Application Navigation

Navigation across Hyades is persistent, restrained, and unmistakably clear.

### Primary Destinations
The application comprises four canonical destinations:
1. **Overview:** The central scholarly starting point, active desk, and system state.
2. **Library:** The complete archive of ingested literature, notes, and documents.
3. **Observatory:** The spatial, full-canvas celestial knowledge graph and constellation atlas.
4. **Stella:** The grounded research companion, conversational synthesis, and discovery assistant.

### Information Architecture & Functional Placement Rules
Not every capability warrants a dedicated page or primary navigation item. Hyades adheres strictly to this functional taxonomy:
*   **Destinations (Primary Nav):** `Overview`, `Library`, `Observatory`, `Stella`.
*   **Global Capability:** `Search` (`⌘K` palette or header pill across the whole application).
*   **Contextual Material Action:** `Extract Concepts & Entities` (contextual action inside Library when inspecting a document/paper).
*   **Maintenance Operation:** `Reindex Archive` (system maintenance action located in Library/Settings, never a primary view).
*   **Setup / Administration:** `User Management` & `Workspace Management` (onboarding and administrative flows accessed via the bottom-left profile avatar `RS`, keeping primary navigation clean).
*   **Graph Utility:** `Fullscreen / Focus View` (spatial focus toggle in the Observatory vertical instrument panel).

### Navigation Principles
*   **Restrained Editorial Presentation:** Editorial typography (`Geist` 13px / 500 weight), generous spacing, subtle terracotta active indicator bar (`#BD532B`).
*   **Separation of Concerns:** Application navigation sits in the top header. Page-specific tools (Observatory graph controls, Library filters, Stella workspace settings) remain isolated to their respective views.
*   **Global Capabilities:** Search is not a page; it is a persistent global palette triggered via `⌘K` or the header search pill.
*   **Profile Identity:** Represented strictly as a profile avatar icon (`RS` with status indicator) anchored at the bottom-left corner of the viewport, which opens the Workspace & User Administration modal.

## 3. The Overview Dashboard ("Sophisticated WORLD + Simple INTERFACE")

The Overview is the central **Dashboard and Home Workspace** of Hyades. While the visual environment remains sophisticated and scholarly, the interface copy is **simple, direct, and welcoming**. 

A new user must understand the dashboard within seconds without needing knowledge of astronomy or academic graph theory.

### Tone Formula:
$$\text{Sophisticated WORLD} + \text{Simple INTERFACE} \quad (\text{not Sophisticated Terminology Everywhere})$$

### Plain Language Taxonomy:
*   Use **Your Knowledge** instead of *Epistemic Horizon*
*   Use **Continue Working** instead of *Active Investigation Folio*
*   Use **New Connections** instead of *Emerging Epistemic Bridges*
*   Use **Recent Activity** instead of *Archival Ingestion Stream*
*   Use **Knowledge Health** instead of *System Diagnostics / Epistemic Diagnostics*
*   Use **Concepts** instead of *Entities*
*   Use **Connections** instead of *Constellation Relationships / Edges*
*   Use **Sources** instead of *Literature Corpus*
*   Use **Topics** instead of *Semantic Sectors*

### Core Dashboard Prioritization:
1. **Overall Knowledge Summary:**
   *   *Your Knowledge:* Clean totals (142 sources, 3,420 concepts, 8,190 connections) embedded in a welcoming greeting paired with an intuitive Topic Distribution Ring (AI & Agents 28%, Memory & Retrieval 36%, Knowledge Graphs 22%, Philosophy & Logic 14%).
2. **Continue Working:**
   *   The active note/study with clear section progress, source links, and immediate actions: *Continue Reading* or *Open in Observatory ↗*.
3. **New Connections:**
   *   Surfaces 2–3 meaningful discovered relationships between concepts across topics (e.g. *Vector Search ↔ Classical Logic Classification*), explaining in plain English why they matter.
4. **Recent Activity:**
   *   Human-readable timeline of recently imported papers, edited notes, and extracted concepts with clear timestamps ("Today, 11:24 AM", "Yesterday").
5. **Knowledge Health:**
   *   Helpful, actionable system status: Search Indexing status, Disconnected Notes needing synthesis, and topic balance alerts.

## 4. Classical Architecture Environmental Principles (Experimental)

In the Overview and related environmental surfaces, classical Greek architecture (fluted Doric/Ionic columns, peristyles, porticos, carved stone details) participates directly in the composition:

*   **Framing over Wallpaper:** Architecture is never treated as a passive stock photo wallpaper. It acts as an environmental threshold (e.g., columns entering the left viewport, framing the reading desk).
*   **Depth & Layering:** Natural amber sunlight sweeps from the open colonnade across the warm ivory paper desk, casting subtle directional ambient shadows that visually anchor the UI.
*   **Archival Lithograph Texture:** Classical elements are rendered in archival copperplate engraving and wash styles with `multiply` blend modes, harmonizing with paper grain rather than clashing as photorealistic CGI.

## 5. Typography & Editorial Hierarchy

We maintain an intentional 5-level typographic hierarchy balancing classical humanism with modern UI readability:

1.  **Display Serif:** `Newsreader` (Semibold, 600 weight, optical sizing 72). Used for main destination titles and dominant hero anchors.
2.  **Editorial Italic Serif:** `Newsreader` (Italic, 400/500 weight). Used selectively as a warm scholarly accent for secondary headings, collection names (*· Your Collection*, *· Research Inquiry*), and conceptual section accents (*Archival Shelves*, *What would you like to explore next?*). Avoid overuse—it is an editorial accent, not a body font.
3.  **Normal Content Serif:** `Newsreader` (Regular, 500 weight). Used for paper titles, selected node headers, and key long-form takeaways.
4.  **Interface Sans-Serif:** `Geist` or `Inter` (Regular to Medium, 400/500 weight). Used for controls, navigation, inputs, table cells, and conversational body copy.
5.  **Monospace Coordinates & Metadata:** `JetBrains Mono` (Medium, 500 weight, 10–11px, tracking-wider uppercase). Used for catalog codes (e.g. `HYA-03`), coordinates, sector counts, and telemetry.

### Information Density & Sidebar Visibility Principles
*   **Show when useful, hide when competing:** Sidebars across all surfaces (Observatory constellation/details, Library shelves/dossier, Stella inquiries/evidence) must be collapsible to give primary content maximum focus.
*   **Intuitive Reopening:** Collapsed states reveal compact, discoverable floating pills/tabs that restore sidebars with a single click.
*   **Focused / Fullscreen Mode:** Specialized views (e.g. Observatory Graph) provide a dedicated focused mode in the vertical instrument controls, temporarily minimizing surrounding UI for distraction-free spatial navigation.
*   **Zero Developer/Status Clutter:** Never place artificial "System Ready", "Perspective Mode", or decorative green-dot status badges. Only display telemetry when communicating real, actionable system state.


## 6. Color Palette & Semantic Tokens

The foundation is warm, mimicking high-quality archival paper, with deep ink colors and astronomical accents.

**Base Colors:**
*   **Ivory Canvas:** `#EFECE4` (Outer canvas & base)
*   **Warm Paper:** `#F7F5EE` (Reading ground)
*   **Panel Surface:** `#FAF8F2` (Instrument panels & elevated desks)
*   **Pure Card:** `#FFFFFF` (Interactive item surfaces)
*   **Primary Ink:** `#1C1917` (Deep warm charcoal)
*   **Secondary Ink:** `#575249` (Muted warm graphite)
*   **Tertiary Ink:** `#878074` (Subtle annotations)
*   **Archival Text:** `#433D35` (Long-form reading)

**Accent Colors:**
*   **Midnight Blue:** `#162135` (Primary actions, main brand mark, hub entities)
*   **Terracotta:** `#BD532B` (Concept stars, active navigation indicator, focal pips)
*   **Classical Brass:** `#C08D38` (Telemetry accents, ranking metrics, astrolabe details)

**Borders:**
*   **Parchment Border:** `#DCD6C8` (Subtle dividers)
*   **Strong Border:** `#C9C2B0` (Panel frames)

## 7. Preserved Observatory Standards

When developing shared components, preserve the standards finalized in the Observatory:
*   **Astronomical Starbursts:** Fine 8-point geometric starbursts (`d="M 0 -5 L 1.2 -1.2 L 5 0..."`) rather than intimidating solid black symbols.
*   **Concept Stars:** Distinctive terracotta geometric lozenges for concepts.
*   **Constellation Linework:** Organic, delicate 1px curves rather than rigid mechanical grids.
*   **HUD Telemetry:** Compact instrument-panel styling with live coordinates and catalog identifiers.
*   **Graph Controls:** Vertical compact instrument panel positioned between the bottom-center search and the right sidebar.

## 8. Visual Anti-Patterns (Strictly Avoid)

1.  **Generic SaaS Card-Walls:** Do not box every datum into a generic bordered white card.
2.  **AI Dashboard Tropes:** No purple, cyan, or neon gradients. No glowing edges.
3.  **Stock Image Wallpapers:** Classical architecture must participate in spatial framing and lighting, never as an unintegrated photo backdrop.
4.  **Pill Navigation Overuse:** Do not use heavy capsule/pill navigation buttons in global headers.
5.  **Sidebars Cluttered with Icons:** Avoid dense vertical icon strips that lack editorial breathing room.

## 9. The Library ("Archive of Knowledge")

The Library is the third foundational pillar of the Hyades scholarly universe:
*   **Observatory:** The spatial map of knowledge and celestial constellation atlas.
*   **Overview:** The central scholarly workspace, active desk, and system state.
*   **Library:** The quiet scriptorium and physical archive where knowledge artifacts actually live.

### Information Architecture & Layout
The Library avoids both generic table views and bulky card grids, adopting a **3-Column Editorial Archive**:
1.  **Left Column: Shelves & Collections** (260px fixed):
    *   *Core Views:* All Items (166), Sources & Papers (142), Notes & Syntheses (24), Starred (12).
    *   *Topic Shelves:* Memory & Retrieval (54), AI & Autonomous Agents (38), Knowledge Graphs (32), Philosophy & Logic (26).
    *   *Needs Attention:* Disconnected Notes (4), Citations to Review (3).
    *   *Bottom Archive Capacity:* Disk usage & vector index health.
2.  **Center Column: Catalog Ledger** (flexible):
    *   Search & filter toolbar with live filter pills (All, Sources, Notes, Documents) and sort dropdown (Recently Added, Recently Opened, Title, Connections).
    *   Archival list items featuring subtle typography, publication metadata, connected concept badges, and fast actions.
3.  **Right Column: Reading Dossier & Inspector** (380px fixed):
    *   Dynamic detail panel showing the selected artifact's abstract, full provenance, connected concept chips (linking directly to the Observatory), file details, and action buttons (*Read Document*, *Open in Observatory ↗*, *Open Stella Chat*).

### Distinguishing Sources vs. Notes
Sources and Notes share one unified catalog without fracturing into separate sub-pages, while remaining immediately recognizable:
*   **Sources & Papers:** Identified by subtle archival document iconography (`PDF`, `DOC`, `WEB`), formal publication metadata (authors, year, journal/conference), and DOI/file format badges.
*   **Notes & Syntheses:** Identified by a fountain pen / handwritten annotation symbol, warm terracotta highlight markers, word count and edit timestamps, and parent source references.

### Environmental Imagery Integration
The archival visual environment (ancient wooden catalog drawers, brass label pulls, grand arched scriptoriums, parchment folios) participates compositionally:
*   **Multi-layered Lighting:** A grand arched window wash illuminates the top-right reading ledger, casting soft natural morning light across parchment tones.
*   **Environmental Textures:** Subtle paper tooth, engraved border rules, brass hardware accents (`#C08D38`), and warm ivory backdrops.
*   **Multiple Perspective Toggles:** Allows seamless switching between *Grand Scriptorium*, *Catalog & Folio*, and *Parchment Minimal* views.

## 10. Stella ("The Research Study & Grounded Intelligence")

Stella completes the fourfold Hyades universe:
*   **Overview:** The state of the knowledge system (Classical workspace & active desk).
*   **Library:** The stored knowledge and source artifacts (Quiet scriptorium archive).
*   **Observatory:** The spatial constellation graph and relationships (Celestial atlas).
*   **Stella:** The grounded intelligence that helps the user think, synthesize, and investigate with their knowledge.

### Anti-Patterns Rejected
*   **No Generic Chatbot:** Avoid the standard centered empty box with "How can I help you today?"
*   **No Disconnected Black Box:** Every assertion and explanation connects explicitly back to ingested sources, user synthesis notes, and concept nodes.
*   **No Fluff or Overly Familiar Persona:** Calm, scholarly, research-oriented, and intellectually lucid.

### Architectural Layout (3-Column Research Study)
1.  **Left Column: Knowledge Context & Research Inquiries (280px):**
    *   *Live Scope Metrics:* Demonstrates active awareness of ingested sources (142), user synthesis notes (24), and knowledge graph concepts (3.4k).
    *   *Threaded Inquiries:* Chronological research topics with clear entity badges.
    *   *Quick Investigation Sparks:* One-click prompts targeting knowledge gaps, contradictions, or synthesis drafts.
2.  **Center Column: Scholarly Dialogue & Grounded Flow (Flexible, max-w-[880px]):**
    *   *Editorial Dialogue Canvas:* Typeset like annotated academic correspondence.
    *   *Hybrid Grounding Flow Diagrams:* Visual pipelines clarifying how queries navigate vector similarity, concept extraction, and graph topology.
    *   *Context & Reference Bar:* Contextual chips for concepts (`#BD532B`), sources (`#162135`), and direct actions (*View in Observatory ↗*, *Pin to Library*).
    *   *Integrated Composer:* Prominent research desk input with scope selection and paper referencing.
3.  **Right Column: Grounding Evidence & Citations Dossier (320px):**
    *   *Direct Citation Provenance:* Real-time paper excerpts, relevance rankings, and publication metadata.
    *   *Observatory Spatial Bridge:* Highlights corresponding cluster coordinates and constellation formations in the 3D graph.

### Environmental Atmosphere (Studiolum Philosophi)
*   **Intimate Writing Desk:** Based on 18th-century scientific copperplate etchings (*Studiolum Philosophi, 1774*).
*   **Empty Scholarly Study:** Quills, inkpots, armillary sphere, brass dividers, stacked folios, and gentle candle/lamp illumination on warm ivory laid paper.
*   **Compositional Framing:** Soft archway and bookshelves frame the reading area, maintaining ample whitespace and high readability.


