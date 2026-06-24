/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EncryptedPayload } from "./lib/crypto";

export interface AppUser {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  publicKeyJWK: JsonWebKey | null; // Null if they haven't set up their keys yet
  lastSeen?: any; // Timestamp or date
  isOnline?: boolean;
}

export interface Chat {
  id: string;
  participants: string[];
  participantDetails: { [uid: string]: AppUserSummary };
  lastMessage?: ChatLastMessage;
  updatedAt: any;
  isGroup?: boolean;
  groupName?: string;
  admins?: string[]; // Array of admin user IDs
  deletedFor?: string[]; // Array of user IDs who deleted this chat
}

export interface CallSignal {
  id: string;
  callerId: string;
  calleeId: string;
  callerName: string;
  type: 'audio' | 'video';
  status: 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'rejected' | 'missed';
  timestamp: number;
  offer?: any;
  answer?: any;
}

export interface AppUserSummary {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  publicKeyJWK: JsonWebKey | null;
  lastSeen?: any;
  isOnline?: boolean;
}

export interface ChatLastMessage {
  textPreview: string; // "🔒 Encrypted message" or system message
  senderId: string;
  timestamp: any;
  isSystem?: boolean;
}

export interface Message {
  id: string;
  senderId: string;
  timestamp: any;
  isSystem?: boolean;
  systemText?: string;
  systemAction?: string;
  callType?: string;
  callDuration?: number;
  
  // Encrypted content fields (from EncryptedPayload)
  encryptedText?: string;
  iv?: string;
  encryptedKeys?: { [userId: string]: string };
  
  // Optional secure attachments
  attachment?: {
    name: string;
    type: string;
    size: number;
    url?: string; // Firebase storage download URL
    iv?: string; // AES-GCM IV for the file
    encryptedKeys?: { [userId: string]: string }; // RSA-encrypted AES keys
  };
  // Deletion and Reactions
  deletedFor?: string[]; // Array of user IDs who deleted this message locally
  isDeletedForEveryone?: boolean; // True if the message was deleted for everyone
  reactions?: { [emoji: string]: string[] }; // Map of emoji to array of user IDs
  
  // Read Receipts
  readBy?: string[]; // Array of user IDs who have read the message
}
