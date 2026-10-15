# Cliedesk

Helpdesk inside WordPress: shared inbox, live chat, help center, customer portal and WooCommerce orders.

- Plugin: https://wordpress.org/plugins/cliedesk/
- Report a bug or ask a question: [GitHub issues](https://github.com/degird/cliedesk/issues)

## What is in this repository

The source code of the compiled JavaScript in the plugin's `build/` folder:

| Source | Built file |
|---|---|
| `app/packages/data`, `ui`, `app` | `build/data.js`, `build/ui.js`, `build/app.js`, `build/app.css`, `build/chunks/` (the `/dash` app) |
| `app/styles/public.css` | `build/public.css` (styles for the site's public Cliedesk pages) |
| `app/packages/widget` | `build/widget/` (the chat widget, request form and customer portal) |

The PHP code and the other scripts in the plugin are not compiled; they are readable in the plugin itself.

## Build

Node.js >=22:

```bash
npm install
npm run build
```

The output is written to `build/`, the same folder the plugin ships. React, ReactDOM and `@wordpress/*` packages
come from WordPress core at runtime (wp-scripts dependency extraction).

## Licence

GPL-2.0-or-later, the same as the plugin.
