/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  X, 
  Key, 
  Download, 
  Upload, 
  RefreshCw, 
  ShieldCheck, 
  AlertTriangle, 
  Copy, 
  Check, 
  User as UserIcon,
  HelpCircle,
  FileText,
  QrCode
} from "lucide-react";
import { AppUser } from "../types";
import { getPublicKeyFingerprint } from "../lib/crypto";
import { useTranslation } from "react-i18next";
import DeviceSyncOverlay from "./DeviceSyncOverlay";

interface SecurityPanelProps {
  currentUser: AppUser;
  myPrivateKeyJWK: JsonWebKey | null;
  myPrivateKey: CryptoKey | null;
  onClose: () => void;
  onGenerateNewKeys: () => Promise<void>;
  onImportPrivateKey: (privateKeyJWK: JsonWebKey) => Promise<boolean>;
}

export default function SecurityPanel({
  currentUser,
  myPrivateKeyJWK,
  myPrivateKey,
  onClose,
  onGenerateNewKeys,
  onImportPrivateKey
}: SecurityPanelProps) {
  const [fingerprint, setFingerprint] = useState<string>("Loading...");
  const [copiedPublic, setCopiedPublic] = useState(false);
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);
  const [copiedPrivate, setCopiedPrivate] = useState(false);
  
  const [regenerating, setRegenerating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState(false);
  const [showConfirmRegen, setShowConfirmRegen] = useState(false);
  const [showHostSyncOverlay, setShowHostSyncOverlay] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const fetchFingerprint = async () => {
      if (currentUser.publicKeyJWK) {
        const fp = await getPublicKeyFingerprint(currentUser.publicKeyJWK);
        setFingerprint(fp);
      } else {
        setFingerprint(t("no_keys_registered"));
      }
    };
    fetchFingerprint();
  }, [currentUser.publicKeyJWK, t]);

  const handleCopy = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportPrivateKey = () => {
    if (!myPrivateKeyJWK) return;
    
    const keyData = {
      note: "Backup of Post Messenger private key. KEEP THIS SECURE. DO NOT SHARE.",
      userId: currentUser.uid,
      displayName: currentUser.displayName,
      email: currentUser.email,
      privateKeyJWK: myPrivateKeyJWK,
      publicKeyJWK: currentUser.publicKeyJWK,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(keyData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `post_messenger_key_${currentUser.email.split("@")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportError("");
    setImportSuccess(false);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (!data.privateKeyJWK) {
          throw new Error("Invalid key file: Private key JWK (privateKeyJWK) is missing.");
        }
        
        const success = await onImportPrivateKey(data.privateKeyJWK);
        if (success) {
          setImportSuccess(true);
        } else {
          setImportError("Mismatch: Imported private key does not correspond to your public key on file in the cloud.");
        }
      } catch (err: any) {
        setImportError(err.message || "Failed to parse backup file.");
      } finally {
        setImporting(false);
      }
    };
    reader.readAsText(file);
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await onGenerateNewKeys();
      setShowConfirmRegen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40 backdrop-blur-sm transition-opacity font-sans">
      <div className="w-full max-w-md h-full bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 flex flex-col shadow-2xl relative transition-colors duration-300">
        
        {/* Panel Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 transition-colors duration-300">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider font-sans">{t("security_settings")}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Panel Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          
          {/* Section: Profile */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 p-4 rounded-2xl flex items-center gap-4 shadow-sm transition-colors duration-300">
            <img
              src={currentUser.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${currentUser.displayName}`}
              alt={currentUser.displayName}
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-full border border-slate-100 dark:border-slate-700 object-cover"
            />
            <div className="min-w-0 flex-1 leading-tight">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block truncate">{currentUser.displayName}</span>
              <span className="text-xs text-slate-400 dark:text-slate-500 block truncate mt-0.5">{currentUser.email}</span>
              <span className="inline-flex items-center gap-1 mt-2 text-[9px] font-mono text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800">
                <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                {t("verified_identity")}
              </span>
            </div>
          </div>

          {/* Section: Cryptographic Fingerprint */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-sans">{t("your_fingerprint")}</h3>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed font-sans">
              {t("fingerprint_desc")}
            </p>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3.5 rounded-2xl flex items-center justify-between gap-3 font-mono text-blue-600 dark:text-blue-400 text-xs shadow-sm transition-colors duration-300">
              <span className="tracking-wide break-all text-center flex-1 font-semibold">{fingerprint}</span>
              <button
                onClick={() => handleCopy(fingerprint, setCopiedFingerprint)}
                className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition shrink-0"
                title="Copy Fingerprint"
              >
                {copiedFingerprint ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Section: Key Backup & Restoration */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-sans">{t("keys_backup_recovery")}</h3>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed font-sans">
              {t("backup_desc")}
            </p>

            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setShowHostSyncOverlay(true)}
                disabled={!myPrivateKeyJWK}
                className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 transition text-xs font-semibold shadow-sm"
              >
                <QrCode className="w-4 h-4" />
                <span className="text-center leading-tight">Sync<br/>Device</span>
              </button>

              <button
                onClick={handleExportPrivateKey}
                disabled={!myPrivateKeyJWK}
                className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition text-xs font-semibold shadow-sm"
              >
                <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-center leading-tight">Backup<br/>Key</span>
              </button>

              <label className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition text-xs font-semibold cursor-pointer shadow-sm">
                <Upload className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-center leading-tight">Import<br/>Key</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportFile}
                  className="hidden"
                  disabled={importing}
                />
              </label>
            </div>

            {importing && (
              <div className="text-center text-xs text-slate-400 dark:text-slate-500 font-mono py-1">
                {t("parsing_credentials")}
              </div>
            )}
            {importError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-900/30 border border-rose-100 dark:border-rose-800 text-rose-600 dark:text-rose-400 rounded-xl text-xs flex items-start gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{importError}</span>
              </div>
            )}
            {importSuccess && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs flex items-start gap-2 font-medium">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{t("private_key_restored")}</span>
              </div>
            )}
          </div>

          {/* Section: Cryptographic Key Inspectors */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-sans">{t("cryptographic_manifest")}</h3>
            <div className="space-y-2">
              <div>
                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase font-bold">{t("public_key_jwk")}</span>
                <div className="relative mt-1">
                  <div className="text-[10px] font-mono bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 break-all select-all font-light leading-normal max-h-24 overflow-y-auto shadow-sm">
                    {JSON.stringify(currentUser.publicKeyJWK)}
                  </div>
                  <button
                    onClick={() => handleCopy(JSON.stringify(currentUser.publicKeyJWK), setCopiedPublic)}
                    className="absolute top-2 right-2 p-1 rounded-md bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition"
                  >
                    {copiedPublic ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase font-bold">{t("private_key_jwk")}</span>
                <div className="relative mt-1">
                  <div className="text-[10px] font-mono bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 break-all select-all font-light leading-normal max-h-24 overflow-y-auto shadow-sm">
                    {myPrivateKeyJWK ? JSON.stringify(myPrivateKeyJWK) : t("private_key_missing_or_locked")}
                  </div>
                  {myPrivateKeyJWK && (
                    <button
                      onClick={() => handleCopy(JSON.stringify(myPrivateKeyJWK), setCopiedPrivate)}
                      className="absolute top-2 right-2 p-1 rounded-md bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition"
                    >
                      {copiedPrivate ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section: Key Regeneration */}
          <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold text-rose-600 dark:text-rose-500 uppercase tracking-wider font-sans">{t("danger_zone")}</h3>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed font-sans">
              {t("regenerate_desc")}
            </p>

            {!showConfirmRegen ? (
              <button
                onClick={() => setShowConfirmRegen(true)}
                className="w-full flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-rose-50 dark:bg-rose-900/30 border border-rose-100 dark:border-rose-800/50 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 transition text-xs font-semibold"
              >
                <RefreshCw className="w-4 h-4 shrink-0" />
                <span>{t("regenerate_keys")}</span>
              </button>
            ) : (
              <div className="p-4 bg-rose-50 dark:bg-rose-900/30 border border-rose-100 dark:border-rose-800/50 rounded-2xl space-y-3">
                <div className="flex items-start gap-2 text-rose-600 dark:text-rose-400 text-xs font-medium">
                  <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block text-rose-700 dark:text-rose-300">{t("are_you_sure")}</span>
                    <span className="text-[10px] text-rose-500 dark:text-rose-400">{t("regenerate_warning")}</span>
                  </div>
                </div>
                <div className="flex gap-2 text-xs">
                  <button
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    className="flex-1 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-700 font-bold transition flex items-center justify-center gap-1 shadow-sm"
                  >
                    {regenerating ? t("regenerating") : t("yes_replace_keys")}
                  </button>
                  <button
                    onClick={() => setShowConfirmRegen(false)}
                    className="flex-1 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold transition shadow-sm"
                  >
                    {t("cancel")}
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Panel Footer */}
        <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500 font-mono text-center flex items-center justify-center gap-1.5 transition-colors duration-300">
          <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span>{t("local_device_registry")}</span>
        </div>
      </div>

      {/* Device Sync Host Overlay */}
      {showHostSyncOverlay && (
        <DeviceSyncOverlay
          mode="host"
          currentUser={currentUser}
          myPrivateKey={myPrivateKey}
          onComplete={() => setShowHostSyncOverlay(false)}
          onCancel={() => setShowHostSyncOverlay(false)}
        />
      )}
    </div>
  );
}
