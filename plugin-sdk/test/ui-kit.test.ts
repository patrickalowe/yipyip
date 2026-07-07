import { describe, it, expect } from 'vitest';
import { YIPYIP_UI_CSS, YIPYIP_THEME_JS, YIPYIP_UI_MARKER, injectYipyipUi } from '../src/index.js';

describe('design kit', () => {
  it('ships a token-driven stylesheet with the signature yipyip components', () => {
    // Components an author leans on.
    for (const cls of ['.yipyip-card', '.yipyip-glass', '.yipyip-btn', '.yipyip-input', '.yipyip-chip', '.yipyip-row']) {
      expect(YIPYIP_UI_CSS).toContain(cls);
    }
    // The glass recipe is baked (it can't be read over the bridge) and swaps for dark.
    expect(YIPYIP_UI_CSS).toContain('--glass-bg');
    expect(YIPYIP_UI_CSS).toContain('--glass-highlight');
    expect(YIPYIP_UI_CSS).toContain('[data-theme="dark"]');
    // Honours the same accessibility choices as the host.
    expect(YIPYIP_UI_CSS).toContain('prefers-reduced-motion');
    expect(YIPYIP_UI_CSS).toContain('[data-no-transparency]');
  });

  it('ships a bootstrap that wires the frame and never breaks inline embedding', () => {
    expect(YIPYIP_THEME_JS).toContain("type: 'yipyip:ready'");
    expect(YIPYIP_THEME_JS).toContain('window.yipyip');
    expect(YIPYIP_THEME_JS).toContain("'yipyip:context'");
    // Applies the host tokens + theme to the document.
    expect(YIPYIP_THEME_JS).toContain('setProperty');
    expect(YIPYIP_THEME_JS).toContain("setAttribute('data-theme'");
    // Auto-sizing so a widget/page reports its own height.
    expect(YIPYIP_THEME_JS).toContain('yipyip:resize');
    // Trusts only the real parent window (opaque frame has a 'null' origin).
    expect(YIPYIP_THEME_JS).toContain('ev.source !== window.parent');
  });

  it('never contains a closing tag that would break <style>/<script> inlining', () => {
    expect(YIPYIP_UI_CSS.toLowerCase()).not.toContain('</style');
    expect(YIPYIP_UI_CSS.toLowerCase()).not.toContain('</script');
    expect(YIPYIP_THEME_JS.toLowerCase()).not.toContain('</script');
    expect(YIPYIP_THEME_JS.toLowerCase()).not.toContain('</style');
  });

  it('injectYipyipUi expands the marker into an inline style + script block', () => {
    const html = `<!doctype html><html><head></head><body>${YIPYIP_UI_MARKER}</body></html>`;
    const out = injectYipyipUi(html);
    expect(out).not.toContain(YIPYIP_UI_MARKER);
    expect(out).toContain('<style data-yipyip-ui>');
    expect(out).toContain('<script data-yipyip-ui>');
    expect(out).toContain('.yipyip-glass');
    expect(out).toContain('window.yipyip');
  });

  it('injectYipyipUi is a no-op without the marker and expands every occurrence', () => {
    const plain = '<html><body><h1>hi</h1></body></html>';
    expect(injectYipyipUi(plain)).toBe(plain);
    const twice = `${YIPYIP_UI_MARKER}<hr>${YIPYIP_UI_MARKER}`;
    const out = injectYipyipUi(twice);
    expect(out.match(/<style data-yipyip-ui>/g)?.length).toBe(2);
  });
});
