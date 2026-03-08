// Firebase configuration — Emily will fill these in after creating a Firebase project
const firebaseConfig = {
  apiKey: "AIzaSyBt62Xdiyzixn9hBZ1yq60IrgLcW6lSq1E",
  authDomain: "familymeals-7723b.firebaseapp.com",
  projectId: "familymeals-7723b",
  storageBucket: "familymeals-7723b.firebasestorage.app",
  messagingSenderId: "521379026144",
  appId: "1:521379026144:web:a00daf934f679ac8452c85"
};

let db = null;
let firebaseEnabled = false;

export function initFirebase() {
  try {
    if (firebaseConfig.apiKey === "YOUR_API_KEY") {
      console.log("Firebase not configured — running in local-only mode.");
      return;
    }
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    firebaseEnabled = true;
    console.log("Firebase connected.");
  } catch (e) {
    console.warn("Firebase init failed, running local-only:", e);
  }
}

export function isFirebaseEnabled() {
  return firebaseEnabled;
}

export function getDb() {
  return db;
}

// === Preferences ===

export async function savePreference(recipeUid, memberName, rating, flags) {
  if (!firebaseEnabled) {
    // Fallback to localStorage
    const key = `pref_${recipeUid}_${memberName}`;
    localStorage.setItem(key, JSON.stringify({ rating, flags, updated: Date.now() }));
    return;
  }
  const docId = `${recipeUid}_${memberName}`;
  await db.collection("preferences").doc(docId).set({
    recipeUid, memberName, rating, flags, updated: Date.now()
  });
}

export async function loadAllPreferences() {
  if (!firebaseEnabled) {
    const prefs = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith("pref_")) {
        prefs[key.slice(5)] = JSON.parse(localStorage.getItem(key));
      }
    }
    return prefs;
  }
  const snapshot = await db.collection("preferences").get();
  const prefs = {};
  snapshot.forEach(doc => {
    const d = doc.data();
    prefs[doc.id] = d;
  });
  return prefs;
}

// === Weekly Plans ===

export async function savePlan(weekKey, plan) {
  if (!firebaseEnabled) {
    localStorage.setItem(`plan_${weekKey}`, JSON.stringify(plan));
    return;
  }
  await db.collection("weeklyPlans").doc(weekKey).set(plan);
}

export async function loadPlan(weekKey) {
  if (!firebaseEnabled) {
    const data = localStorage.getItem(`plan_${weekKey}`);
    return data ? JSON.parse(data) : null;
  }
  const doc = await db.collection("weeklyPlans").doc(weekKey).get();
  return doc.exists ? doc.data() : null;
}

// === Comments ===

export async function addComment(weekKey, memberName, text) {
  const comment = { memberName, text, timestamp: Date.now() };
  if (!firebaseEnabled) {
    const key = `comments_${weekKey}`;
    const comments = JSON.parse(localStorage.getItem(key) || "[]");
    comments.push(comment);
    localStorage.setItem(key, JSON.stringify(comments));
    return;
  }
  await db.collection("comments").add({ weekKey, ...comment });
}

export async function loadComments(weekKey) {
  if (!firebaseEnabled) {
    return JSON.parse(localStorage.getItem(`comments_${weekKey}`) || "[]");
  }
  const snapshot = await db.collection("comments")
    .where("weekKey", "==", weekKey)
    .get();
  const comments = [];
  snapshot.forEach(doc => comments.push(doc.data()));
  comments.sort((a, b) => a.timestamp - b.timestamp);
  return comments;
}

// === Recipes (for additions/deletions) ===

export async function saveRecipeToFirebase(recipe) {
  if (!firebaseEnabled) {
    const custom = JSON.parse(localStorage.getItem("custom_recipes") || "[]");
    custom.push(recipe);
    localStorage.setItem("custom_recipes", JSON.stringify(custom));
    return;
  }
  await db.collection("recipes").doc(recipe.uid).set(recipe);
}

export async function archiveRecipe(uid) {
  if (!firebaseEnabled) {
    const archived = JSON.parse(localStorage.getItem("archived_recipes") || "[]");
    archived.push(uid);
    localStorage.setItem("archived_recipes", JSON.stringify(archived));
    return;
  }
  await db.collection("recipes").doc(uid).update({ archived: true });
}

export function getArchivedRecipes() {
  if (!firebaseEnabled) {
    return JSON.parse(localStorage.getItem("archived_recipes") || "[]");
  }
  return []; // handled by Firestore query filter
}

export function getCustomRecipes() {
  if (!firebaseEnabled) {
    return JSON.parse(localStorage.getItem("custom_recipes") || "[]");
  }
  return [];
}

// === Experiment Evaluations ===

export async function saveExperimentEval(uid, result, ingredients, directions) {
  const data = { uid, result, ingredients: ingredients || '', directions: directions || '', evaluated: Date.now() };
  if (!firebaseEnabled) {
    const evals = JSON.parse(localStorage.getItem("experiment_evals") || "{}");
    evals[uid] = data;
    localStorage.setItem("experiment_evals", JSON.stringify(evals));
    return;
  }
  await db.collection("experimentEvals").doc(uid).set(data);
}

export async function loadExperimentEvals() {
  if (!firebaseEnabled) {
    return JSON.parse(localStorage.getItem("experiment_evals") || "{}");
  }
  const snapshot = await db.collection("experimentEvals").get();
  const evals = {};
  snapshot.forEach(doc => { evals[doc.id] = doc.data(); });
  return evals;
}

// === Members ===

const DEFAULT_MEMBERS = ["Emily", "Jesse", "Penelope", "Finn", "Clare"];

export function getMembers() {
  const saved = localStorage.getItem("family_members");
  return saved ? JSON.parse(saved) : DEFAULT_MEMBERS;
}

export function setMembers(members) {
  localStorage.setItem("family_members", JSON.stringify(members));
}
