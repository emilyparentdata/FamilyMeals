import { initFirebase, getMembers, saveRecipeToFirebase, archiveRecipe, loadPlan, commitPlan, loadCommittedPlan } from './firebase.js';
import { loadRecipes, getRecipes, renderRecipeList, renderRecipeDetail, filterRecipes } from './recipes.js';
import { initPreferences, renderPreferenceList, getAllPreferences, toggleFavorite } from './preferences.js';
import { renderPlanner, suggestAllMeals, shiftWeek, getWeekLabel, getWeekKey } from './planner.js';
import { renderPlanView, handleAddComment } from './plan-view.js';
import { renderGroceryList, getGroceryText } from './grocery.js';
import { sendPlanEmail, isEmailConfigured } from './email.js';
import { renderExperimentsPage } from './experiments.js';

// === State ===
let currentMember = '';
let members = [];

// === Init ===
async function init() {
  initFirebase();
  await loadRecipes();
  await initPreferences();

  members = getMembers();
  populateMemberPicker();
  setupNavigation();
  setupRecipesPage();
  setupPreferencesPage();
  setupPlannerPage();
  setupPlanViewPage();
  setupGroceryPage();
  setupManagePage();

  setupHomePage();

  // Show home by default
  showPage('home');
}

// === Navigation ===
function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });
  document.getElementById('home-link').addEventListener('click', () => showPage('home'));
}

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.classList.add('hidden');
  });
  const page = document.getElementById(`page-${pageId}`);
  if (page) {
    page.classList.remove('hidden');
    page.classList.add('active');
  }
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === pageId);
  });

  // Refresh page content on show
  if (pageId === 'recipes') refreshRecipes();
  if (pageId === 'preferences') refreshPreferences();
  if (pageId === 'planner') refreshPlanner();
  if (pageId === 'plan-view') refreshPlanView();
  if (pageId === 'grocery') refreshGrocery();
  if (pageId === 'experiments') refreshExperiments();
  if (pageId === 'manage') refreshManageRecipeList();
}

// === Member Picker ===
function populateMemberPicker() {
  const select = document.getElementById('current-member');
  select.innerHTML = '<option value="">Select...</option>';
  for (const m of members) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => {
    currentMember = select.value;
    // Refresh current page to reflect member selection
    if (document.getElementById('page-preferences').classList.contains('active')) {
      refreshPreferences();
    }
    if (document.getElementById('page-recipes').classList.contains('active')) {
      refreshRecipes();
    }
  });
}

// === Home Page ===
function setupHomePage() {
  document.querySelectorAll('.home-card').forEach(card => {
    card.addEventListener('click', () => showPage(card.dataset.page));
  });
}

// === Recipes Page ===
function setupRecipesPage() {
  const search = document.getElementById('recipe-search');
  search.addEventListener('input', () => refreshRecipes());

  document.querySelector('.modal-close').addEventListener('click', () => {
    document.getElementById('recipe-modal').classList.add('hidden');
  });
  document.getElementById('recipe-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });
}

function refreshRecipes() {
  const query = document.getElementById('recipe-search').value;
  const recipes = filterRecipes(query);
  const prefs = getAllPreferences();
  renderRecipeList(document.getElementById('recipe-list'), recipes, (recipe) => {
    renderRecipeDetail(document.getElementById('recipe-detail'), recipe);
    document.getElementById('recipe-modal').classList.remove('hidden');
  }, prefs, {
    currentMember,
    onToggleFavorite: async (recipeUid) => {
      if (!currentMember) return false;
      return await toggleFavorite(recipeUid, currentMember);
    }
  });
}

// === Preferences Page ===
function setupPreferencesPage() {
  document.getElementById('pref-search').addEventListener('input', () => refreshPreferences());
  document.getElementById('pref-filter-unrated').addEventListener('change', () => refreshPreferences());
}

function refreshPreferences() {
  const query = document.getElementById('pref-search').value;
  const unratedOnly = document.getElementById('pref-filter-unrated').checked;
  renderPreferenceList(
    document.getElementById('pref-list'),
    getRecipes(),
    currentMember,
    query,
    unratedOnly
  );
}

// === Planner Page ===
function setupPlannerPage() {
  document.getElementById('prev-week').addEventListener('click', () => {
    shiftWeek(-1);
    refreshPlanner();
  });
  document.getElementById('next-week').addEventListener('click', () => {
    shiftWeek(1);
    refreshPlanner();
  });
  document.getElementById('suggest-all-btn').addEventListener('click', async () => {
    await suggestAllMeals(document.getElementById('planner-grid'), members);
    refreshPlanner();
    showToast('Menu suggested! Avoids repeated proteins and recent meals.');
  });
  document.getElementById('clear-all-btn').addEventListener('click', async () => {
    const { savePlan: sp, loadPlan: lp } = await import('./firebase.js');
    const { getWeekKey: gk } = await import('./planner.js');
    const weekKey = gk();
    const plan = await lp(weekKey) || { days: {} };
    for (const day of Object.keys(plan.days)) {
      if (plan.days[day]) plan.days[day].recipeUid = '';
    }
    plan.updated = Date.now();
    await sp(weekKey, plan);
    refreshPlanner();
    showToast('All meals cleared.');
  });
  document.getElementById('commit-plan-btn').addEventListener('click', async () => {
    const weekKey = getWeekKey();
    const plan = await loadPlan(weekKey);
    if (!plan || !plan.days) {
      showToast('Nothing to commit — plan the week first.');
      return;
    }
    await commitPlan(weekKey, plan);
    updateCommitStatus(weekKey);
    showToast('Plan committed! It\'s now visible on "This Week\'s Plan".');
  });
}

async function updateCommitStatus(weekKey) {
  const el = document.getElementById('commit-status');
  const committed = await loadCommittedPlan(weekKey);
  if (committed?.committedAt) {
    el.textContent = `Last committed: ${new Date(committed.committedAt).toLocaleString()}`;
  } else {
    el.textContent = 'Not yet committed — "This Week" won\'t show this plan until you commit.';
  }
}

function refreshPlanner() {
  const weekKey = getWeekKey();
  document.getElementById('week-label').textContent = getWeekLabel();
  renderPlanner(document.getElementById('planner-grid'), members);
  updateCommitStatus(weekKey);
}

// === Plan View Page ===
let viewWeekOffset = 0;

function getViewWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff + viewWeekOffset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getViewWeekKey() {
  return getViewWeekStart().toISOString().slice(0, 10);
}

function getViewWeekLabel() {
  const d = getViewWeekStart();
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const fmt = d2 => d2.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(d)} - ${fmt(end)}`;
}

function setupPlanViewPage() {
  document.getElementById('view-prev-week').addEventListener('click', () => {
    viewWeekOffset--;
    refreshPlanView();
  });
  document.getElementById('view-next-week').addEventListener('click', () => {
    viewWeekOffset++;
    refreshPlanView();
  });
  document.getElementById('add-comment-btn').addEventListener('click', async () => {
    const text = document.getElementById('comment-text').value;
    if (!currentMember) {
      showToast('Please select your name first.');
      return;
    }
    await handleAddComment(
      getViewWeekKey(),
      currentMember,
      text,
      document.getElementById('comments-list')
    );
    document.getElementById('comment-text').value = '';
    showToast('Comment added!');
  });
}

function refreshPlanView() {
  renderPlanView(
    document.getElementById('plan-view-grid'),
    document.getElementById('comments-list'),
    document.getElementById('view-week-label'),
    getViewWeekKey(),
    getViewWeekLabel()
  );
}

// === Grocery Page ===
function setupGroceryPage() {
  document.getElementById('grocery-prev-week').addEventListener('click', () => {
    shiftWeek(-1);
    refreshGrocery();
  });
  document.getElementById('grocery-next-week').addEventListener('click', () => {
    shiftWeek(1);
    refreshGrocery();
  });

  document.getElementById('copy-grocery-btn').addEventListener('click', async () => {
    const text = getGroceryText();
    if (!text) {
      showToast('Nothing to copy.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast('Grocery list copied to clipboard!');
    } catch {
      showToast('Could not copy — try selecting and copying manually.');
    }
  });

  document.getElementById('email-plan-btn').addEventListener('click', async () => {
    try {
      const result = await sendPlanEmail();
      if (result.fallback) {
        showToast('Plan + grocery list copied to clipboard! (Email not configured yet)');
      } else {
        showToast('Email sent!');
      }
    } catch (e) {
      showToast(e.message || 'Failed to send email.');
    }
  });
}

function refreshGrocery() {
  document.getElementById('grocery-week-label').textContent = getWeekLabel();
  renderGroceryList(
    document.getElementById('grocery-list'),
    document.getElementById('grocery-week-label')
  );
}

// === Experiments Page ===
function refreshExperiments() {
  renderExperimentsPage(document.getElementById('experiments-list'));
}

// === Manage Page ===
function setupManagePage() {
  document.getElementById('save-recipe-btn').addEventListener('click', async () => {
    const name = document.getElementById('new-recipe-name').value.trim();
    if (!name) {
      showToast('Recipe name is required.');
      return;
    }

    const recipe = {
      uid: 'custom_' + Date.now(),
      name,
      ingredients: document.getElementById('new-recipe-ingredients').value,
      directions: document.getElementById('new-recipe-directions').value,
      servings: document.getElementById('new-recipe-servings').value,
      prep_time: document.getElementById('new-recipe-prep').value,
      cook_time: document.getElementById('new-recipe-cook').value,
      total_time: '',
      categories: document.getElementById('new-recipe-categories').value
        .split(',').map(s => s.trim()).filter(Boolean),
      source: document.getElementById('new-recipe-source').value,
      source_url: '',
      description: '',
      notes: document.getElementById('new-recipe-notes').value,
      rating: 0,
      image_url: '',
    };

    await saveRecipeToFirebase(recipe);
    await loadRecipes();
    refreshManageRecipeList();
    showToast(`"${name}" saved!`);

    // Clear form
    document.getElementById('new-recipe-name').value = '';
    document.getElementById('new-recipe-ingredients').value = '';
    document.getElementById('new-recipe-directions').value = '';
    document.getElementById('new-recipe-servings').value = '';
    document.getElementById('new-recipe-prep').value = '';
    document.getElementById('new-recipe-cook').value = '';
    document.getElementById('new-recipe-categories').value = '';
    document.getElementById('new-recipe-source').value = '';
    document.getElementById('new-recipe-notes').value = '';
  });

  document.getElementById('manage-search').addEventListener('input', () => refreshManageRecipeList());
}

function refreshManageRecipeList() {
  const container = document.getElementById('manage-recipe-list');
  const query = document.getElementById('manage-search').value.toLowerCase().trim();
  let recipes = getRecipes();
  if (query) {
    recipes = recipes.filter(r =>
      r.name.toLowerCase().includes(query) ||
      (r.categories || []).some(c => c.toLowerCase().includes(query))
    );
  }

  container.innerHTML = '';
  for (const r of recipes) {
    const row = document.createElement('div');
    row.className = 'manage-recipe-row';
    row.innerHTML = `
      <span class="manage-recipe-name">${escManage(r.name)}</span>
      <span class="manage-recipe-cats">${(r.categories || []).join(', ')}</span>
      <button class="btn delete-btn">Delete</button>
    `;
    row.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm(`Delete "${r.name}"? This can't be undone.`)) return;
      await archiveRecipe(r.uid);
      await loadRecipes();
      refreshManageRecipeList();
      showToast(`"${r.name}" deleted.`);
    });
    container.appendChild(row);
  }
}

function escManage(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// === Toast ===
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

// === Start ===
init().catch(err => {
  console.error('Init failed:', err);
  document.body.innerHTML = `<p style="padding:2rem;color:red;">Failed to load: ${err.message}</p>`;
});
