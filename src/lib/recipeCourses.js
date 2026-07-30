// Recipe library filter.
//
// Recipes are tagged with a meal type (BREAKFAST / LUNCH / DINNER /
// POST-WORKOUT / SNACK / DESSERT), which is the right granularity when writing
// one but too many buttons when browsing. Courses group those tags into the
// four things a client actually goes looking for.
//
// LUNCH and DINNER both land in Mains - nobody browsing at 6pm wants a recipe
// hidden because it was written as a lunch. POST-WORKOUT sits with Snacks,
// which is where shakes and bars belong.

export const COURSES = [
  { id: 'all',       label: 'All',       icon: 'Recipe',      tags: null },
  { id: 'breakfast', label: 'Breakfast', icon: 'Fried Egg',   tags: ['BREAKFAST'] },
  { id: 'mains',     label: 'Mains',     icon: 'Dinner Plate',tags: ['LUNCH', 'DINNER'] },
  { id: 'snacks',    label: 'Snacks',    icon: 'Protein Bar', tags: ['SNACK', 'POST-WORKOUT'] },
  { id: 'desserts',  label: 'Desserts',  icon: 'Cookie',      tags: ['DESSERT'] },
];

const TAG_TO_COURSE = (() => {
  const m = {};
  COURSES.forEach(c => (c.tags || []).forEach(t => { m[t] = c.id; }));
  return m;
})();

export const courseOf = (recipe) => TAG_TO_COURSE[(recipe?.tag || '').toUpperCase()] || 'mains';

export function filterByCourse(list, courseId) {
  if (!courseId || courseId === 'all') return list || [];
  return (list || []).filter(r => courseOf(r) === courseId);
}

// Counts per course, so a filter with nothing behind it can be dimmed rather
// than leading to an empty list.
export function courseCounts(list) {
  const counts = { all: (list || []).length };
  COURSES.forEach(c => { if (c.id !== 'all') counts[c.id] = 0; });
  (list || []).forEach(r => { const c = courseOf(r); counts[c] = (counts[c] || 0) + 1; });
  return counts;
}
