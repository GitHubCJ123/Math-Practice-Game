import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Centralised, imperative per-route SEO controller.
 *
 * The app is a client-rendered SPA whose static `index.html` already ships the
 * canonical home-page tags. Rather than rendering a second `<title>` per route
 * (which would create duplicate title elements and let the static one win), this
 * component updates the existing head tags in place on every navigation:
 *   - document title
 *   - meta description
 *   - canonical link
 *   - robots (noindex on stateful / private routes)
 *   - og/twitter title, description, url (kept in sync for client navigations)
 */

const SITE_URL = 'https://mathpracticegame.vercel.app';

const HOME_TITLE = 'Math Practice Game | Free Mental Math Practice for Kids';
const DEFAULT_DESCRIPTION =
  'Master times tables, division, fractions, squares, and square roots with fast, fun math drills. Play solo, race friends in live multiplayer, or challenge AI. Free to play.';

interface RouteMeta {
  title: string;
  description?: string;
  noindex?: boolean;
  canonicalPath?: string;
}

function metaForPath(pathname: string): RouteMeta {
  if (pathname === '/') {
    return { title: HOME_TITLE, description: DEFAULT_DESCRIPTION, canonicalPath: '/' };
  }
  if (
    pathname === '/multiplayer' ||
    pathname.startsWith('/multiplayer/') ||
    pathname.startsWith('/join/')
  ) {
    return {
      title: 'Multiplayer | Math Practice Game',
      description: 'Create a room and race friends or AI opponents in live multiplayer math battles.',
      noindex: true,
    };
  }
  if (pathname.startsWith('/tournament')) {
    return {
      title: 'Tournament | Math Practice Game',
      description: 'Run bracket-style math tournaments with live head-to-head matches.',
      noindex: true,
    };
  }
  if (pathname === '/quiz') {
    return { title: 'Practice Quiz | Math Practice Game', noindex: true };
  }
  if (pathname === '/results') {
    return { title: 'Your Results | Math Practice Game', noindex: true };
  }
  if (pathname === '/admin') {
    return { title: 'Admin | Math Practice Game', noindex: true };
  }
  return { title: 'Page Not Found | Math Practice Game', noindex: true };
}

function upsertMeta(selector: string, attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function removeMeta(selector: string): void {
  document.head.querySelector(selector)?.remove();
}

function upsertCanonical(href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function RouteSeo(): null {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = metaForPath(pathname);
    const description = meta.description ?? DEFAULT_DESCRIPTION;
    const canonicalUrl = SITE_URL + (meta.canonicalPath ?? pathname);

    document.title = meta.title;
    upsertMeta('meta[name="description"]', 'name', 'description', description);
    upsertCanonical(canonicalUrl);

    if (meta.noindex) {
      upsertMeta('meta[name="robots"]', 'name', 'robots', 'noindex, follow');
    } else {
      removeMeta('meta[name="robots"]');
    }

    upsertMeta('meta[property="og:title"]', 'property', 'og:title', meta.title);
    upsertMeta('meta[property="og:description"]', 'property', 'og:description', description);
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', meta.title);
    upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
  }, [pathname]);

  return null;
}
