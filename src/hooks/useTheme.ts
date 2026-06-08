import { useCallback, useEffect, useState } from 'react';

/**
 * Owns dark-mode state, persists the choice to localStorage under the
 * `theme` key, honours a `?theme=dark|light` query param override, and
 * keeps the `<html>` element's `dark` class in sync.
 */
export function useTheme(): { isDarkMode: boolean; toggleDarkMode: () => void } {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const themeParam = params.get('theme');
    if (themeParam === 'dark' || themeParam === 'light') {
      setIsDarkMode(themeParam === 'dark');
      localStorage.setItem('theme', themeParam);
    } else {
      setIsDarkMode(localStorage.getItem('theme') === 'dark');
    }
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode(prev => !prev);
  }, []);

  return { isDarkMode, toggleDarkMode };
}
