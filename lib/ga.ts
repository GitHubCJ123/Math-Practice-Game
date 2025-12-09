const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_ID;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

const isBrowser = (): boolean =>
  typeof window !== 'undefined' && typeof document !== 'undefined';

const isDoNotTrackEnabled = (): boolean => {
  if (!isBrowser()) return false;
  const dnt =
    (window as typeof window & { doNotTrack?: string }).doNotTrack ||
    (navigator as Navigator & { msDoNotTrack?: string }).doNotTrack ||
    (navigator as Navigator & { msDoNotTrack?: string }).msDoNotTrack;
  return dnt === '1' || dnt === 'yes';
};

let initialized = false;

export const initGoogleAnalytics = (): boolean => {
  if (initialized) return true;
  if (!GA_MEASUREMENT_ID || !isBrowser() || isDoNotTrackEnabled()) return false;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer.push(args);
  };

  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, { send_page_view: false });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  initialized = true;
  return true;
};

export const trackPageView = (path: string): void => {
  if (!initialized || !window.gtag) return;
  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
};


