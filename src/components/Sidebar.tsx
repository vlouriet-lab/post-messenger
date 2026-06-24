/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Search, 
  MessageSquare, 
  UserPlus, 
  ShieldCheck, 
  User as UserIcon,
  Clock,
  Key,
  Users,
  Circle,
  LogOut
} from "lucide-react";
import { AppUser, Chat } from "../types";
import { collection, query, where, getDocs, limit, or, and, deleteDoc, doc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { useTranslation } from "react-i18next";
import SettingsToggle from "./SettingsToggle";
import CreateGroupDialog from "./CreateGroupDialog";

interface SidebarProps {
  currentUser: AppUser;
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onOpenSecurityPanel: () => void;
  onLogout: () => void;
  onStartNewDirectChat: (user: AppUser) => Promise<string | null>;
  onStartNewGroupChat: (name: string, members: AppUser[]) => Promise<string | null>;
  decryptedPreviews: { [chatId: string]: string };
}

export default function Sidebar({
  currentUser,
  chats,
  activeChatId,
  onSelectChat,
  onOpenSecurityPanel,
  onLogout,
  onStartNewDirectChat,
  onStartNewGroupChat,
  decryptedPreviews
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AppUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const { t } = useTranslation();

  // Extract unique contacts from existing chats
  const availableContacts = React.useMemo(() => {
    const contactMap = new Map<string, AppUser>();
    chats.forEach(chat => {
      if (!chat.isGroup) {
        Object.values(chat.participantDetails).forEach(user => {
          if (user.uid !== currentUser.uid && !contactMap.has(user.uid)) {
            // We cast AppUserSummary to AppUser, they are mostly compatible for the dialog
            contactMap.set(user.uid, user as AppUser);
          }
        });
      }
    });
    return Array.from(contactMap.values());
  }, [chats, currentUser.uid]);

  // Live search for other users in Firestore
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const searchUsers = async () => {
      setSearching(true);
      try {
        const usersRef = collection(db, "users");
        const q = query(
          usersRef,
          where("email", ">=", searchQuery.toLowerCase()),
          where("email", "<=", searchQuery.toLowerCase() + "\uf8ff"),
          limit(10)
        );

        let querySnapshot;
        try {
          querySnapshot = await getDocs(q);
        } catch (err) {
          handleFirestoreError(err, OperationType.LIST, "users");
          return;
        }

        const results: AppUser[] = [];
        querySnapshot.forEach((doc) => {
          const userData = doc.data() as AppUser;
          if (userData.uid !== currentUser.uid) {
            results.push(userData);
          }
        });
        setSearchResults(results);
      } catch (err) {
        console.error("Error searching users:", err);
      } finally {
        setSearching(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      searchUsers();
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, currentUser.uid]);

  const handleSelectSearchResult = async (user: AppUser) => {
    setSearchQuery("");
    setSearchResults([]);
    setSearchFocused(false);
    await onStartNewDirectChat(user);
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return t("yesterday");
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const handleDeleteChat = async (e: React.MouseEvent, chat: Chat) => {
    e.preventDefault();
    if (window.confirm(t("confirm_delete_chat", "Are you sure you want to completely delete this chat? This action cannot be undone."))) {
      try {
        await deleteDoc(doc(db, "chats", chat.id));
        if (activeChatId === chat.id) {
          onSelectChat(null);
        }
      } catch (err) {
        console.error("Failed to delete chat", err);
      }
    }
  };

  return (
    <div className="w-full md:w-80 h-full flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 flex-shrink-0 transition-colors duration-300">
      {/* Header Profile Section */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 transition-colors duration-300">
        <div className="flex items-center gap-3">
          <div className="relative group">
            <img
              src={currentUser.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${currentUser.displayName}`}
              alt={currentUser.displayName}
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-full border border-blue-100 dark:border-blue-900 object-cover"
            />
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-sm truncate text-slate-800 dark:text-slate-200 leading-tight">
              {currentUser.displayName}
            </span>
            <div className="flex items-center gap-1 mt-0.5">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-mono font-bold truncate uppercase tracking-wider">
                {t("e2ee_active")}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-wrap justify-end">
          <button
            onClick={() => setShowCreateGroup(true)}
            title={t("create_group", "Create Group")}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            <Users className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenSecurityPanel}
            title={t("key_management")}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            <Key className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors duration-300">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={t("search_placeholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            className="w-full pl-9 pr-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 text-xs rounded-xl border border-transparent focus:border-blue-300 dark:focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-blue-100 dark:focus:ring-blue-900 focus:outline-none transition font-sans"
          />
        </div>

        {/* Search Results Drawer */}
        {searchFocused && (searchQuery.trim() !== "" || searching) && (
          <div className="absolute left-4 right-4 md:left-auto md:w-72 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-30 overflow-hidden max-h-80 flex flex-col transition-colors duration-300">
            <div className="p-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider pl-1">
                {t("secure_registry")}
              </span>
              <button 
                onClick={() => { setSearchQuery(""); setSearchFocused(false); }}
                className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-1"
              >
                {t("close")}
              </button>
            </div>
            <div className="overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700 flex-1">
              {searching ? (
                <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <div className="w-3.5 h-3.5 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                  <span>{t("searching_keys")}</span>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  {t("no_users_found")}
                </div>
              ) : (
                searchResults.map((user) => (
                  <button
                    key={user.uid}
                    onClick={() => handleSelectSearchResult(user)}
                    className="w-full p-3 flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
                  >
                    <img
                      src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName}`}
                      alt={user.displayName}
                      referrerPolicy="no-referrer"
                      className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 object-cover shrink-0"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate leading-tight">
                        {user.displayName}
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {user.email}
                      </span>
                      {user.publicKeyJWK ? (
                        <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-mono mt-1 flex items-center gap-0.5">
                          <Circle className="w-1.5 h-1.5 fill-emerald-500 text-emerald-500" />
                          {t("keys_verified")}
                        </span>
                      ) : (
                        <span className="text-[9px] text-slate-400 font-mono mt-1">
                          {t("no_keys_registered")}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Chats List Area */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        <div className="p-2.5 px-3 bg-slate-50 dark:bg-slate-900/50 text-[10px] text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider flex items-center justify-between transition-colors duration-300">
          <span>{t("active_channels")}</span>
          <MessageSquare className="w-3 h-3 text-slate-400" />
        </div>

        {chats.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-3">
            <MessageSquare className="w-8 h-8 text-slate-300 dark:text-slate-600 stroke-1" />
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-300">{t("inbox_empty")}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{t("search_to_establish")}</p>
            </div>
          </div>
        ) : (
          chats.map((chat) => {
            const isGroup = chat.isGroup;
            let displayName = "";
            let photoURL = "";
            let emailText = "";
            let contactIsOnline = false;

            if (isGroup) {
              displayName = chat.groupName || "Unnamed Group";
              photoURL = `https://api.dicebear.com/7.x/initials/svg?seed=${displayName}`;
              emailText = `${chat.participants.length} participants`;
            } else {
              const otherUid = chat.participants.find((p) => p !== currentUser.uid);
              const contact = otherUid ? chat.participantDetails[otherUid] : null;
              if (!contact) return null;
              displayName = contact.displayName;
              photoURL = contact.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${displayName}`;
              emailText = contact.email;
              contactIsOnline = (contact as any).isOnline === true;
            }

            const isActive = chat.id === activeChatId;
            const lastMsg = chat.lastMessage;
            const previewText = decryptedPreviews[chat.id] || lastMsg?.textPreview || "Secure message";

            return (
              <button
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                onDoubleClick={(e) => handleDeleteChat(e, chat)}
                onContextMenu={(e) => handleDeleteChat(e, chat)}
                className={`w-full p-3.5 flex items-start gap-3 text-left border-l-2 transition ${
                  isActive 
                    ? "bg-blue-50/40 dark:bg-blue-900/20 border-blue-600" 
                    : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <div className="relative shrink-0">
                  <img
                    src={photoURL}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full border border-slate-100 dark:border-slate-700 object-cover"
                  />
                  {isGroup ? (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-blue-500 border border-white dark:border-slate-900 flex items-center justify-center">
                      <Users className="w-2 h-2 text-white" />
                    </div>
                  ) : (
                    <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-white dark:border-slate-900 ${contactIsOnline ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs truncate leading-tight ${isActive ? "font-bold text-slate-900 dark:text-white" : "font-semibold text-slate-700 dark:text-slate-300"}`}>
                      {displayName}
                    </span>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono shrink-0 ml-1">
                      {lastMsg?.timestamp ? formatTime(lastMsg.timestamp) : ""}
                    </span>
                  </div>

                  <p className={`text-[11px] truncate mt-1 ${isActive ? "text-slate-800 dark:text-slate-300" : "text-slate-500 dark:text-slate-400"}`}>
                    {lastMsg?.isSystem ? (
                      <span className="text-blue-600 dark:text-blue-400 italic font-mono text-[10px] font-semibold">{previewText}</span>
                    ) : (
                      <span>{previewText}</span>
                    )}
                  </p>

                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 truncate max-w-[120px]">
                      {emailText}
                    </span>
                    <span className="text-[8px] bg-slate-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-mono px-1 rounded border border-blue-100 dark:border-blue-900 py-0.5 flex items-center gap-0.5 scale-90 origin-right font-bold">
                      <ShieldCheck className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      E2EE
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="p-3 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500 font-mono flex items-center justify-between gap-1 transition-colors duration-300">
        <div className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
          <span>{t("keys_hosted_locally")}</span>
        </div>
        <div className="flex items-center gap-1">
          <SettingsToggle currentUser={currentUser} />
          <button
            onClick={onLogout}
            title="Logout"
            className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition text-slate-400 hover:text-rose-500"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Create Group Dialog */}
      <CreateGroupDialog
        isOpen={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        availableContacts={availableContacts}
        onCreateGroup={async (name, members) => {
          await onStartNewGroupChat(name, members);
        }}
      />
    </div>
  );
}
