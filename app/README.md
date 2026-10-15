# Cliedesk `/dash` app (Free)

The agent app served at `/dash`. It is written in TypeScript with React from WordPress core. Specs:
`docs/cliedesk/plan.frontend-ux.md` (§3.11–§3.13, §4, §5.1–§5.2, §7, §8, §11) and
`docs/decisions/ADR-0012-frontend-stack.md`.

## Structure

```
app/
  packages/
    data/   @cliedesk/data → build/data.js → window.cliedesk.data (handle cliedesk-data)
            boot.ts      BootPayload type; Zod (mini) validation; deep-frozen store; can(), hasModule()
            api.ts       REST client on wp.apiFetch: envelopes, CliedeskApiError, Idempotency-Key, ETag/If-Match,
                         nonce refresh + retry once, re-auth + replay once, GET/429 retries, timeouts
            session.ts   nonce state, refreshNonce(), re-authenticate store (requestReauth / completeReauth)
            changes.ts   ChangeFeed: BroadcastChannel leader election, Poll-After cadence, dedupe, 410 reset,
                         registerEntityInvalidation(); proactive 8 h nonce refresh by the leader
            query.ts     QueryClient factory (§4.3 defaults); TanStack Query is re-exported from here (one copy)
            store.ts     createStore() for useSyncExternalStore (no Zustand)
    ui/     @cliedesk/ui → build/ui.js → window.cliedesk.ui (handle cliedesk-ui)
            styles/tokens.css  --cd-* tokens (brand scale from #2861E6, semantic light/dark, status, spacing,
                               radius, elevation, motion, density, reduced motion)
            styles/theme.css   Tailwind v4 `@theme inline` mapped onto the tokens + dark variant
            styles/base.css    base element styles, focus ring, forced colours
            components/        Button, IconButton, TextField (also multi-line), Select, RadioGroup, Checkbox, Switch, Modal, ConfirmDestructive,
                               Popover, Menu, Tabs, Tooltip, Toast region, Spinner, Skeleton, EmptyState,
                               ErrorState, Banner, SafeModeBanner, ProBadge, Slot
            slots.ts           slot-fill registry (registerSlotFill, useSlotFills)
            theme.ts           html data-theme/density/font/dir sync; localStorage `cliedesk.theme`
            announce.ts        screen-reader live regions
    app/    @cliedesk/app → build/app.js + build/app.css → window.cliedesk.app (handle cliedesk-app)
            registry.ts  routes, nav items, settings sections, commands
            router.tsx   TanStack Router from the registry; browser history at boot.app.basePath, or hash
                         history on plain permalinks (history.ts rewrites ?cliedesk=/dash/c/1042 → #/c/1042)
            mount.tsx    mounts on DOMContentLoaded, starts the change feed, sets window.cliedesk.app.mounted
            core.ts      M0 routes, nav and settings sections
            layouts/     RootLayout (re-auth dialog, toasts, focus on navigation), ShellLayout, BareLayout
            components/  Rail, UserMenu (theme), Banners, SettingsNav, ReauthDialog, PageHeader, RouteError
            routes/      Home, NotFound, _reauth, settings (Workspace → General / Products / Brands, product detail,
                         System → Setup Health)
            workspace/   products, brands and media query options (api.ts), shared form helpers (error summary,
                         conflict banner), ImagePicker, ColorInput, ProductWizard, BrandDialog, product detail tabs
            multiProduct.ts  useMultiProduct() (BRD-02)
  styles/app.css   Tailwind entry → build/app.css
  scripts/         check-contrast.mjs (WCAG pairs from tokens.css), size.mjs (gzip budgets)
  test/            Jest setup and helpers
```

Bundled third-party code: TanStack Router and Query (in `app` and `data`), React Aria Components (in `ui`,
imported per component through subpaths), lucide-react icons, and zod/mini (boot validation). React,
ReactDOM, the JSX runtime and `@wordpress/{i18n,api-fetch,url}` come from WordPress core through dependency
extraction.

## Build and test

Run these commands in `cliedesk/`. Dependencies are installed by the monorepo root (`npm install` at the
repository root, which uses npm workspaces).

| Command | What it does |
|---|---|
| `npm run build` | `wp-scripts build`: writes `build/{data,ui,app}.js`, `build/app.css`, `*.asset.php`, `build/chunks/app.*.js` |
| `npm start` | Watch build |
| `npm test` | Jest + Testing Library + jest-axe |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint:js` / `npm run lint:css` | ESLint (`@wordpress/eslint-plugin` + TypeScript) and stylelint |
| `npm run check:contrast` | Checks every semantic colour pair against WCAG 2.2 AA in light and dark (4.5:1 for text, 3:1 for UI) |
| `npm run size` | Gzip sizes against the budgets. The CI gate is the root `npm run size` |

The PHP side (`Cliedesk\App\Assets`) registers `cliedesk-data`, then `cliedesk-ui` (which depends on
`cliedesk-data`), then `cliedesk-app` (which depends on `cliedesk-ui`). All three use `defer`. PHP prints
`window.cliedeskBoot` before `cliedesk-data`. The app mounts on `DOMContentLoaded`. Deferred Pro scripts run
before that event, so they can register routes before mount. `@wordpress/dom-ready` would mount too early,
because deferred scripts run while `readyState` is already `interactive`.

## Extending the app (Pro and add-ons)

Pro imports `@cliedesk/data`, `@cliedesk/ui` and `@cliedesk/app` as externals. These resolve to the Free
runtime singletons, so every bundle shares one React, one QueryClient, one router and one registry. Add this
to the Pro `webpack.config.js`:

```js
const defaultConfig = require( '@wordpress/scripts/config/webpack.config' );
const DependencyExtractionWebpackPlugin = require( '@wordpress/dependency-extraction-webpack-plugin' );

const CLIEDESK = { '@cliedesk/data': 'data', '@cliedesk/ui': 'ui', '@cliedesk/app': 'app' };

module.exports = {
	...defaultConfig,
	plugins: [
		...defaultConfig.plugins.filter( ( p ) => p.constructor.name !== 'DependencyExtractionWebpackPlugin' ),
		new DependencyExtractionWebpackPlugin( {
			requestToExternal: ( r ) => ( CLIEDESK[ r ] ? [ 'cliedesk', CLIEDESK[ r ] ] : undefined ),
			requestToHandle: ( r ) => ( CLIEDESK[ r ] ? `cliedesk-${ CLIEDESK[ r ] }` : undefined ),
		} ),
	],
};
```

The Pro entry's `.asset.php` then lists `cliedesk-app` and the other two handles. Enqueue it with `defer`
from the `cliedesk_app_enqueue` action. Use a separate `output.uniqueName` (for example `cliedeskPro`) so
the lazy chunks do not clash.

### Registration API (`window.cliedesk.app`)

```ts
import {
	registerRoute, registerNavItem, registerSettingsSection, registerCommand,
	registerSlotFill, registerEntityInvalidation, Slot, PageHeader,
} from '@cliedesk/app';

// Routes and nav items: before mount (a later call is ignored and logs a warning).
registerRoute( {
	id: 'reports.live', path: '/reports/live', title: __( 'Live board', 'my-extension' ),
	component: () => import( './LiveBoard' ),      // lazy chunk; default export
	layout: 'shell',                               // or 'bare'
	capability: 'cliedesk_view_reports', module: 'reports',
} );
registerNavItem( { id: 'reports', label, to: '/reports', icon: BarChart3, area: 'main', order: 70, capability } );

// Settings: served at /settings/{area}/{id}; /settings/{area} opens the area's first section.
registerSettingsSection( {
	area: 'channels', areaLabel: __( 'Channels', 'my-extension' ), id: 'whatsapp',
	label, description, order: 20, capability: 'cliedesk_manage_settings',
	component: () => import( './WhatsAppSettings' ),
} );

// Slot fills: allowed at any time (the registry is reactive). Each fill renders inside its own
// Suspense and error boundary. If a fill crashes, agents see nothing and admins see an "Extension error" chip.
registerSlotFill( 'nav.ai', { id: 'pro.ai', component: AiNavItem, order: 10, capability: 'cliedesk_manage_ai' } );

// Change feed: query keys to invalidate for an entity type.
registerEntityInvalidation( 'ai_suggestion', ( c ) => [ [ 'ai', 'suggestion', c.conversation_id ] ] );

registerCommand( { id: 'pro.live', label, group: 'Reports', run: () => {} } );
```

The app also exports `getRoutes`, `getNavItems`, `getSettingsSections`, `getCommands`, `subscribe` and
`getVersion` from the registry. It re-exports `mount`, `getRouter` and `getChangeFeed` (for example
`getChangeFeed()?.setMode( 'conversation' )`), and the router helpers `Link`, `Outlet`, `useNavigate`,
`useParams`, `useSearch`, `useRouterState`, `notFound` and `redirect`. `@cliedesk/data` re-exports TanStack
Query (`useQuery`, `useMutation`, `queryOptions`, …). `@cliedesk/ui` exports `UnstyledButton` (the React Aria
button) so add-ons do not bundle a second copy.

### Slots and PRO badges (owner decision O14)

`<Slot name="conversation.composer.ai" fillProps={…} fallback={…} />` works as follows:

- When the slot has fills, it renders all of them.
- When it has none, it renders the `ProBadge` of the entry in `boot.pro.manifest` whose `slot` matches,
  followed by `fallback`.
- There is **no prop, preference, feature flag or setting that hides a badge**. A badge disappears only in
  two cases: licensed Pro fills the slot, or `boot.pro.state` is `licensed` or `expired`. In those states the
  server also stops sending the manifest.
- The popover text depends on `boot.pro.state`. Admins (`cliedesk_manage_settings`) see these calls to
  action:
  - `free_only`: **Upgrade to Pro**
  - `pro_inactive`: **Activate the Pro plugin**
  - `unlicensed`: **Activate your licence**
  - `revoked`: **Check licence**
  - `incompatible`: **Update Cliedesk** (the pill says UPDATE)
- Other staff see "Available in Cliedesk Pro. Ask your administrator."

M0 renders these slots: `nav.ai` (in the rail, admins only), `app.topbar.end`, `home.ai_briefing` and
`workspace.white_label`.

## Boot payload (`window.cliedeskBoot`)

The full TypeScript type is `BootPayload` in `packages/data/boot.ts`. Its shape follows
plan.frontend-ux.md §3.11:

```ts
interface BootPayload {
	version: string;
	app: { slug; basePath; url; pretty: boolean; loginMode: 'wp' | 'app' };
	rest: { root; nonce: string | null; nonceUrl };
	user: { id; name; avatar; roleKey; caps: string[]; productScope: 'all' | number[] } | null;
	prefs: { theme: 'light' | 'dark' | 'system'; density: 'comfortable' | 'compact'; fontScale; font: 'inter' | 'system';
	         reducedMotion: 'system' | 'on' | 'off'; shortcuts: { enabled; map }; timezone; layout: { inboxMode } };
	workspace: { name; timezone; locale; weekStart; accent: string | null };
	products: { id; uid; slug; name; color?; icon?; brandId: number | null; status }[];
	productsTruncated: boolean;
	i18n: { locale; lang; rtl: boolean };
	modules: string[];
	features: Record< string, boolean >;
	pro: { installed; active; licensed; state: ProState; plan: string | null; manifest: ProManifestEntry[];
	       links: { upgrade?; learnMore?; activateLicence?; plugins?: string | null } };
	safeMode: boolean;
	emergency: { automationPaused; aiOff?; lockdown; constants: string[] };
	health: { critical: number };
	settings?: Record< string, unknown >;   // exposed settings (sent by the PHP Boot; optional)
}
```

`getBoot()` validates the payload once and returns a deep-frozen object. Missing or invalid keys fall back
to safe defaults and never throw. One malformed manifest entry is dropped without affecting the others.
`setBoot( raw )` replaces the payload, for example after `GET /session`. Read the payload with `getBoot()`;
use `can( cap )` and `hasModule( id )` for UI-only checks, because the server authorises every call.

## REST client (`@cliedesk/data`)

```ts
const { data, meta, etag, requestId, pollAfter } = await api.get< T >( 'settings/core', { query, signal } );
await api.patch( 'settings/core', { body: { values: { poll_interval: 20 } }, ifMatch: etag /* or true */ } );
await api.post( 'safe-mode/confirm', { idempotencyKey } ); // a key is generated when omitted
```

Errors throw `CliedeskApiError { code, message, status, fields, retryAfter, requestId, details }`. Network
errors have status `0`. A non-JSON response becomes `cliedesk_bad_response` with a 200-character `snippet`.

## Products and brands (BRD-01…04, BRD-09)

Settings → **Workspace & brands** has three sections and one extra route, all in lazy chunks
(`settings-workspace`, `settings-products`, `settings-brands`):

| Screen | Path | API |
|---|---|---|
| General (workspace details + live updates) | `/settings/workspace/general` | `settings/workspace`, `settings/core` |
| Products list, reorder, "Add product" | `/settings/workspace/products` | `products`, `products/order`, `brands` |
| Product detail (Details, Identity, Detection & IDs, Inheritance, Lifecycle) | `/settings/workspace/products/$productId` | `products/{id}`, `…/inheritance`, `…/archive`, `…/restore`, `…/merge`, `products/merges/{id}/undo`, `media/images` |
| Brands | `/settings/workspace/brands` | `brands`, `brands/{id}`, `…/archive`, `…/restore`, `media/images` |

Query keys: `['products', 'list', status]`, `['products', 'detail', id]`, `['products', 'inheritance', id]`,
`['brands', 'list', archived]`, `['brands', 'detail', id]`, `['media', …]`. Change-feed entity types 8 (product) and
20 (brand) invalidate `['products']` and `['brands']`. The change feed compares entity types as strings, so numeric
codes from the server match registrations such as `registerEntityInvalidation( '8', … )`.

Edits send `If-Match` with the version the form was opened with; a stale version (409
`cliedesk_version_conflict`) shows "Someone else changed this product. Reload to see their changes." with
**Reload**. Product identity overrides are sent as a full set on every save (the API replaces the set); a field
whose "Override for this product" switch is off is sent as `null`.

### `useMultiProduct()` (BRD-02)

With one active product the product concept stays out of the way: no product picker, column or filter.

```ts
import { useMultiProduct, isMultiProduct } from '@cliedesk/app';

const multi = useMultiProduct(); // boolean, reactive
```

It returns `activeCount > 1` from the most recent loaded `GET /products` (`meta.activeCount`, any
`['products', 'list', …]` query), and falls back to `boot.products.length > 1` (or `productsTruncated`) before a
list has loaded. It never fetches by itself. `isMultiProduct( bootProducts, activeCount, truncated )` is the pure
selector behind it.

## Team & roles (TEAM-01…14, TEAM-24)

Settings → **Team & roles** (area `team`), lazy chunks `settings-team-*`:

| Screen | Path | Capability | API |
|---|---|---|---|
| People (directory, filters, bulk, export, invites, auto-join) | `/settings/team/people` | `cliedesk_manage_team` | `agents`, `agents/export`, `agents/bulk`, `invites`, `invites/confirm`, `settings/team` |
| Person (roles, overrides, effective, profile, teams, deactivate) | `/settings/team/people/$userId` | `cliedesk_manage_team` (+ `cliedesk_manage_roles` for permissions) | `users/{id}/permissions`, `…/roles`, `…/overrides`, `…/profile`, `…/default-team`, `agents/{id}/deactivate` |
| Roles (list, comparison matrix, create, reset, delete, profile locks) | `/settings/team/roles` | `cliedesk_manage_roles` | `roles`, `capabilities`, `settings/team` |
| Role editor | `/settings/team/roles/$roleKey` | `cliedesk_manage_roles` | `roles/{key}` |
| Teams / team page | `/settings/team/teams`, `/settings/team/teams/$teamId` | `cliedesk_manage_team` | `teams`, `teams/{id}`, `…/archive`, `…/restore` |
| My profile (also in the account menu) | `/settings/team/profile` | `cliedesk_access` | `profile` |

Code lives in `packages/app/team/` (api, labels, csv parsing, shared components). Query keys: `['team', …]`,
`['teams', …]`, `['profile']`. Guard errors (422/409) are shown with the server's message; locked profile fields
are read-only and a 403 `cliedesk_field_locked` locks the field in the form. A settings section can set `wide: true`
to use the full content width.

## CRM: organizations, notes, duplicates and merge (CRM-12…15, CRM-19, CRM-22, CRM-30…33)

Code lives in `packages/app/crm/` (api, Notes card, MergeDialog, MergeWith, OrgForm, CreateOrgDialog, contact-page
sections) with routes in `routes/organizations/` and `routes/contacts/DuplicatesRoute.tsx`.

| Screen | Path | Capability | API |
|---|---|---|---|
| Organizations (search, Load more, New organization) | `/organizations` | `cliedesk_view_contacts` (+ `edit` to create) | `organizations` |
| Organization (notes, details, tags, members, children, Merge with…, delete) | `/organizations/$orgId` | `cliedesk_view_contacts` (`edit`, `delete`, `merge` for actions) | `organizations/{id}`, `…/members`, `…/merge`, `organizations/merges/{id}/undo`, `tags/apply`, `notes` |
| Possible duplicates | `/contacts/duplicates` | `cliedesk_view_contacts` (`merge` for Merge…, `edit` for Not a duplicate) | `contacts/duplicates`, `…/{id}/dismiss` |
| Contact page additions | `/contacts/$contactId` | as above | `notes`, `contacts/duplicates?contactId=`, `contacts/{id}/merge`, `contacts/{id}/merges`, `contacts/merges/{id}/undo`, `contacts/{id}/conversations`, organization members |

Organization UI (route, nav item, contact-page section) is hidden when the exposed setting
`boot.settings['contacts.organizations']` is `false`. Routes and nav items accept `enabled: () => boolean` for such
conditions. Notes are rendered as plain text; without `cliedesk_edit_contacts` only the author's own notes show Edit,
Pin and Delete. Query keys: `['organizations', 'list', q]`, `['organization', id, …]`, `[entity, id, 'notes']`,
`['contacts', 'duplicates', contactId | 'all']`, `['contact', id, 'merges' | 'conversations']`. Change-feed entity
type 3 (organization) invalidates `['organizations']` and `['organization', id]`.

## Conventions

- **i18n:** every string goes through `__()`, `_n()` or `sprintf()` from `@wordpress/i18n` with the literal
  text domain `cliedesk`. Placeholders carry translator comments. Never concatenate translated strings.
- **RTL:** use logical properties and Tailwind classes only (`ps-`, `me-`, `start-`, `border-e`,
  `text-start`). ESLint (class names) and stylelint (properties) reject physical directions.
- **Tokens:** components use the semantic Tailwind colours (`bg-surface`, `text-fg-muted`, `border-line`,
  `bg-accent`, `text-danger`…). The default Tailwind palette is not loaded. stylelint forbids hex values
  outside `tokens.css`.
- **Accessibility:**
  - each screen has one `h1`, which receives focus after a client navigation;
  - the skip link is the first tab stop;
  - the landmarks are `nav` "Main", `header`, `main#cliedesk-main` and the "Notifications" region;
  - every `@cliedesk/ui` component has a jest-axe test.
