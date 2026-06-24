import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from './ThemeProvider';
import { Moon, Sun, Languages } from 'lucide-react';

export default function SettingsToggle() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'en' ? 'ru' : 'en';
    i18n.changeLanguage(nextLang);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleLanguage}
        title={t('language')}
        className="p-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition"
      >
        <Languages className="w-4 h-4" />
        <span className="sr-only">{t('language')}</span>
      </button>
      <button
        onClick={toggleTheme}
        title={theme === 'dark' ? t('theme_light') : t('theme_dark')}
        className="p-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition"
      >
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        <span className="sr-only">Toggle Theme</span>
      </button>
    </div>
  );
}
