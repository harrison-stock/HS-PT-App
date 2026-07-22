import React from 'react'
import { supabase } from '../lib/supabase'
import { loadRecipes, scaleQty, fmtQty } from '../lib/recipes'
import { loadGuides } from '../lib/guides'
import { loadFavourites, setFavourite } from '../lib/favourites'
import { RecipeBuilder } from './RecipeBuilder'
import { GuideBuilder } from './GuideBuilder'
import { loadExercises, videoThumb, ALL_MUSCLES } from '../lib/exercises'
import { exerciseMatches } from '../lib/exerciseSearch'
import { HEX_RATIO, HEX_PATH, HexShape, Hex, HexBackButton } from '../components/hex'
import { IconHeart, IconFlame, IconBolt, IconClock, IconChevronRight, IconPlus, IconCamera2, IconPlay, IconCheck, IconDumbbell } from '../components/icons'
import { SkeletonCard, EmptyState } from '../components/Loading'

const MUSCLE_LABEL = Object.fromEntries(ALL_MUSCLES.map(m => [m.key, m.label]));

// Resources - recipes & guides. Coaches build/edit both here.
export function Resources({ go, userId, isTrainer }) {
  const [tab, setTab] = React.useState('recipes');
  const [recipes, setRecipes] = React.useState(null);   // null = loading
  const [guides, setGuides] = React.useState(null);
  const [builderRecipe, setBuilderRecipe] = React.useState(undefined); // undefined=closed, null=new, obj=edit
  const [builderGuide, setBuilderGuide] = React.useState(undefined);
  const [query, setQuery] = React.useState('');
  const [openRecipe, setOpenRecipe] = React.useState(null);
  const [favs, setFavs] = React.useState(() => new Set());
  const [exercises, setExercises] = React.useState(null);   // glossary
  const [openExercise, setOpenExercise] = React.useState(null);
  const [vaultDocs, setVaultDocs] = React.useState(null);   // client's own documents

  const refreshRecipes = React.useCallback(() => { loadRecipes().then(setRecipes); }, []);
  const refreshGuides  = React.useCallback(() => { loadGuides().then(setGuides); }, []);
  React.useEffect(() => { refreshRecipes(); refreshGuides(); loadExercises().then(setExercises); }, [refreshRecipes, refreshGuides]);
  React.useEffect(() => { loadFavourites(userId).then(setFavs); }, [userId]);
  React.useEffect(() => {
    if (!userId) { setVaultDocs([]); return; }
    supabase.from('client_documents').select('*').eq('client_id', userId)
      .order('created_at', { ascending: false }).then(({ data }) => setVaultDocs(data || []));
  }, [userId]);

  const toggleFav = (id, type) => {
    const makeFav = !favs.has(id);
    setFavs((prev) => { const next = new Set(prev); makeFav ? next.add(id) : next.delete(id); return next; });
    setFavourite(userId, type, id, makeFav);
  };

  // Open a guide's asset directly (like the documents tab) - an attached PDF,
  // a linked video/article, or failing those the cover image itself.
  const FALLBACK_GUIDE_IMG = 'photo-1517836357463';
  const openGuide = (g) => {
    const realImg = g.img && !g.img.includes(FALLBACK_GUIDE_IMG) ? g.img : '';
    const url = g.file || g.video || g.link || realImg;
    if (url) window.open(url, '_blank', 'noopener');
  };

  const recipeList = recipes || [];
  const guideList  = guides || [];

  const sourceList = tab === 'guides' ? guideList :
  tab === 'favourites' ? recipeList.filter((r) => favs.has(r.id)) :
  recipeList;
  const filtered = sourceList.filter((x) => x.title.toLowerCase().includes(query.toLowerCase()));
  const recipesLoading = recipes === null;
  const guidesLoading  = guides === null;

  if (builderRecipe !== undefined) {
    return (
      <RecipeBuilder
        trainerId={userId}
        recipe={builderRecipe}
        onClose={() => setBuilderRecipe(undefined)}
        onSaved={() => { setBuilderRecipe(undefined); refreshRecipes(); }}
      />
    );
  }
  if (builderGuide !== undefined) {
    return (
      <GuideBuilder
        trainerId={userId}
        guide={builderGuide}
        onClose={() => setBuilderGuide(undefined)}
        onSaved={(keepOpen) => { refreshGuides(); if (!keepOpen) setBuilderGuide(undefined); }}
      />
    );
  }

  return (
    <div className="scroller" style={{ padding: '0 16px 28px', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 18px)', maxWidth: isTrainer ? 820 : undefined, margin: isTrainer ? '0 auto' : undefined, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
        <div>
          <div className="label">// LIBRARY</div>
          <div className="h-bold" style={{ fontSize: 24, marginTop: 4 }}>RESOURCES</div>
        </div>
        <button onClick={() => setTab(tab === 'favourites' ? 'recipes' : 'favourites')}
        aria-label="Favourites" style={{ all: 'unset', cursor: 'pointer', position: 'relative', display: 'grid', placeItems: 'center', width: 38 * HEX_RATIO, height: 38 }}>
          <HexShape size={38}
          fill={tab === 'favourites' ? 'var(--accent-soft)' : 'var(--bg-2)'}
          stroke={tab === 'favourites' ? 'var(--accent)' : 'var(--line-strong)'}
          strokeWidth={tab === 'favourites' ? 10 : 9}
          style={{ position: 'absolute', inset: 0,
            filter: tab === 'favourites' ? 'drop-shadow(0 0 calc(8px * var(--glow)) var(--accent-glow))' : 'none' }} />
          <IconHeart size={15} fill={tab === 'favourites' ? 'currentColor' : 'none'}
          style={{ position: 'relative', color: tab === 'favourites' ? 'var(--accent)' : 'var(--text-2)' }} />
          {favs.size > 0 &&
          <span className="mono" style={{
            position: 'absolute', top: -3, right: -3, zIndex: 2,
            minWidth: 15, height: 15, padding: '0 3px', borderRadius: 999,
            background: 'var(--accent)', color: 'var(--on-accent)',
            fontSize: 8.5, fontWeight: 800, display: 'grid', placeItems: 'center',
            border: '1.5px solid var(--bg-1)'
          }}>{favs.size}</span>}
        </button>
      </div>

      {/* Search */}
      <div style={{
        display: tab === 'vault' ? 'none' : 'flex', alignItems: 'center', gap: 8,
        background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10,
        padding: '8px 12px', marginBottom: 14
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
        <input value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder={tab === 'exercises' ? 'Search exercises (try BB, DB)…' : `Search ${tab}...`}
        style={{
          flex: 1, background: 'transparent', border: 0, outline: 'none',
          color: 'var(--text)', fontFamily: 'JetBrains Mono', fontSize: 12, letterSpacing: '0.04em'
        }} />
      </div>

      {/* Tabs. The coach has a dedicated Exercises nav item and no client docs,
          so their library is just recipes + guides; clients get the full 2×2
          (recipes/guides on top, exercises/documents below). */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        <ResTab big active={tab === 'recipes' || tab === 'favourites'} onClick={() => setTab('recipes')} icon={<IconFork size={18} />} label={`RECIPES · ${recipesLoading ? '…' : recipeList.length}`} />
        <ResTab big active={tab === 'guides'} onClick={() => setTab('guides')} icon={<IconBolt size={18} />} label={`GUIDES · ${guidesLoading ? '…' : guideList.length}`} />
        {!isTrainer && (
          <ResTab big active={tab === 'exercises'} onClick={() => setTab('exercises')} icon={<IconDumbbell size={18} />} label={`EXERCISES · ${exercises === null ? '…' : exercises.length}`} />
        )}
        {!isTrainer && (
          <ResTab big active={tab === 'vault'} onClick={() => setTab('vault')} icon={<IconVaultDoc size={18} />} label={`DOCUMENTS · ${vaultDocs === null ? '…' : vaultDocs.length}`} />
        )}
      </div>

      {/* Coach: new recipe / guide */}
      {isTrainer && (tab === 'recipes' || tab === 'favourites') &&
      <button onClick={() => setBuilderRecipe(null)} className="btn-primary"
        style={{ width: '100%', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--heading-deep)' }}>
        <IconPlus size={14} /> NEW RECIPE
      </button>
      }
      {isTrainer && tab === 'guides' &&
      <button onClick={() => setBuilderGuide(null)} className="btn-primary"
        style={{ width: '100%', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--heading-deep)' }}>
        <IconPlus size={14} /> NEW GUIDE
      </button>
      }

      {tab === 'favourites' &&
      <div className="label" style={{ margin: '0 2px 10px', color: 'var(--accent)' }}>// FAVOURITES · {favs.size}</div>
      }

      {/* List */}
      {tab === 'recipes' && recipesLoading && <SkeletonCard rows={4} />}
      {tab === 'recipes' && !recipesLoading &&
      <div className="stagger-in" style={{ display: 'grid', gap: 10 }}>
          {filtered.map((r) => <RecipeCard key={r.id} r={r} onOpen={() => setOpenRecipe(r)} isFav={favs.has(r.id)} onToggleFav={() => toggleFav(r.id, 'recipe')} onEdit={isTrainer ? () => setBuilderRecipe(r) : null} />)}
          {recipeList.length === 0 &&
          <EmptyState icon="Recipe" title="No recipes yet"
            sub={isTrainer ? 'Build your first recipe and it lands in every client’s library.' : 'Your coach hasn’t added any recipes yet - check back soon.'}
            actionLabel={isTrainer ? '+ NEW RECIPE' : undefined} onAction={isTrainer ? () => setBuilderRecipe(null) : undefined} />}
        </div>
      }
      {tab === 'guides' && guidesLoading && <SkeletonCard rows={4} />}
      {tab === 'guides' && !guidesLoading &&
      <div className="stagger-in" style={{ display: 'grid', gap: 10 }}>
          {filtered.map((g) => <GuideCard key={g.id} g={g} isFav={favs.has(g.id)} onToggleFav={() => toggleFav(g.id, 'guide')} onEdit={isTrainer ? () => setBuilderGuide(g) : null} onOpen={() => openGuide(g)} />)}
          {guideList.length === 0 &&
          <EmptyState icon="Book" title="No guides yet"
            sub={isTrainer ? 'Articles, videos and PDFs you add appear here for every client.' : 'Your coach hasn’t added any guides yet - check back soon.'}
            actionLabel={isTrainer ? '+ NEW GUIDE' : undefined} onAction={isTrainer ? () => setBuilderGuide(null) : undefined} />}
        </div>
      }
      {tab === 'favourites' &&
      <div className="stagger-in" style={{ display: 'grid', gap: 10 }}>
          {recipeList.filter((r) => favs.has(r.id) && r.title.toLowerCase().includes(query.toLowerCase()))
            .map((r) => <RecipeCard key={r.id} r={r} onOpen={() => setOpenRecipe(r)} isFav={true} onToggleFav={() => toggleFav(r.id, 'recipe')} onEdit={isTrainer ? () => setBuilderRecipe(r) : null} />)}
          {guideList.filter((g) => favs.has(g.id) && g.title.toLowerCase().includes(query.toLowerCase()))
            .map((g) => <GuideCard key={g.id} g={g} isFav={true} onToggleFav={() => toggleFav(g.id, 'guide')} onEdit={isTrainer ? () => setBuilderGuide(g) : null} onOpen={() => openGuide(g)} />)}
          {(exercises || []).filter((e) => favs.has(e.id) && exerciseMatches(e.name, query, e.muscle_group || ''))
            .map((e) => <ExerciseGlossaryCard key={e.id} e={e} onOpen={() => setOpenExercise(e)} isFav={true} onToggleFav={() => toggleFav(e.id, 'exercise')} />)}
        </div>
      }

      {favs.size === 0 && tab === 'favourites' &&
      <EmptyState icon="Heart" title="No favourites yet"
        sub="Tap the ♥ on any recipe, guide or exercise to pin it here for quick access."
        actionLabel="BROWSE RECIPES" onAction={() => setTab('recipes')} />
      }

      {/* Exercise glossary - read-only reference of the coach's library */}
      {tab === 'exercises' && (
        exercises === null ? (
          <SkeletonCard rows={4} />
        ) : (() => {
          const exFiltered = exercises.filter((e) => exerciseMatches(e.name, query, e.muscle_group || ''));
          if (exercises.length === 0) return (
            <EmptyState icon="Dumbbell" title="No exercises yet"
              sub={isTrainer ? 'Build your library in the Exercises tab.' : 'Your coach hasn’t added any exercises yet.'} />
          );
          if (exFiltered.length === 0) return (
            <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}><div style={{ fontSize: 13 }}>No exercises match "{query}"</div></div>
          );
          return (
            <div className="stagger-in" style={{ display: 'grid', gap: 10 }}>
              {exFiltered.map((e) => <ExerciseGlossaryCard key={e.id} e={e} onOpen={() => setOpenExercise(e)} isFav={favs.has(e.id)} onToggleFav={() => toggleFav(e.id, 'exercise')} />)}
            </div>
          );
        })()
      )}

      {/* Client vault - documents shared by the coach */}
      {tab === 'vault' && <VaultView docs={vaultDocs} />}

      {filtered.length === 0 && query && tab !== 'favourites' && tab !== 'exercises' && tab !== 'vault' && !(tab === 'recipes' && recipesLoading) && sourceList.length > 0 &&
      <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>
          <div style={{ fontSize: 13 }}>No {tab} match "{query}"</div>
        </div>
      }

      {openRecipe && <RecipeDetail r={openRecipe} onClose={() => setOpenRecipe(null)}
      isFav={favs.has(openRecipe.id)} onToggleFav={() => toggleFav(openRecipe.id, 'recipe')}
      onEdit={isTrainer ? () => { setOpenRecipe(null); setBuilderRecipe(openRecipe); } : null} />}

      {openExercise && <ExerciseGlossaryDetail e={openExercise} onClose={() => setOpenExercise(null)}
      isFav={favs.has(openExercise.id)} onToggleFav={() => toggleFav(openExercise.id, 'exercise')} />}
    </div>);

}

// ── EXERCISE GLOSSARY (read-only) ────────────────────────────────
function ExerciseGlossaryCard({ e, onOpen, isFav, onToggleFav }) {
  const thumb = e.thumbnail_url || videoThumb(e.video_url) || (e.photos && e.photos[0]) || '';
  return (
    <div className="card tappable" onClick={onOpen} style={{ padding: 0, overflow: 'hidden', display: 'flex', cursor: 'pointer', position: 'relative' }}>
      <div style={{ width: 88, flexShrink: 0, background: `url('${thumb}') center/cover, var(--bg-3)`, position: 'relative' }}>
        {e.video_url && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#eceff4' }}><IconPlay size={18}/></div>}
      </div>
      {onToggleFav &&
      <button onClick={(ev) => { ev.stopPropagation(); onToggleFav(); }} aria-label="Favourite exercise"
      style={{ all: 'unset', cursor: 'pointer', position: 'absolute', top: 8, right: 8, zIndex: 2, width: 28 * HEX_RATIO, height: 28, display: 'grid', placeItems: 'center' }}>
        <HexShape size={28}
        fill={isFav ? 'var(--c-coral)' : 'var(--bg-2)'}
        stroke={isFav ? 'var(--c-coral)' : 'var(--line-strong)'}
        strokeWidth={isFav ? 0 : 12}
        style={{ position: 'absolute', inset: 0, filter: isFav ? 'drop-shadow(0 0 calc(8px * var(--glow)) color-mix(in srgb, var(--c-coral) 60%, transparent))' : 'none' }} />
        <IconHeart size={13} fill={isFav ? '#fff' : 'none'} style={{ position: 'relative', color: isFav ? '#fff' : 'var(--text-3)' }} />
      </button>
      }
      <div style={{ padding: 12, flex: 1, minWidth: 0, marginRight: onToggleFav ? 30 : 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
          {e.muscle_group && <span className="mono" style={{ fontSize: 8.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)' }}>{e.muscle_group.toUpperCase()}</span>}
          {e.category && <span className="mono" style={{ fontSize: 8.5, fontWeight: 600, padding: '2px 7px', borderRadius: 999, color: 'var(--text-2)', border: '1px solid var(--line-strong)' }}>{e.category.toUpperCase()}</span>}
          {e.banded && <span className="mono" style={{ fontSize: 8.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999, color: 'var(--c-pink)', border: '1px solid color-mix(in srgb, var(--c-pink) 40%, transparent)' }}>BANDED</span>}
          {e.unilateral && <span className="mono" style={{ fontSize: 8.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999, color: 'var(--c-amber)', border: '1px solid color-mix(in srgb, var(--c-amber) 40%, transparent)' }}>EACH SIDE</span>}
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.2 }}>{e.name}</div>
      </div>
      <div style={{ display: 'grid', placeItems: 'center', paddingRight: 10 }}><IconChevronRight size={15} style={{ color: 'var(--text-3)' }}/></div>
    </div>
  );
}

function ExerciseGlossaryDetail({ e, onClose, isFav, onToggleFav }) {
  const thumb = e.thumbnail_url || videoThumb(e.video_url) || (e.photos && e.photos[0]) || '';
  const steps = (e.instructions || '').split('\n').map(s => s.trim()).filter(Boolean);
  const muscles = (e.muscles_worked || []).map(k => MUSCLE_LABEL[k] || k);
  const openVideo = () => { const u = e.video_url || e.link_url; if (u) window.open(u, '_blank', 'noopener'); };
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(7,7,12,0.7)', backdropFilter: 'blur(8px)', animation: 'fadeIn .2s ease' }}>
      <div onClick={(ev) => ev.stopPropagation()} style={{ position: 'absolute', inset: 0, background: 'var(--bg-0)', display: 'flex', flexDirection: 'column', animation: 'slideUp .25s ease' }}>
        {/* Hero */}
        <div style={{ height: 220, position: 'relative', flexShrink: 0, background: `linear-gradient(180deg, rgba(7,7,12,0.35) 0%, transparent 30%, var(--bg-0) 100%), url('${thumb}') center/cover, var(--bg-3)` }}>
          <HexBackButton onClick={onClose} variant="overlay" size={38} style={{ position: 'absolute', top: 14, left: 14, border: 0, background: 'none', padding: 0, cursor: 'pointer' }}/>
          {onToggleFav &&
          <button onClick={onToggleFav} aria-label="Favourite exercise" style={{ position: 'absolute', top: 14, right: 14, zIndex: 2, all: 'unset', cursor: 'pointer' }}>
            <Hex size={38} square style={{
              background: isFav ? 'var(--c-coral)' : 'rgba(10,15,20,0.82)',
              border: '1.5px solid ' + (isFav ? 'var(--c-coral)' : 'rgba(255,255,255,0.45)'),
              backdropFilter: 'blur(8px)', color: '#eceff4',
              boxShadow: isFav ? '0 0 calc(12px * var(--glow)) color-mix(in srgb, var(--c-coral) 65%, transparent)' : '0 2px 10px rgba(0,0,0,0.5)',
            }}>
              <IconHeart size={15} fill={isFav ? '#fff' : 'none'} />
            </Hex>
          </button>
          }
          {e.video_url && (
            <button onClick={openVideo} aria-label="Play video" style={{ all: 'unset', cursor: 'pointer', position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
              <Hex size={58} square style={{ background: 'rgba(0,0,0,0.55)', color: '#eceff4' }}><IconPlay size={22}/></Hex>
            </button>
          )}
          <div style={{ position: 'absolute', left: 18, right: 18, bottom: 14 }}>
            <div className="h-bold text-glow" style={{ fontSize: 24, lineHeight: 1.05, color: 'var(--accent)' }}>{e.name.toUpperCase()}</div>
          </div>
        </div>

        <div className="scroller" style={{ flex: 1, minHeight: 0, padding: '16px 18px 40px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {e.muscle_group && <span className="chip chip-accent" style={{ fontSize: 9 }}>{e.muscle_group}</span>}
            {e.modality && <span className="chip" style={{ fontSize: 9 }}>{e.modality}</span>}
            {e.category && <span className="chip" style={{ fontSize: 9 }}>{e.category}</span>}
            {e.banded && <span className="chip" style={{ fontSize: 9, color: 'var(--c-pink)', borderColor: 'currentColor' }}>BANDED</span>}
            {e.unilateral && <span className="chip" style={{ fontSize: 9, color: 'var(--c-amber)', borderColor: 'currentColor' }}>EACH SIDE</span>}
          </div>

          {muscles.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div className="label" style={{ marginBottom: 8 }}>// MUSCLES WORKED</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {muscles.map((m, i) => <span key={i} className="mono" style={{ fontSize: 10, fontWeight: 600, padding: '5px 10px', borderRadius: 999, background: 'var(--bg-2)', border: '1px solid var(--line-strong)', color: 'var(--text-2)' }}>{m}</span>)}
              </div>
            </div>
          )}

          {steps.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div className="label" style={{ marginBottom: 10 }}>// HOW TO</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {steps.map((s, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12, padding: 12, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, borderLeft: '2px solid var(--accent)' }}>
                    <Hex size={26} square style={{ background: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)', fontFamily: 'Orbitron', fontWeight: 800, fontSize: 11, color: 'var(--accent)' }}>{i + 1}</Hex>
                    <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-2)', alignSelf: 'center' }}>{s}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {e.link_url && (
            <a href={e.link_url} target="_blank" rel="noopener" className="btn-ghost" style={{ display: 'flex', width: '100%', boxSizing: 'border-box', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none' }}>
              OPEN REFERENCE LINK <IconChevronRight size={14}/>
            </a>
          )}

          {steps.length === 0 && muscles.length === 0 && !e.video_url && !e.link_url && (
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '20px 0' }}>No extra detail added for this exercise yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResTab({ active, onClick, icon, label, big }) {
  return (
    <button onClick={onClick} style={{
      minWidth: 0, padding: big ? '12px 10px' : '11px 6px',
      background: active ? 'var(--accent-soft)' : 'var(--bg-2)',
      border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line)'),
      borderRadius: 12, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: big ? 8 : 5,
      color: active ? 'var(--accent)' : 'var(--text-2)',
      fontFamily: 'JetBrains Mono', fontSize: big ? 12.5 : 10, fontWeight: 700, letterSpacing: '0.06em',
      textTransform: 'uppercase',
      boxShadow: active ? '0 0 calc(8px * var(--glow)) var(--accent-glow)' : 'none',
      transition: 'background .18s ease, color .18s ease, border-color .18s ease, box-shadow .18s ease'
    }}>
      <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </button>);

}

function IconFork({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3v6a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M8 11v10M16 3c-1.5 0-2.5 1.5-2.5 4s1 4 2.5 4v10" />
    </svg>
  );
}

function IconVaultDoc({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  );
}

// Client-side document vault - read-only view of documents the coach attached.
function VaultView({ docs }) {
  const open = async (doc) => {
    const { data } = await supabase.storage.from('client-vault').createSignedUrl(doc.path, 120);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  };
  if (docs === null) return <SkeletonCard rows={3} />;
  if (docs.length === 0) return (
    <EmptyState icon="Notes" title="No documents"
      sub="Plans, PDFs and paperwork your coach shares with you will appear here." />
  );
  return (
    <div className="stagger-in" style={{ display: 'grid', gap: 8 }}>
      {docs.map(doc => (
        <button key={doc.id} onClick={() => open(doc)} className="card tappable" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left', border: '1px solid var(--line)' }}>
          <span style={{ color: 'var(--accent)', flexShrink: 0 }}><IconVaultDoc size={22} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.06em', marginTop: 2 }}>
              {new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
          <IconChevronRight size={15} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
        </button>
      ))}
    </div>
  );
}

function RecipeCard({ r, onOpen, isFav, onToggleFav, onEdit }) {
  return (
    <div className="card tappable" onClick={onOpen} style={{ padding: 0, overflow: 'hidden', display: 'flex', cursor: onOpen ? 'pointer' : 'default', position: 'relative' }}>
      <div style={{
        width: 88, flexShrink: 0,
        background: `url('${r.img}') center/cover, var(--bg-3)`
      }} />
      {onEdit &&
      <button onClick={(e) => { e.stopPropagation(); onEdit(); }} aria-label="Edit recipe"
      style={{
        all: 'unset', cursor: 'pointer', position: 'absolute', bottom: 8, right: 8, zIndex: 2,
        padding: '4px 9px', borderRadius: 999,
        background: 'rgba(10,15,20,0.78)', border: '1px solid rgba(255,255,255,0.22)',
        color: '#eceff4', fontFamily: 'JetBrains Mono', fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em',
      }}>EDIT</button>
      }
      {onToggleFav &&
      <button onClick={(e) => {e.stopPropagation();onToggleFav();}} aria-label="Favourite"
      style={{
        all: 'unset', cursor: 'pointer', position: 'absolute', top: 8, right: 8,
        width: 28 * HEX_RATIO, height: 28, display: 'grid', placeItems: 'center'
      }}>
        <HexShape size={28}
        fill={isFav ? 'var(--c-coral)' : 'var(--bg-2)'}
        stroke={isFav ? 'var(--c-coral)' : 'var(--line-strong)'}
        strokeWidth={isFav ? 0 : 12}
        style={{
          position: 'absolute', inset: 0,
          filter: isFav ? 'drop-shadow(0 0 calc(8px * var(--glow)) color-mix(in srgb, var(--c-coral) 60%, transparent))' : 'none'
        }} />
        <IconHeart size={13} fill={isFav ? '#fff' : 'none'}
        style={{ position: 'relative', color: isFav ? '#fff' : 'var(--text-3)' }} />
      </button>
      }
      <div style={{ padding: 12, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, marginRight: onToggleFav ? 28 : 0 }}>
          <span className="mono" style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 999, letterSpacing: '0.06em', textTransform: 'uppercase', background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)' }}>{r.tag}</span>
          <span className="mono" style={{ fontSize: 9, fontWeight: 600, padding: '3px 8px', borderRadius: 999, letterSpacing: '0.06em', color: 'var(--text-2)', border: '1px solid var(--line-strong)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <IconClock size={10} />
            {r.time} MIN
          </span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2, marginBottom: 8 }}>{r.title}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Macro v={r.protein + 'g'} l="PROT" c="#F39E1F" />
          <Macro v={r.carbs + 'g'} l="CARB" c="#46BBC0" />
          <Macro v={r.fats + 'g'} l="FAT" c="#EE6A6A" />
        </div>
      </div>
    </div>);

}

function Macro({ v, l, c }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 11, fontWeight: 600, color: c }}>{v}</div>
      <div className="mono" style={{ fontSize: 8, color: 'var(--text-3)', letterSpacing: '0.12em', marginTop: 1 }}>{l}</div>
    </div>);

}

function GuideCard({ g, isFav, onToggleFav, onEdit, onOpen }) {
  const kindColor = g.kind === 'VIDEO' ? 'var(--pink)' : g.kind === 'GUIDE' ? 'var(--accent)' : 'var(--purple)';
  return (
    <div className="card tappable" onClick={onOpen} style={{ padding: 0, overflow: 'hidden', display: 'flex', position: 'relative', cursor: onOpen ? 'pointer' : 'default' }}>
      <div style={{
        width: 88, flexShrink: 0,
        background: `linear-gradient(135deg, transparent, rgba(0,0,0,0.5)), url('${g.img}') center/cover, var(--bg-3)`,
        position: 'relative'
      }}>
        {g.kind === 'VIDEO' &&
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          color: 'white'
        }}><IconPlay size={20} /></div>
        }
      </div>
      {onEdit &&
      <button onClick={(e) => { e.stopPropagation(); onEdit(); }} aria-label="Edit guide"
      style={{
        all: 'unset', cursor: 'pointer', position: 'absolute', bottom: 8, right: 8, zIndex: 2,
        padding: '4px 9px', borderRadius: 999, background: 'rgba(10,15,20,0.78)', border: '1px solid rgba(255,255,255,0.22)',
        color: '#eceff4', fontFamily: 'JetBrains Mono', fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em',
      }}>EDIT</button>
      }
      {onToggleFav &&
      <button onClick={(e) => {e.stopPropagation();onToggleFav();}} aria-label="Favourite"
      style={{ all: 'unset', cursor: 'pointer', position: 'absolute', top: 8, right: 8, width: 28 * HEX_RATIO, height: 28, display: 'grid', placeItems: 'center' }}>
        <HexShape size={28}
        fill={isFav ? 'var(--c-coral)' : 'var(--bg-2)'}
        stroke={isFav ? 'var(--c-coral)' : 'var(--line-strong)'}
        strokeWidth={isFav ? 0 : 12}
        style={{ position: 'absolute', inset: 0,
          filter: isFav ? 'drop-shadow(0 0 calc(8px * var(--glow)) color-mix(in srgb, var(--c-coral) 60%, transparent))' : 'none' }} />
        <IconHeart size={13} fill={isFav ? '#fff' : 'none'}
        style={{ position: 'relative', color: isFav ? '#fff' : 'var(--text-3)' }} />
      </button>
      }
      <div style={{ padding: 12, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 6, marginRight: onToggleFav ? 28 : 0 }}>
          <span className="chip" style={{ fontSize: 8, padding: '1px 6px', color: kindColor, borderColor: 'currentColor' }}>{g.kind}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2, marginBottom: 6 }}>{g.title}</div>
        <span className="mono" style={{ fontSize: 9, color: 'var(--text-2)', letterSpacing: '0.08em' }}>
          {g.category}
        </span>
      </div>
    </div>);

}

Resources = Resources;

// ── RECIPE DETAIL TEMPLATE ────────────────────────────────────────
// Full-screen recipe template with: hero, serving-size dial,
// macros that scale with servings, hex-shaped macro display,
// ingredients, method, and "Add to Tracker" export action.
function RecipeDetail({ r, onClose, isFav, onToggleFav, onEdit }) {
  const base = Math.max(1, r.baseServings || 1);
  const [servings, setServings] = React.useState(base);
  const [exporting, setExporting] = React.useState(false);

  const baseIngredients = r.ingredients || [];
  const steps = r.steps || [];

  // Ingredient scaling factor (ingredients are stored for `base` servings)
  const factor = servings / base;

  // Scaled totals - macros are per serving, so total = perServing × servings
  const scaled = (n) => n != null ? n * servings : null;
  const totalKcal = scaled(r.kcal) || 0;
  const macros = [
  { l: 'PROTEIN', v: scaled(r.protein), kcalPer: 4, c: '#F39E1F' },
  { l: 'CARBS', v: scaled(r.carbs), kcalPer: 4, c: '#46BBC0' },
  { l: 'FATS', v: scaled(r.fats), kcalPer: 9, c: '#EE6A6A' }].
  map((m) => ({ ...m, g: totalKcal ? m.v * m.kcalPer / totalKcal * 100 : 0 }));

  // Per-portion macros - fixed regardless of how many servings you cook.
  const portionKcal = r.kcal || 0;
  const portionMacros = [
  { l: 'PROTEIN', v: r.protein, kcalPer: 4, c: '#F39E1F' },
  { l: 'CARBS', v: r.carbs, kcalPer: 4, c: '#46BBC0' },
  { l: 'FATS', v: r.fats, kcalPer: 9, c: '#EE6A6A' }].
  map((m) => ({ ...m, g: portionKcal ? m.v * m.kcalPer / portionKcal * 100 : 0 }));

  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 60,
      background: 'rgba(7,7,12,0.7)', backdropFilter: 'blur(8px)',
      animation: 'fadeIn .2s ease'
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        position: 'absolute', inset: 0,
        background: 'var(--bg-0)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideUp .25s ease'
      }}>
        {/* Hero image */}
        <div style={{
          height: 240, position: 'relative', flexShrink: 0,
          background: `linear-gradient(180deg, rgba(7,7,12,0.4) 0%, transparent 30%, rgba(7,7,12,0.95) 100%), url('${r.img}') center/cover, var(--bg-3)`
        }}>
          {/* Back (left) + edit/favourite grouped on the right so they never
              collide with the back button on any width. */}
          <HexBackButton onClick={onClose} variant="overlay" size={38} style={hexBtnStyle('left')} />
          <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
            {onEdit &&
            <button onClick={onEdit} aria-label="Edit recipe" style={{
              all: 'unset', cursor: 'pointer', padding: '9px 13px', borderRadius: 999,
              background: 'rgba(10,15,20,0.82)', border: '1px solid rgba(255,255,255,0.3)',
              color: '#eceff4', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              backdropFilter: 'blur(8px)',
            }}>EDIT</button>
            }
            <button onClick={onToggleFav} aria-label="Favourite" style={{ all: 'unset', cursor: 'pointer' }}>
              <Hex size={38} square style={{
                background: isFav ? 'var(--c-coral)' : 'rgba(10,15,20,0.82)',
                border: '1.5px solid ' + (isFav ? 'var(--c-coral)' : 'rgba(255,255,255,0.45)'),
                backdropFilter: 'blur(8px)',
                color: '#eceff4',
                boxShadow: isFav ? '0 0 calc(12px * var(--glow)) color-mix(in srgb, var(--c-coral) 65%, transparent)' : '0 2px 10px rgba(0,0,0,0.5)'
              }}>
                <IconHeart size={15} fill={isFav ? '#fff' : 'none'} />
              </Hex>
            </button>
          </div>
          <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '5px 11px', borderRadius: 999,
                background: 'var(--accent)', color: 'var(--on-accent)',
                fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em'
              }}>{r.tag}</span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', borderRadius: 999,
                background: 'rgba(10,15,20,0.78)', backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: '#eceff4',
                fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em'
              }}>
                <IconClock size={12} />
                {r.time} MIN
              </span>
            </div>
            <div className="h-bold text-glow" style={{ fontSize: 26, lineHeight: 1.05, color: 'var(--accent)' }}>
              {r.title.toUpperCase()}
            </div>
          </div>
        </div>

        {/* Body scroll */}
        <div className="scroller" style={{ flex: 1, padding: '16px 16px 120px', minHeight: 0 }}>
          {/* Hex macro + breakdown - per portion */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0 4px 8px' }}>
            <div className="label">// MACROS</div>
            <span className="mono" style={{ fontSize: 9, color: 'var(--accent)', letterSpacing: '0.14em', fontWeight: 600 }}>PER PORTION</span>
          </div>
          <div className="card" style={{ padding: 14, marginBottom: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Hex size={56} square style={{
                background: 'color-mix(in srgb, var(--c-blue) 20%, transparent)',
                border: '1px solid color-mix(in srgb, var(--c-blue) 50%, transparent)'
              }}>
                <span className="h-bold" style={{ fontSize: 16, color: 'var(--c-blue)', lineHeight: 1 }}>{Math.round(portionKcal)}</span>
              </Hex>
              <span className="mono" style={{ fontSize: 9, color: 'var(--text-2)', letterSpacing: '0.1em', fontWeight: 600 }}>KCAL</span>
            </div>
            {portionMacros.map((m, i) =>
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Hex size={56} square style={{
                background: `color-mix(in srgb, ${m.c} 16%, transparent)`,
                border: `1px solid color-mix(in srgb, ${m.c} 45%, transparent)`
              }}>
                <span className="h-bold" style={{ fontSize: 17, color: m.c, lineHeight: 1 }}>{Math.round(m.v)}<span style={{ fontSize: 9 }}>g</span></span>
              </Hex>
              <span className="mono" style={{ fontSize: 9, color: 'var(--text-2)', letterSpacing: '0.12em', fontWeight: 600 }}>{m.l}</span>
            </div>
            )}
          </div>

          {/* Ingredients */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '4px 4px 8px' }}>
            <div className="label">// INGREDIENTS</div>
            <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em' }}>
              FOR {servings} SERVING{servings > 1 ? 'S' : ''}{servings !== base ? ` · BASE ${base}` : ''}
            </span>
          </div>
          {baseIngredients.length > 0 && <ServingDial value={servings} base={base} onChange={setServings} />}
          {baseIngredients.length === 0 ? (
            <div className="card" style={{ padding: 18, textAlign: 'center', marginBottom: 14 }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em' }}>NO INGREDIENTS LISTED</span>
            </div>
          ) : (
          <div className="card" style={{ padding: 4, marginBottom: 14 }}>
            {baseIngredients.map((ing, i) =>
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '20px 80px 1fr', gap: 10,
              alignItems: 'center', padding: '10px 12px',
              borderBottom: i < baseIngredients.length - 1 ? '1px dashed var(--line)' : 'none'
            }}>
                <input type="checkbox" style={{
                width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer'
              }} />
                <span className="mono" style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '0.04em', fontWeight: 600 }}>
                  {ing.qty == null ? '-' : `${fmtQty(scaleQty(ing.qty, factor))}${ing.unit}`}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{ing.name}</span>
              </div>
            )}
          </div>
          )}

          {/* Intro - the coach's personal note, before the method */}
          {r.intro && (
            <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 10, background: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 30%, var(--line))' }}>
              <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-line', fontFamily: "'JetBrains Mono', monospace" }}>{r.intro}</div>
            </div>
          )}

          {/* Method */}
          {steps.length > 0 && <>
          <div className="label" style={{ margin: '4px 4px 8px' }}>// METHOD</div>
          <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
            {steps.map((s, i) =>
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '32px 1fr', gap: 12,
              padding: '14px', background: 'var(--bg-2)', borderRadius: 10,
              border: '1px solid var(--line)',
              borderLeft: '2px solid var(--accent)'
            }}>
                <Hex size={28} square style={{
                background: 'var(--accent-soft)',
                border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)',
                fontFamily: 'Orbitron', fontWeight: 800, fontSize: 12, color: 'var(--accent)'
              }}>{i + 1}</Hex>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-2)', alignSelf: 'center' }}>
                  {s}
                </div>
              </div>
            )}
          </div>
          </>}
        </div>

        {/* Sticky bottom action - hidden for now (ADD TO TRACKER paused) */}
        {false && (
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            padding: '14px 16px 28px',
            background: 'linear-gradient(180deg, transparent, var(--bg-0) 30%)'
          }}>
            <button className="btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
            onClick={() => setExporting(true)}>
              <IconPlus size={14} /> ADD TO TRACKER
            </button>
          </div>
        )}

        {/* Export sheet */}
        {exporting && <ExportSheet recipe={r} servings={servings} totalKcal={totalKcal} macros={macros}
        onClose={() => setExporting(false)} />}
      </div>
    </div>);

}

function hexBtnStyle(side) {
  return {
    position: 'absolute', top: 14, [side]: 14,
    background: 'none', border: 0, padding: 0, cursor: 'pointer'
  };
}

// ── SERVING SIZE DIAL ────────────────────────────────────────────
function ServingDial({ value, base, onChange }) {
  // Always include the recipe's base servings as a quick-pick option.
  const options = [...new Set([1, 2, base || 4, (base || 4) + 2, 6, 8])]
    .filter(n => n >= 1 && n <= 12).sort((a, b) => a - b);
  const trackRef = React.useRef(null);

  return (
    <div className="card" style={{
      padding: 14, marginBottom: 12,
      display: 'flex', alignItems: 'center', gap: 14
    }}>
      <div style={{ flexShrink: 0 }}>
        <div className="label">// SERVINGS</div>
        <div className="h-bold" style={{ fontSize: 14, marginTop: 4, color: 'var(--text)' }}>
          {value} <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.1em', fontWeight: 400 }}>PORTION{value > 1 ? 'S' : ''}</span>
        </div>
      </div>

      {/* Stepper */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => onChange(Math.max(1, value - 1))}
        aria-label="Decrease servings"
        style={dialBtn(value > 1)}>
          <span style={{ fontSize: 18, lineHeight: 1, fontWeight: 600 }}>−</span>
        </button>

        {/* Hex dots row - tappable */}
        <div ref={trackRef} style={{ display: 'flex', gap: 4, alignItems: 'center' }} data-comment-anchor="8fdaab69df-div-523-9">
          {options.map((n) =>
          <button key={n} onClick={() => onChange(n)} aria-label={`${n} servings`}
          style={{ all: 'unset', cursor: 'pointer', padding: 2 }}>
              <Hex size={n === value ? 26 : 18} square style={{
              background: n === value ? 'var(--accent)' : 'var(--bg-3)',
              color: n === value ? 'var(--on-accent)' : 'var(--text-3)',
              fontFamily: 'Orbitron', fontWeight: 800,
              fontSize: n === value ? 12 : 9,
              boxShadow: n === value ? '0 0 calc(8px * var(--glow)) var(--accent-glow)' : 'none',
              transition: 'all .15s ease'
            }}>{n}</Hex>
            </button>
          )}
        </div>

        <button onClick={() => onChange(Math.min(12, value + 1))}
        aria-label="Increase servings"
        style={dialBtn(value < 12)}>
          <span style={{ fontSize: 18, lineHeight: 1, fontWeight: 600 }}>+</span>
        </button>
      </div>
    </div>);

}

function dialBtn(enabled) {
  return {
    width: 32, height: 32, borderRadius: 8,
    background: 'var(--bg-3)',
    border: '1px solid var(--line-strong)',
    color: enabled ? 'var(--accent)' : 'var(--text-3)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.4,
    display: 'grid', placeItems: 'center'
  };
}

// ── EXPORT SHEET (Add-to-tracker prompt) ──────────────────────────
function ExportSheet({ recipe, servings, totalKcal, macros, onClose }) {
  const [pickedApp, setPickedApp] = React.useState(null);
  const [sent, setSent] = React.useState(false);

  // Trackers log a single serving, so always export the PER-SERVING macros
  // (the caller passes totals for the previewed number of servings).
  const s = Math.max(1, servings || 1);
  const kcal1 = totalKcal / s;
  const p1 = macros[0].v / s, c1 = macros[1].v / s, f1 = macros[2].v / s;

  const apps = [
  { id: 'myfitnesspal', name: 'MyFitnessPal', tag: 'CALORIE TRACKER', glyph: 'MFP', tint: 'var(--c-blue)' },
  { id: 'cronometer', name: 'Cronometer', tag: 'MICRONUTRIENTS', glyph: 'CRO', tint: 'var(--accent)' },
  { id: 'lose-it', name: 'Lose It!', tag: 'WEIGHT LOSS', glyph: 'LIT', tint: 'var(--c-amber)' },
  { id: 'apple-health', name: 'Apple Health', tag: 'IOS HEALTH', glyph: 'APL', tint: 'var(--c-coral)' },
  { id: 'csv', name: 'CSV / Clipboard', tag: 'COPY RAW', glyph: 'CSV', tint: 'var(--text-2)' }];


  // Real action: copy a macro summary to the clipboard to paste into the
  // chosen tracker (rather than a simulated "send").
  const send = (app) => {
    const text = `${recipe.title} - per serving: ${Math.round(kcal1)} kcal · ${Math.round(p1)}g protein · ${Math.round(c1)}g carbs · ${Math.round(f1)}g fat`;
    try { navigator.clipboard?.writeText(text); } catch (e) { /* ignore */ }
    setPickedApp(app);
    setSent(true);
  };

  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 70,
      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'flex-end',
      animation: 'fadeIn .2s ease'
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxHeight: '88%',
        background: 'var(--bg-1)',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        border: '1px solid var(--line-strong)',
        borderBottom: 0,
        padding: '12px 18px 28px',
        animation: 'slideUp .25s ease',
        overflow: 'auto'
      }}>
        <div style={{ width: 36, height: 4, background: 'var(--line-strong)', borderRadius: 2, margin: '0 auto 14px' }} />

        {sent ? (
        /* Confirmation state */
        <div style={{ padding: '20px 0 8px', textAlign: 'center' }}>
            <Hex size={70} square style={{
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            margin: '0 auto 16px',
            boxShadow: '0 0 calc(20px * var(--glow)) var(--accent-glow)'
          }}>
              <IconCheck size={28} sw={3} />
            </Hex>
            <div className="label" style={{ color: 'var(--accent)', marginBottom: 6 }}>// COPIED</div>
            <div className="h-bold" style={{ fontSize: 20, marginBottom: 6 }}>
              COPIED TO CLIPBOARD
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, marginBottom: 18 }}>
              {Math.round(kcal1)} kcal · per serving of <strong style={{ color: 'var(--text)' }}>{recipe.title}</strong>
              <br />Paste it into your {pickedApp.name} diary.
            </div>
            <button className="btn-primary" style={{ width: '100%' }} onClick={onClose}>DONE</button>
          </div>) : (

        /* Picker state */
        <>
            <div className="label">// ADD TO TRACKER</div>
            <div className="h-bold" style={{ fontSize: 20, marginTop: 4, marginBottom: 4 }}>
              EXPORT MACROS
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 14 }}>
              Send <strong style={{ color: 'var(--text)' }}>{Math.round(kcal1)} kcal</strong>
              {' · '}
              <span style={{ color: '#F39E1F' }}>{Math.round(p1)}P</span> /
              <span style={{ color: '#46BBC0' }}> {Math.round(c1)}C</span> /
              <span style={{ color: '#EE6A6A' }}> {Math.round(f1)}F</span>
              {' '}(per serving) to your calorie tracker.
            </div>

            {/* Macro summary card */}
            <div style={{
            padding: 12, borderRadius: 10, marginBottom: 16,
            background: 'var(--bg-2)',
            border: '1px solid var(--line)',
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0
          }}>
              {[
            { l: 'KCAL', v: Math.round(kcal1), c: 'var(--c-blue)' },
            { l: 'PROT', v: Math.round(p1) + 'g', c: '#F39E1F' },
            { l: 'CARB', v: Math.round(c1) + 'g', c: '#46BBC0' },
            { l: 'FAT', v: Math.round(f1) + 'g', c: '#EE6A6A' }].
            map((s, i) =>
            <div key={i} style={{
              textAlign: 'center',
              borderRight: i < 3 ? '1px solid var(--line)' : 'none',
              padding: '2px 0'
            }}>
                  <div className="h-bold" style={{ fontSize: 16, color: s.c, lineHeight: 1 }}>{s.v}</div>
                  <div className="mono" style={{ fontSize: 8, color: 'var(--text-3)', marginTop: 4, letterSpacing: '0.14em' }}>{s.l}</div>
                </div>
            )}
            </div>

            <div className="label" style={{ margin: '4px 4px 8px' }}>// CHOOSE APP</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {apps.map((app) =>
            <button key={app.id} onClick={() => send(app)}
            style={{
              all: 'unset', cursor: 'pointer',
              padding: '10px 12px', borderRadius: 10,
              background: 'var(--bg-2)',
              border: '1px solid ' + (pickedApp?.id === app.id ? 'var(--accent)' : 'var(--line)'),
              display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12,
              alignItems: 'center'
            }}>
                  <Hex size={36} square style={{
                background: `color-mix(in srgb, ${app.tint} 18%, var(--bg-3))`,
                color: app.tint,
                fontFamily: 'Orbitron', fontWeight: 800, fontSize: 10, letterSpacing: '0.04em'
              }}>{app.glyph}</Hex>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{app.name}</div>
                    <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.12em', marginTop: 2 }}>
                      {app.tag}
                    </div>
                  </div>
                  {pickedApp?.id === app.id ?
              <span className="mono" style={{ fontSize: 9, color: 'var(--accent)', letterSpacing: '0.12em' }}>SENDING…</span> :
              <IconChevronRight size={14} style={{ color: 'var(--text-3)' }} />}
                </button>
            )}
            </div>

            <button className="btn-ghost" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>
              CANCEL
            </button>
          </>)
        }
      </div>
    </div>);

}

// ── HEX MACRO DISPLAY ────────────────────────────────────────────
// Single hexagon outline whose border is split into three segments,
// each sized to that macro's share of total calories.
// Protein = marigold, Fats = coral, Carbs = sea green.
const MACRO_HEX_COLORS = { PROTEIN: '#F39E1F', FATS: '#EE6A6A', CARBS: '#46BBC0' };

function MacroHex({ kcal, macros }) {
  const pathRef = React.useRef(null);
  const [len, setLen] = React.useState(0);
  React.useEffect(() => {
    if (pathRef.current) setLen(pathRef.current.getTotalLength());
  }, []);

  // Normalise the calorie-share so the three segments fill the whole perimeter.
  const total = macros.reduce((a, m) => a + (m.g || 0), 0) || 1;
  const segs = macros.map((m) => ({
    label: m.l,
    frac: (m.g || 0) / total,
    color: MACRO_HEX_COLORS[m.l] || m.c
  }));
  const gap = len * 0.018; // small visual break between segments
  let acc = 0;

  return (
    <div style={{ position: 'relative', width: 100, height: 100, flexShrink: 0 }}>
      <svg width="100" height="100" viewBox="0 0 389 365"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', overflow: 'visible', transform: 'rotate(-90deg)' }}>
        {/* hidden measurement path */}
        <path ref={pathRef} d={HEX_PATH} fill="none" stroke="none" />
        {/* track */}
        <path d={HEX_PATH} fill="none" stroke="color-mix(in srgb, var(--text-3) 22%, transparent)" strokeWidth="20" />
        {/* macro segments */}
        {len > 0 && segs.map((s, i) => {
          const segLen = s.frac * len;
          const dash = Math.max(0.0001, segLen - gap);
          const offset = -acc;
          acc += segLen;
          return (
            <path key={i} d={HEX_PATH}
            fill="none" stroke={s.color} strokeWidth="20"
            strokeLinecap="butt"
            strokeDasharray={`${dash} ${len - dash}`}
            strokeDashoffset={offset}
            style={{ filter: `drop-shadow(0 0 calc(2.5px * var(--glow)) ${s.color})` }} />);
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div className="h-bold" style={{ fontSize: 22, color: 'var(--text)', lineHeight: 1 }} data-comment-anchor="6febb56216-div-736-11">{kcal}</div>
          <div className="mono" style={{ fontSize: 8, color: 'var(--text-3)', letterSpacing: '0.14em', marginTop: 2 }}>KCAL</div>
        </div>
      </div>
    </div>);

}