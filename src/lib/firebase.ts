/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  User
} from "firebase/auth";
import { getFirestore, doc, updateDoc, arrayUnion } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, getToken, onMessage, MessagePayload } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID
};

// Initialize Firebase Application
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Firestore Database (using the custom database ID from config if specified)
export const db = firebaseConfig.firestoreDatabaseId 
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Initialize Cloud Storage
export const storage = getStorage(app);

// Initialize Firebase Messaging (only in browser context where SW is supported)
let messagingInstance: ReturnType<typeof getMessaging> | null = null;
try {
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    messagingInstance = getMessaging(app);
  }
} catch (e) {
  console.warn("[FCM] Messaging init failed:", e);
}
export const messaging = messagingInstance;

/**
 * Requests notification permission, gets FCM token, and saves it to Firestore.
 * Stores multiple tokens per user (one per device/browser).
 */
export const registerFCMToken = async (userId: string): Promise<void> => {
  if (!messaging) return;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("[FCM] Notification permission denied.");
      return;
    }

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    
    const swUrl = `/firebase-messaging-sw.js?apiKey=${firebaseConfig.apiKey}&authDomain=${firebaseConfig.authDomain}&projectId=${firebaseConfig.projectId}&storageBucket=${firebaseConfig.storageBucket}&messagingSenderId=${firebaseConfig.messagingSenderId}&appId=${firebaseConfig.appId}`;
    const registration = await navigator.serviceWorker.register(swUrl);
    
    const token = await getToken(messaging, { 
      vapidKey,
      serviceWorkerRegistration: registration
    });

    if (token) {
      console.log("[FCM] Token obtained:", token.slice(0, 20) + "...");
      // Store token in Firestore as an array (supports multiple devices)
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        fcmTokens: arrayUnion(token)
      });
      // Also persist locally so we know which token is ours
      localStorage.setItem(`fcm_token_${userId}`, token);
      console.log("[FCM] Token registered in Firestore.");
    }
  } catch (err) {
    console.warn("[FCM] Failed to get/register token:", err);
  }
};

/**
 * Listen for foreground messages (app is open/focused).
 * Returns unsubscribe function.
 */
export const onForegroundMessage = (callback: (payload: MessagePayload) => void) => {
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
};

// Authentication helper methods
export const signInWithGoogle = async () => {
  return await signInWithPopup(auth, googleProvider);
};

export const logoutUser = async () => {
  return await signOut(auth);
};

export { onAuthStateChanged, getRedirectResult };
export type { User };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
