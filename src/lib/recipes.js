import { supabase } from './supabase'

// Per-serving calories derived from macros (4/4/9 kcal per gram).
export function kcalFromMacros({ protein, carbs, fats }) {
  return Math.round((+protein || 0) * 4 + (+carbs || 0) * 4 + (+fats || 0) * 9);
}

// Scale a base-servings quantity to the selected servings, rounded to a
// sensible precision: whole numbers for larger amounts, quarters for small.
export function scaleQty(qty, factor) {
  if (qty == null) return null;
  const v = qty * factor;
  if (v >= 10) return Math.round(v);
  return Math.round(v * 4) / 4;
}

// Pretty-print a quantity. Uses slash fractions ("1/2", "1 1/2") rather than
// the tiny unicode glyphs (½), which are hard to read at small sizes.
export function fmtQty(q) {
  if (q == null) return '';
  if (Number.isInteger(q)) return String(q);
  const whole = Math.floor(q);
  const frac = +(q - whole).toFixed(2);
  const fStr = frac === 0.5 ? '1/2' : frac === 0.25 ? '1/4' : frac === 0.75 ? '3/4'
    : frac === 0.33 || frac === 0.34 ? '1/3' : frac === 0.67 || frac === 0.66 ? '2/3' : null;
  if (fStr) return whole > 0 ? `${whole} ${fStr}` : fStr;
  return q.toFixed(2).replace(/\.?0+$/, '');
}

// Shape a DB row (with nested ingredients/steps) into the flat object the
// recipe cards and detail view already expect.
export function shapeRecipe(row) {
  return {
    id: row.id,
    trainerId: row.trainer_id,
    title: row.title,
    tag: row.tag,
    intro: row.intro || '',
    time: row.time_mins,
    img: row.img_url || 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=600&q=70',
    baseServings: row.base_servings || 1,
    kcal: Number(row.kcal) || 0,
    protein: Number(row.protein_g) || 0,
    carbs: Number(row.carbs_g) || 0,
    fats: Number(row.fats_g) || 0,
    ingredients: [...(row.recipe_ingredients || [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(i => ({ qty: i.qty == null ? null : Number(i.qty), unit: i.unit || '', name: i.name || '' })),
    steps: [...(row.recipe_steps || [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(s => s.body),
  };
}

export async function loadRecipes() {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_ingredients(*), recipe_steps(*)')
    .order('updated_at', { ascending: false });
  if (error) return [];
  return (data || []).map(shapeRecipe);
}

// Create or update a recipe plus its ingredients and steps. Ingredients/steps
// are replaced wholesale (delete + insert) to keep ordering simple.
export async function saveRecipe(trainerId, draft) {
  const payload = {
    trainer_id: trainerId,
    title: draft.title.trim(),
    tag: draft.tag,
    intro: draft.intro?.trim() || '',
    time_mins: parseInt(draft.time) || 0,
    img_url: draft.img?.trim() || '',
    base_servings: Math.max(1, parseInt(draft.baseServings) || 1),
    protein_g: +draft.protein || 0,
    carbs_g: +draft.carbs || 0,
    fats_g: +draft.fats || 0,
    kcal: kcalFromMacros(draft),
    updated_at: new Date().toISOString(),
  };

  // Strip intro and retry if the column isn't there yet (migration 048).
  const { intro, ...noIntro } = payload;
  let recipeId = draft.id;
  if (recipeId) {
    let { error } = await supabase.from('recipes').update(payload).eq('id', recipeId);
    if (error) ({ error } = await supabase.from('recipes').update(noIntro).eq('id', recipeId));
    if (error) return { error };
  } else {
    let { data, error } = await supabase.from('recipes').insert(payload).select('id').single();
    if (error) ({ data, error } = await supabase.from('recipes').insert(noIntro).select('id').single());
    if (error || !data) return { error: error || new Error('Insert failed') };
    recipeId = data.id;
  }

  // Replace ingredients
  await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
  const ingRows = (draft.ingredients || [])
    .filter(i => i.name.trim() !== '')
    .map((i, idx) => ({
      recipe_id: recipeId,
      sort_order: idx,
      qty: i.qty === '' || i.qty == null ? null : (parseFloat(i.qty) || null),
      unit: i.unit?.trim() || '',
      name: i.name.trim(),
    }));
  if (ingRows.length) await supabase.from('recipe_ingredients').insert(ingRows);

  // Replace steps
  await supabase.from('recipe_steps').delete().eq('recipe_id', recipeId);
  const stepRows = (draft.steps || [])
    .filter(s => s.trim() !== '')
    .map((s, idx) => ({ recipe_id: recipeId, sort_order: idx, body: s.trim() }));
  if (stepRows.length) await supabase.from('recipe_steps').insert(stepRows);

  return { id: recipeId };
}

export async function deleteRecipe(recipeId) {
  await supabase.from('recipes').delete().eq('id', recipeId);
}
