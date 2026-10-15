/**
 * Widget styles (inside the Shadow DOM, so the site's CSS cannot reach them). System font, the brand accent from
 * `--cdw-accent`, light/dark from the visitor's preference unless the theme is fixed (cdw-theme-light/dark), launcher
 * offsets from `--cdw-x`/`--cdw-y`, logical corners for RTL, reduced motion respected (CHN-10, CHN-17).
 */
/**
 * Attach styles to a shadow root as a constructed stylesheet (allowed under a strict CSP without 'unsafe-inline',
 * CHN-16), with a <style> element only for browsers without constructable stylesheets.
 *
 * @param root Shadow root.
 * @param css  CSS.
 */
export function adoptStyles( root: ShadowRoot, css: string ): void {
	try {
		const sheet = new CSSStyleSheet();
		sheet.replaceSync( css );
		root.adoptedStyleSheets = [ sheet ];
		return;
	} catch {
		// Older browsers: a style element.
	}
	const style = document.createElement( 'style' );
	style.textContent = css;
	root.appendChild( style );
}

export const STYLES = `
:host{all:initial;--cdw-bg:#fff;--cdw-fg:#1f2328;--cdw-muted:#57606a;--cdw-line:#d0d7de;--cdw-sunken:#f6f8fa;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--cdw-fg)}
@media (prefers-color-scheme:dark){:host(:not(.cdw-theme-light)){--cdw-bg:#161b22;--cdw-fg:#e6edf3;--cdw-muted:#9da7b3;--cdw-line:#30363d;--cdw-sunken:#0d1117}}
:host(.cdw-theme-dark){--cdw-bg:#161b22;--cdw-fg:#e6edf3;--cdw-muted:#9da7b3;--cdw-line:#30363d;--cdw-sunken:#0d1117}
*{box-sizing:border-box}
button,input,textarea{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--cdw-accent);outline-offset:2px}
.cdw-launcher{position:fixed;bottom:var(--cdw-y,20px);z-index:2147483000;width:56px;height:56px;border-radius:50%;border:0;background:var(--cdw-accent);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.25)}
.cdw-launcher.cdw-label{width:auto;border-radius:28px;padding:0 18px;gap:8px;font-weight:600}
.cdw-right{right:var(--cdw-x,20px)}.cdw-left{left:var(--cdw-x,20px)}
.cdw-panel{position:fixed;bottom:calc(var(--cdw-y,20px) + 68px);z-index:2147483000;width:380px;max-width:calc(100vw - 32px);height:min(640px,calc(100vh - 120px));display:flex;flex-direction:column;background:var(--cdw-bg);border:1px solid var(--cdw-line);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.25);overflow:hidden}
.cdw-panel.cdw-right{right:var(--cdw-x,20px)}.cdw-panel.cdw-left{left:var(--cdw-x,20px)}
.cdw-logo{height:28px;width:auto;max-width:120px;border-radius:4px}[dir=rtl] .cdw-flip{transform:scaleX(-1)}
@media (max-width:639px){.cdw-panel{inset:0;width:auto;max-width:none;height:100dvh;border-radius:0;bottom:0}}
.cdw-panel.cdw-full{inset:0;width:auto;max-width:none;height:100dvh;border:0;border-radius:0;box-shadow:none;bottom:0}
.cdw-head{display:flex;align-items:center;gap:8px;padding:14px 16px;background:var(--cdw-accent);color:#fff}
.cdw-head h2{margin:0;font-size:16px;flex:1}
.cdw-icon{background:transparent;border:0;color:inherit;cursor:pointer;padding:4px;border-radius:6px;line-height:0}
.cdw-body{flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:8px}
.cdw-greet{color:var(--cdw-muted);margin:4px 0 8px}
.cdw-notice{border-inline-start:4px solid #2563eb;background:var(--cdw-sunken);padding:8px 10px;margin:0 0 10px;border-radius:4px}.cdw-notice p{margin:4px 0 0}.cdw-notice-incident{border-inline-start-color:#c2410c}
.cdw-quick{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px}.cdw-quick button{border:1px solid var(--cdw-line);border-radius:999px;background:transparent;color:inherit;padding:6px 12px;font:inherit;cursor:pointer}.cdw-quick button:hover{background:var(--cdw-sunken)}
.cdw-spaces{display:flex;gap:4px;padding:8px 16px 0;border-bottom:1px solid var(--cdw-line)}.cdw-spaces button{flex:1;border:0;border-bottom:2px solid transparent;background:transparent;color:inherit;padding:6px;font:inherit;cursor:pointer}.cdw-spaces button[aria-pressed=true]{border-bottom-color:var(--cdw-accent);font-weight:600}.cdw-suggest{margin-top:8px;padding:8px;border:1px dashed currentColor;border-radius:8px}.cdw-article{overflow-wrap:anywhere}.cdw-article img{max-width:100%;height:auto}.cdw-card{border:1px solid var(--cdw-line);border-radius:10px;padding:10px 12px;margin:0 0 10px}.cdw-card h3{margin:0 0 6px;font-size:14px}.cdw-help input{width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--cdw-line);border-radius:8px;font:inherit;margin-bottom:8px}
.cdw-survey{border:1px solid var(--cdw-line,#d0d7de);border-radius:10px;padding:10px;margin:8px 0}.cdw-choices{display:flex;flex-wrap:wrap;gap:6px}.cdw-choices button{font-size:20px;padding:4px 8px;border:1px solid var(--cdw-line,#d0d7de);border-radius:8px;background:transparent;cursor:pointer}.cdw-choices button[aria-pressed=true]{outline:2px solid var(--cdw-accent,#2563eb)}.cdw-survey fieldset{border:0;padding:0;margin:8px 0}.cdw-survey textarea{width:100%;box-sizing:border-box;min-height:60px}.cdw-reply-card{margin-top:6px;padding:8px;border:1px solid var(--cdw-line);border-radius:8px}.cdw-reply-card dl{margin:4px 0}.cdw-reply-card dd{margin:0 0 4px}.cdw-reply-card img{max-width:100%}.cdw-reply-card a{color:inherit}.cdw-card-form{display:flex;flex-direction:column;gap:6px}.cdw-card-form input,.cdw-card-form select{font:inherit}
.cdw-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.cdw-msg{max-width:85%;padding:8px 12px;border-radius:14px;white-space:pre-wrap;overflow-wrap:anywhere}
.cdw-visitor{align-self:flex-end;background:var(--cdw-accent);color:#fff;border-end-end-radius:4px}
.cdw-team{align-self:flex-start;background:var(--cdw-sunken);border-end-start-radius:4px}
.cdw-who{display:block;font-size:12px;opacity:.8;margin-bottom:2px}
.cdw-avatar{border-radius:50%;vertical-align:middle;margin-inline-end:4px}
.cdw-quote{margin:2px 0 4px;padding-inline-start:8px;border-inline-start:2px solid var(--cdw-line);opacity:.8;font-size:.9em}
.cdw-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.cdw-item{width:100%;text-align:start;background:var(--cdw-sunken);border:1px solid var(--cdw-line);border-radius:10px;padding:10px 12px;cursor:pointer}
.cdw-foot{border-top:1px solid var(--cdw-line);padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.cdw-row{display:flex;gap:8px;align-items:flex-end}
.cdw-field{width:100%;border:1px solid var(--cdw-line);border-radius:10px;padding:8px 10px;background:var(--cdw-bg)}
textarea.cdw-field{resize:none;min-height:40px;max-height:120px}
.cdw-bot{min-height:65px}
.cdw-topics{border:0;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.cdw-topics legend{padding:0;margin-bottom:6px;font-weight:600}
.cdw-topic{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--cdw-line);border-radius:999px;padding:4px 10px;cursor:pointer}
.cdw-topic:has(input:checked){border-color:var(--cdw-accent);color:var(--cdw-accent)}
.cdw-send{border:0;border-radius:10px;padding:9px 14px;background:var(--cdw-accent);color:#fff;cursor:pointer;font-weight:600}
.cdw-send[disabled]{opacity:.6;cursor:default}
.cdw-link{background:none;border:0;color:var(--cdw-accent);cursor:pointer;padding:0;font-weight:600}
.cdw-error{color:#cf222e}
.cdw-credit{margin:0;padding:4px 16px 8px;font-size:11px;text-align:center;opacity:.7}
.cdw-file{display:block;margin-top:4px;color:inherit;text-decoration:underline;overflow-wrap:anywhere}
.cdw-suggest{margin-top:8px;padding:8px;border:1px dashed currentColor;border-radius:8px}.cdw-article{overflow-wrap:anywhere}.cdw-article img{max-width:100%;height:auto}.cdw-card{display:block;margin-top:6px;padding:8px;border:1px solid currentColor;border-radius:8px;color:inherit;text-decoration:none}.cdw-card span{display:block;opacity:.8}.cdw-options{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.cdw-options button{font:inherit;padding:4px 10px;border-radius:999px;border:1px solid currentColor;background:none;color:inherit;cursor:pointer}
.cdw-audio{display:block;margin-top:6px;max-width:100%}
.cdw-carousel{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory}.cdw-carousel>*{flex:0 0 80%;scroll-snap-align:start}.cdw-inline-form{display:flex;flex-direction:column;gap:6px;margin-top:8px}.cdw-inline-form label{display:flex;flex-direction:column;gap:2px;font-size:13px}
.cdw-chip{display:inline-flex;align-items:center;gap:2px;border:1px solid var(--cdw-line);border-radius:999px;padding:0 4px 0 10px;font-size:13px}
.cdw-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (prefers-reduced-motion:no-preference){.cdw-panel{animation:cdw-in .15s ease-out}@keyframes cdw-in{from{opacity:0;transform:translateY(8px)}}}
`;
