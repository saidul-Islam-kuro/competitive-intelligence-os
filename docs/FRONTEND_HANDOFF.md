# Frontend Handoff — React + Vite (future phase)

Do not begin this work until Phases 7–10 have been audited and the engine API surface is documented and verified.

## Product direction
Build a premium, multi-route web application—not one long scrolling dashboard. Use React + Vite + TypeScript. Keep the existing backend and intelligence engine; the frontend should consume the real REST API.

## Expected route map
- `/` — marketing/landing page only if included in scope
- `/app/overview`
- `/app/competitors`
- `/app/competitors/:productId`
- `/app/changes`
- `/app/changes/:changeId`
- `/app/features`
- `/app/pricing`
- `/app/reviews`
- `/app/trends`
- `/app/reports`
- `/app/alerts`
- `/app/sources`
- `/app/api`
- `/app/ai-research`
- `/app/settings`

Adjust routes only after checking actual backend capabilities. Unsupported features must be clearly marked as unavailable or omitted, never represented with fake production data.

## UX requirements
- Persistent responsive app shell with sidebar, mobile navigation, topbar, global search where meaningful, and clear active route.
- Overview that prioritizes meaningful events and monitoring health rather than decorative metrics.
- Dedicated pages for competitor management and details.
- Evidence views showing source, observed time, prior/current values, extraction method, confidence, and limitations where available.
- Search, filters, sorting, pagination, URL-persisted filters when appropriate.
- Consistent loading, empty, error, retry, and partial-data states.
- Accessible keyboard navigation, semantic controls, readable contrast, reduced-motion support, and responsive tables/cards.
- Consistent design tokens, typography, spacing, component states, and restrained animation.
- Charts must use real API data, display units/time windows, and have empty states.
- Dark theme may be the default; add light theme only if it can be implemented consistently.
- No fake counters, fake change feeds, fake charts, dead buttons, placeholder lorem ipsum, or hardcoded data in production flows.

## Technical requirements
- Typed API client based on the actual API contract/OpenAPI document.
- Centralized API base URL configuration.
- Clear authentication/API-key approach aligned with the real backend. Never embed server secrets in Vite environment variables; all `VITE_*` values are public.
- Reusable UI components and page-level modules; avoid a monolithic `App.tsx`.
- Use a router and separate route/page components.
- Add frontend tests for key components and API behavior, and accessibility smoke checks where feasible.
- Ensure `npm run build` succeeds and document local development/deployment instructions.
- Keep frontend deployment compatible with the backend's CORS/auth configuration.
