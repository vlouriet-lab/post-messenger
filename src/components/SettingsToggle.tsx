import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from './ThemeProvider';
import { Moon, Sun, Languages, Bell, BellRing } from 'lucide-react';
import { registerFCMToken } from '../lib/firebase';
import { AppUser } from '../types';

interface SettingsToggleProps {
  currentUser?: AppUser | null;
}

export default function SettingsToggle({ currentUser }: SettingsToggleProps) {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [notifPerm, setNotifPerm] = React.useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'en' ? 'ru' : 'en';
    i18n.changeLanguage(nextLang);
  };

  const handleEnableNotifications = async () => {
    if (currentUser && notifPerm !== 'granted') {
      await registerFCMToken(currentUser.uid, true);
      setNotifPerm(Notification.permission);
      if (Notification.permission === 'granted') {
        alert(t('notifications_enabled', 'Notifications enabled successfully!'));
      }
    }
  };

  return (
    <div className="flex items-center gap-2">
      {currentUser && typeof Notification !== 'undefined' && notifPerm !== 'granted' && (
        <button
          onClick={handleEnableNotifications}
          title={t('enable_notifications', 'Enable Notifications')}
          className="p-2 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition relative"
        >
          <Bell className="w-4 h-4 animate-pulse" />
          <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-rose-500" />
        </button>
      )}
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
