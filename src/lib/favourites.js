import { supabase } from './supabase'

// Returns a Set of favourited item ids for the user (ids are unique uuids
// across recipes & guides, so a flat Set is enough for lookups).
export async function loadFavourites(userId) {
  if (!userId) return new Set();
  const { data } = await supabase.from('favourites').select('item_id').eq('user_id', userId);
  return new Set((data || []).map(r => r.item_id));
}

export async function setFavourite(userId, itemType, itemId, makeFav) {
  if (!userId) return;
  if (makeFav) {
    await supabase.from('favourites').insert({ user_id: userId, item_type: itemType, item_id: itemId });
  } else {
    await supabase.from('favourites').delete().eq('user_id', userId).eq('item_id', itemId);
  }
}
