import React, { useState } from "react";
import { X, Users, Check, Search } from "lucide-react";
import { AppUser } from "../types";
import { useTranslation } from "react-i18next";

interface CreateGroupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  availableContacts: AppUser[];
  onCreateGroup: (name: string, selectedUsers: AppUser[]) => Promise<void>;
}

export default function CreateGroupDialog({ isOpen, onClose, availableContacts, onCreateGroup }: CreateGroupDialogProps) {
  const { t } = useTranslation();
  const [groupName, setGroupName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const toggleUserSelection = (userId: string) => {
    const newSelection = new Set(selectedUserIds);
    if (newSelection.has(userId)) {
      newSelection.delete(userId);
    } else {
      newSelection.add(userId);
    }
    setSelectedUserIds(newSelection);
  };

  const handleCreate = async () => {
    if (!groupName.trim() || selectedUserIds.size === 0) return;
    
    setIsCreating(true);
    const selectedUsers = availableContacts.filter(u => selectedUserIds.has(u.uid));
    
    try {
      await onCreateGroup(groupName.trim(), selectedUsers);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreating(false);
    }
  };

  const filteredContacts = availableContacts.filter(c => 
    c.displayName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 font-sans">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden transition-colors duration-300">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Users className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">{t("create_new_group", "Create New Group")}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[60vh]">
          {/* Group Name Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
              {t("group_name", "Group Name")}
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={t("group_name_placeholder", "e.g. Project Alpha")}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          {/* Contacts Search */}
          <div className="mt-2">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
              {t("select_participants", "Select Participants")} ({selectedUserIds.size})
            </label>
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("search_contacts", "Search contacts...")}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>

            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {filteredContacts.length === 0 ? (
                <div className="text-center text-xs text-slate-500 py-4">
                  {t("no_contacts_found", "No contacts found")}
                </div>
              ) : (
                filteredContacts.map(contact => {
                  const isSelected = selectedUserIds.has(contact.uid);
                  return (
                    <div
                      key={contact.uid}
                      onClick={() => toggleUserSelection(contact.uid)}
                      className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition ${
                        isSelected 
                          ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50" 
                          : "hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <img src={contact.photoURL} alt="" className="w-8 h-8 rounded-full bg-slate-200" />
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                            {contact.displayName}
                          </span>
                          <span className="text-[10px] text-slate-500">{contact.email}</span>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                        isSelected ? "bg-blue-600 text-white" : "border-2 border-slate-300 dark:border-slate-600"
                      }`}>
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
          >
            {t("cancel", "Cancel")}
          </button>
          <button
            onClick={handleCreate}
            disabled={!groupName.trim() || selectedUserIds.size === 0 || isCreating}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
          >
            {isCreating && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {t("create", "Create")}
          </button>
        </div>

      </div>
    </div>
  );
}
