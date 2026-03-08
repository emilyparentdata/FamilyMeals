import { loadCommittedPlan } from './firebase.js';
import { getRecipeByUid } from './recipes.js';
import { getWeekKey, getWeekLabel } from './planner.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export async function renderGroceryList(container, weekLabelEl) {
  const weekKey = getWeekKey();
  weekLabelEl.textContent = getWeekLabel();

  const plan = await loadCommittedPlan(weekKey);
  container.innerHTML = '';

  if (!plan || !plan.days) {
    container.innerHTML = '<p style="color:var(--text-light);">No plan for this week.</p>';
    return;
  }

  // Collect all recipes and sides for the week
  const recipes = [];
  const mealList = [];
  const allSides = [];
  for (const day of DAYS) {
    const dayData = plan.days[day];
    if (!dayData || dayData.skip) continue;
    if (dayData.recipeUid) {
      const recipe = getRecipeByUid(dayData.recipeUid);
      if (recipe) {
        recipes.push(recipe);
        const sides = dayData.sides || '';
        mealList.push({ day, name: recipe.name, sides });
      }
    }
    if (dayData.sides) {
      // Split sides by comma and collect
      dayData.sides.split(',').map(s => s.trim()).filter(Boolean).forEach(s => allSides.push(s));
    }
  }

  if (!recipes.length && !allSides.length) {
    container.innerHTML = '<p style="color:var(--text-light);">No meals planned this week.</p>';
    return;
  }

  // Parse and combine ingredients
  const ingredients = combineIngredients(recipes, allSides);

  let html = '<ul>';
  for (const item of ingredients) {
    html += `<li><label><input type="checkbox"> ${escHtml(item)}</label></li>`;
  }
  html += '</ul>';

  container.innerHTML = html;

  // Store for copy/email
  container.dataset.mealList = JSON.stringify(mealList.map(m => ({ day: m.day, name: m.name, sides: m.sides || '' })));
  container.dataset.ingredients = JSON.stringify(ingredients);
}

function combineIngredients(recipes, sides) {
  const allLines = [];

  for (const recipe of recipes) {
    if (!recipe.ingredients) continue;
    const lines = recipe.ingredients.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      allLines.push(line);
    }
  }

  // Add sides as grocery items
  for (const side of sides) {
    allLines.push(side);
  }

  // Simple deduplication: normalize and group similar items
  const seen = new Map();
  for (const line of allLines) {
    const normalized = line.toLowerCase().replace(/[^\w\s]/g, '').trim();
    if (!seen.has(normalized)) {
      seen.set(normalized, line);
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

export function getGroceryText() {
  const container = document.getElementById('grocery-list');
  const ingredients = JSON.parse(container.dataset.ingredients || '[]');
  return ingredients.join('\n');
}

export function getPlanSummary() {
  const container = document.getElementById('grocery-list');
  const meals = JSON.parse(container.dataset.mealList || '[]');
  return meals.map(m => {
    let line = `${m.day}: ${m.name}`;
    if (m.sides) line += ` + ${m.sides}`;
    return line;
  }).join('\n');
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
