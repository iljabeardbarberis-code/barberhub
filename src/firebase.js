// src/firebase.js — Firebase configuration & helpers
import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDW8eSrkC1Qsk6-NXS3eYWjrBR4RFKvPVc",
  authDomain: "barber-hub-6c69d.firebaseapp.com",
  projectId: "barber-hub-6c69d",
  storageBucket: "barber-hub-6c69d.firebasestorage.app",
  messagingSenderId: "640750699309",
  appId: "1:640750699309:web:4b735bb959ecb8d10349a4",
  measurementId: "G-303VW9TLKR"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ── AUTH HELPERS ──────────────────────────────────────────────────────────────

export const registerClient = async (name, email, phone, password) => {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await setDoc(doc(db, "users", cred.user.uid), {
    name, email, phone, role: "client", sub: null,
    createdAt: serverTimestamp(),
  });
  return cred.user;
};

export const loginUser = async (email, password) => {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
};

export const logoutUser = () => signOut(auth);

export const onAuthChange = (callback) => onAuthStateChanged(auth, callback);

// ── FIRESTORE HELPERS ─────────────────────────────────────────────────────────

// Users
export const getUser = async (uid) => {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const updateUser = async (uid, data) => {
  await updateDoc(doc(db, "users", uid), data);
};

// Masters (managed by owner)
export const getMasters = async () => {
  const snap = await getDocs(collection(db, "masters"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const subscribeMasters = (callback) =>
  onSnapshot(collection(db, "masters"), snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );

export const createMaster = async (data) => {
  // Create Firebase Auth account for master
  const cred = await createUserWithEmailAndPassword(auth, data.email, data.password);
  await updateProfile(cred.user, { displayName: data.firstName });
  const masterDoc = {
    ...data,
    uid: cred.user.uid,
    role: "master",
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(db, "masters", cred.user.uid), masterDoc);
  // Also save to users collection with role=master
  await setDoc(doc(db, "users", cred.user.uid), {
    name: data.firstName, email: data.email, role: "master",
    createdAt: serverTimestamp(),
  });
  return { id: cred.user.uid, ...masterDoc };
};

export const updateMaster = async (id, data) => {
  await updateDoc(doc(db, "masters", id), data);
};

export const deleteMaster = async (id) => {
  await deleteDoc(doc(db, "masters", id));
};

// Bookings
export const subscribeBookings = (callback) =>
  onSnapshot(
    query(collection(db, "bookings"), orderBy("date"), orderBy("time")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );

export const createBooking = async (data) => {
  const ref = await addDoc(collection(db, "bookings"), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

export const updateBooking = async (id, data) => {
  await updateDoc(doc(db, "bookings", id), data);
};

export const deleteBooking = async (id) => {
  await deleteDoc(doc(db, "bookings", id));
};

// Reviews
export const subscribeReviews = (callback) =>
  onSnapshot(collection(db, "reviews"), snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );

export const createReview = async (data) => {
  await addDoc(collection(db, "reviews"), {
    ...data,
    createdAt: serverTimestamp(),
  });
};

export const deleteReview = async (id) => {
  await deleteDoc(doc(db, "reviews", id));
};

// Subscriptions (subs config)
export const getSubs = async () => {
  const snap = await getDoc(doc(db, "config", "subs"));
  return snap.exists() ? snap.data().list : null;
};

export const saveSubs = async (list) => {
  await setDoc(doc(db, "config", "subs"), { list });
};

// Salon schedule
export const getSalonSchedule = async () => {
  const snap = await getDoc(doc(db, "config", "salonSchedule"));
  return snap.exists() ? snap.data() : null;
};

export const saveSalonSchedule = async (data) => {
  await setDoc(doc(db, "config", "salonSchedule"), data);
};

// Schedule blocks
export const subscribeBlocks = (callback) =>
  onSnapshot(collection(db, "blocks"), snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );

export const createBlock = async (data) => {
  const ref = await addDoc(collection(db, "blocks"), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

export const deleteBlock = async (id) => {
  await deleteDoc(doc(db, "blocks", id));
};

// Notifications
export const subscribeNotifications = (uid, callback) =>
  onSnapshot(
    query(collection(db, "notifications"),
      where("targetUid", "in", [uid, "owner"]),
      orderBy("createdAt", "desc")
    ),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );

export const createNotification = async (data) => {
  await addDoc(collection(db, "notifications"), {
    ...data,
    read: false,
    createdAt: serverTimestamp(),
  });
};

export const markNotificationRead = async (id) => {
  await updateDoc(doc(db, "notifications", id), { read: true });
};
