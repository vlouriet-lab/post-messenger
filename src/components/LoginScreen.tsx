/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Shield, Key, ShieldCheck, Mail, Lock, LogIn, Github, AlertCircle, ChevronRight, HelpCircle } from "lucide-react";
import { signInWithGoogle } from "../lib/firebase";
import { useTranslation } from "react-i18next";
import SettingsToggle from "./SettingsToggle";

interface LoginScreenProps {
  onLoginStart: () => void;
  onLoginError: (error: string) => void;
  loginError?: string | null;
}

export default function LoginScreen({ onLoginStart, onLoginError, loginError }: LoginScreenProps) {
  const [loading, setLoading] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const { t } = useTranslation();

  const handleSignIn = async () => {
    setLoading(true);
    onLoginStart();
    try {
      await signInWithGoogle();
    } catch (error: any) {
      console.error("Sign in failed:", error);
      onLoginError(error.message || "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center p-4 selection:bg-blue-600 selection:text-white font-sans transition-colors duration-300">
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <a
          href="https://github.com/vlouriet-lab/post-messenger"
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub Repository"
          className="p-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition flex items-center justify-center"
        >
          <Github className="w-4 h-4" />
        </a>
        <SettingsToggle />
        <button
          onClick={() => setShowExplanation(!showExplanation)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 transition"
        >
          <HelpCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>{t("how_e2ee_works")}</span>
        </button>
      </div>

      <div className="w-full max-w-md bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-3xl p-8 shadow-xl relative overflow-hidden transition-colors duration-300">
        {/* Glow Effects */}
        <div className="absolute -top-16 -left-16 w-32 h-32 bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 w-32 h-32 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center text-center">
          {/* Logo / Badge */}
          <div className="relative mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/10 relative">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center shadow-sm">
              <Key className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>

          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-700 via-slate-800 to-indigo-700 dark:from-blue-400 dark:via-slate-200 dark:to-indigo-400 bg-clip-text text-transparent">
            {t("app_name")}
          </h1>
          <p className="text-xs text-blue-600 dark:text-blue-400 font-mono mt-1 uppercase tracking-wider font-bold">
            {t("app_subtitle")}
          </p>

          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm">
            {t("app_description")}
          </p>

          {/* Features Checklist */}
          <div className="w-full mt-6 space-y-3 text-left bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 rounded-2xl p-4 font-sans text-xs text-slate-600 dark:text-slate-400 transition-colors duration-300">
            <div className="flex items-start gap-2.5">
              <Lock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-slate-800 dark:text-slate-200 font-semibold">{t("feature_1_title")}</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t("feature_1_desc")}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-slate-800 dark:text-slate-200 font-semibold">{t("feature_2_title")}</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t("feature_2_desc")}</p>
              </div>
            </div>
          </div>

          {/* Error Message Display */}
          {loginError && (
            <div className="w-full mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 flex items-center gap-2 text-rose-600 dark:text-rose-400 text-sm text-left transition-colors duration-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          {/* Google Auth Button */}
          <button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full mt-8 flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-100 dark:shadow-none group"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                {/* Google Icon */}
                <svg className="w-5 h-5 shrink-0 bg-white p-0.5 rounded-full" viewBox="0 0 24 24" width="24" height="24">
                  <path
                    fill="#EA4335"
                    d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.529-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l3.227-3.107C18.29 1.92 15.47 1 12.24 1 6.033 1 12.24s5.033 11.24 11.24 11.24c5.89 0 9.802-4.137 9.802-9.967 0-.671-.072-1.182-.16-1.528H12.24z"
                  />
                </svg>
                <span>{t("sign_in_google")}</span>
                <ChevronRight className="w-4 h-4 text-blue-200 group-hover:translate-x-0.5 transition" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Explanation Drawer overlay */}
      {showExplanation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-slate-900/80 backdrop-blur-sm transition-colors duration-300">
          <div className="w-full max-w-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl p-6 shadow-2xl relative transition-colors duration-300">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
              <Key className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              {t("crypto_safeguards")}
            </h2>
            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-h-[70vh] overflow-y-auto pr-2">
              <p>
                {t("crypto_desc_1")} <strong className="text-blue-600 dark:text-blue-400">{t("crypto_desc_2")}</strong>.
              </p>
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-600 dark:text-slate-400 space-y-3 transition-colors duration-300">
                <div>
                  <span className="text-slate-900 dark:text-white font-bold">{t("key_gen_title")}</span>
                  <p className="mt-1" dangerouslySetInnerHTML={{ __html: t("key_gen_desc") }}></p>
                </div>
                <div>
                  <span className="text-slate-900 dark:text-white font-bold">{t("key_part_title")}</span>
                  <p className="mt-1" dangerouslySetInnerHTML={{ __html: t("key_part_desc") }}></p>
                </div>
                <div>
                  <span className="text-slate-900 dark:text-white font-bold">{t("sym_enc_title")}</span>
                  <p className="mt-1">{t("sym_enc_desc")}</p>
                </div>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {t("crypto_footer")}
              </p>
            </div>
            <button
              onClick={() => setShowExplanation(false)}
              className="mt-6 w-full py-2.5 px-4 rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-sm font-medium text-white transition"
            >
              {t("i_understand")}
            </button>
          </div>
        </div>
      )}

      {/* Humble credit line adhering strictly to structural rules: no tech larping, clean footer */}
      <div className="mt-8 text-[11px] text-slate-400 dark:text-slate-500 font-mono tracking-wider uppercase">
        {t("app_name")} • End-to-End Encrypted
      </div>
    </div>
  );
}
