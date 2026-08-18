import React from 'react'
import { supabase } from './lib/supabase'
import { HexShape } from './components/hex'
import { BrandIcon } from './components/BrandIcon'
import { HexLoader } from './components/Loading'
import { IconHome, IconCalendar, IconChart, IconBook, IconUser, IconBolt, IconActivity, IconDumbbell, IconDoc, IconPlay, IconX2 } from './components/icons'
import { Login, SetPassword } from './screens/Login'
import { Dashboard } from './screens/Dashboard'
import { unreadCount, subscribeNotifications, maybeBrowserNotify, requestNotifyPermission } from './lib/notifications'
import { loadActiveWorkout, clearActiveWorkout } from './lib/activeWorkout'
import { InstallPrompt } from './screens/InstallPrompt'
import { isStandalone } from './lib/installPrompt'
import { ToastHost } from './lib/toast'
import { ErrorBoundary } from './components/ErrorBoundary'

// Screens are loaded on demand. Only the login screen and the client dashboard
// are in the initial bundle - everything else (the logger, the whole coach app,
// the resource library) is fetched the first time it's opened, so a client on a
// phone doesn't download the programme builder to look at today's session.
// React.lazy wants a default export; these modules all use named ones.
const lazyScreen = (loader, name) =>
  React.lazy(() => loader().then(m => ({ default: m[name] })));

const Workouts       = lazyScreen(() => import('./screens/Workouts'), 'Workouts');
const ActiveLog      = lazyScreen(() => import('./screens/ActiveLog'), 'ActiveLog');
const SessionResults = lazyScreen(() => import('./screens/ActiveLog'), 'SessionResults');
const Progress       = lazyScreen(() => import('./screens/Progress'), 'Progress');
const Resources      = lazyScreen(() => import('./screens/Resources'), 'Resources');
const Profile        = lazyScreen(() => import('./screens/Profile'), 'Profile');
const Notifications  = lazyScreen(() => import('./screens/Notifications'), 'Notifications');
const Coach          = lazyScreen(() => import('./screens/Coach'), 'Coach');
const Body           = lazyScreen(() => import('./screens/Body'), 'Body');
const Exercises      = lazyScreen(() => import('./screens/Exercises'), 'Exercises');
const Forms          = lazyScreen(() => import('./screens/Forms'), 'Forms');

// Screens safe to restore verbatim after a reload/app-switch (no required
// params). Logger/results/client-view need context, so they fall back home.
const RESTORABLE = new Set(['dashboard', 'workouts', 'progress', 'resources', 'body', 'coach', 'programmes', 'exercises', 'forms', 'profile']);
// Of those, the ones a coach can legitimately be sitting on as themselves.
// hs_screen is shared between both sides of the app and lives in localStorage,
// while impersonation lives in sessionStorage - so a coach who dropped into a
// client's app, opened their calendar, and closed the tab came back as
// themselves on that client-side calendar. Anything not in here sends them to
// their hub instead.
const COACH_RESTORABLE = new Set(['coach', 'programmes', 'exercises', 'forms', 'resources', 'profile']);

const ACCENTS = {
  sea:      { c: '#46BBC0', soft: 'rgba(70,187,192,0.16)',  glow: 'rgba(70,187,192,0.45)',  on: '#06262A' },
  viridian: { c: '#189CAA', soft: 'rgba(24,156,170,0.16)',  glow: 'rgba(24,156,170,0.45)',  on: '#04181C' },
  amber:    { c: '#F39E1F', soft: 'rgba(243,158,31,0.16)',  glow: 'rgba(243,158,31,0.40)',  on: '#1C1206' },
  coral:    { c: '#EE6A6A', soft: 'rgba(238,106,106,0.16)', glow: 'rgba(238,106,106,0.40)', on: '#220909' },
};

const BG_PRESETS = {
  charcoal: { '--bg-0': '#0a0d0e', '--bg-1': '#11161A', '--bg-2': '#1A2125', '--bg-3': '#232C32' },
  midnight: { '--bg-0': '#04181C', '--bg-1': '#082226', '--bg-2': '#0E2E33', '--bg-3': '#143C42' },
};

const DENSITY = {
  sparse:   { pad: 20, gap: 18, radius: 16 },
  balanced: { pad: 16, gap: 14, radius: 14 },
  dense:    { pad: 12, gap: 10, radius: 12 },
};

export default function App() {
  const [theme, setTheme] = React.useState(() => {
    try { return localStorage.getItem('hs_theme') || 'system'; } catch (e) { return 'system'; }
  });
  const [systemDark, setSystemDark] = React.useState(() => {
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
  });
  const [accent] = React.useState('sea');
  const [bg] = React.useState('charcoal');
  const [typeIntensity] = React.useState(1);
  const [density] = React.useState('balanced');
  const [glow] = React.useState(1);
  const [screen, setScreen] = React.useState(() => {
    try { const s = localStorage.getItem('hs_screen'); return RESTORABLE.has(s) ? s : 'dashboard'; } catch (e) { return 'dashboard'; }
  });
  // Remember the last top-level screen so an app-switch/reload lands back here.
  React.useEffect(() => {
    try { if (RESTORABLE.has(screen)) localStorage.setItem('hs_screen', screen); } catch (e) {}
  }, [screen]);
  const [previewWorkoutId, setPreviewWorkoutId] = React.useState(null);
  const [logDayId, setLogDayId] = React.useState(null);
  const [logResume, setLogResume] = React.useState(false);
  const [logEdit, setLogEdit] = React.useState(false);
  const [resumePrompt, setResumePrompt] = React.useState(null);
  const [showInstall, setShowInstall] = React.useState(false);
  const [resultsDayId, setResultsDayId] = React.useState(null);
  // Impersonation ("assume control") persists across a background reload so a
  // coach isn't booted out of a client when the OS reclaims the tab.
  const [clientViewId, setClientViewId] = React.useState(() => {
    try { return sessionStorage.getItem('hs_cv_id') || null; } catch (e) { return null; }
  });
  const [coachOpen, setCoachOpen] = React.useState(null); // { clientId, tab } → open a client's detail page
  const [clientViewName, setClientViewName] = React.useState(() => {
    try { return sessionStorage.getItem('hs_cv_name') || null; } catch (e) { return null; }
  });
  React.useEffect(() => {
    try {
      if (clientViewId) { sessionStorage.setItem('hs_cv_id', clientViewId); sessionStorage.setItem('hs_cv_name', clientViewName || ''); }
      else { sessionStorage.removeItem('hs_cv_id'); sessionStorage.removeItem('hs_cv_name'); }
    } catch (e) {}
  }, [clientViewId, clientViewName]);
  // Route a coach to their hub only once, on first load - never on later token
  // refreshes (which would otherwise eject them from a client they're viewing).
  const didInitialRoute = React.useRef(false);

  // Auth state
  const [session, setSession] = React.useState(null);
  const [profile, setProfile] = React.useState(null);
  const [authLoading, setAuthLoading] = React.useState(true);
  const [bootError, setBootError] = React.useState(false);
  // Invite / password-recovery email links land here with a session but no
  // usable password - force a set-password step. Captured from the URL hash
  // before supabase-js consumes it, and persisted across that processing.
  const [needsPassword, setNeedsPassword] = React.useState(() => {
    try {
      const h = window.location.hash || '';
      if (/type=(invite|recovery)/.test(h)) sessionStorage.setItem('hs_set_pw', '1');
      return sessionStorage.getItem('hs_set_pw') === '1';
    } catch (e) { return false; }
  });
  const [unread, setUnread] = React.useState(0);
  // Console-style boot splash, shown once when the user actively signs in
  // (never on session restores or token refreshes).
  const [showSplash, setShowSplash] = React.useState(false);
  const sessionRef = React.useRef(null);
  React.useEffect(() => { sessionRef.current = session; }, [session]);

  React.useEffect(() => {
    let done = false;
    const finish = () => { done = true; setAuthLoading(false); };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id).finally(finish);
      else finish();
    }).catch(finish);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'PASSWORD_RECOVERY') {
        try { sessionStorage.setItem('hs_set_pw', '1'); } catch (e) {}
        setNeedsPassword(true);
      }
      if (_event === 'SIGNED_IN' && session && !sessionRef.current) setShowSplash(true);
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else { setProfile(null); setAuthLoading(false); setNeedsPassword(false); }
    });

    // Watchdog - never hang forever if the backend is paused/unreachable.
    const wd = setTimeout(() => { if (!done) { setBootError(true); setAuthLoading(false); } }, 10000);

    return () => { clearTimeout(wd); subscription.unsubscribe(); };
  }, []);

  const fetchProfile = async (userId) => {
    try {
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000));
      const { data } = await Promise.race([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        timeout,
      ]);
      setProfile(data);
      setBootError(false);
      // Coaches land on the Coach hub (no client homepage in their nav) - but
      // only on first load, and never while assuming control of a client, so a
      // token refresh on tab-back doesn't eject them from the client's app.
      if (data?.role === 'trainer' && !didInitialRoute.current) {
        didInitialRoute.current = true;
        let impersonating = false;
        try { impersonating = !!sessionStorage.getItem('hs_cv_id'); } catch (e) {}
        if (!impersonating) setScreen(s => COACH_RESTORABLE.has(s) ? s : 'coach');
      }
    } catch (e) {
      setBootError(true);
    } finally {
      setAuthLoading(false);
    }

    // Mark the invite claimed. The managed_clients link + data merge is handled
    // server-side by the handle_new_user trigger (it has the rights; the client
    // does not), so we only stamp the claim here.
    const pendingInvite = localStorage.getItem('pt_pending_invite');
    if (pendingInvite) {
      localStorage.removeItem('pt_pending_invite');
      await supabase
        .from('invites')
        .update({ claimed_by: userId, claimed_at: new Date().toISOString() })
        .eq('code', pendingInvite)
        .is('claimed_by', null);
    }
  };

  // Live notifications: unread badge + browser notification while open.
  React.useEffect(() => {
    if (!session) { setUnread(0); return; }
    const uid = session.user.id;
    requestNotifyPermission();
    unreadCount(uid).then(setUnread);
    const unsub = subscribeNotifications(uid, (row) => {
      setUnread(c => c + 1);
      maybeBrowserNotify(row.title, row.body);
    });
    return unsub;
  }, [session]);

  // Recount when leaving the notifications screen (it marks all read).
  React.useEffect(() => {
    if (session && screen !== 'notifications') unreadCount(session.user.id).then(setUnread);
  }, [screen, session]);

  // On (re)entering as a user, check for an interrupted workout to offer resuming.
  const resumeUid = clientViewId || session?.user?.id || null;
  React.useEffect(() => {
    if (!resumeUid) { setResumePrompt(null); return; }
    setResumePrompt(loadActiveWorkout(resumeUid));
  }, [resumeUid]);

  // First time signed in (and not already installed), offer "add to home screen".
  React.useEffect(() => {
    if (!session || isStandalone()) return;
    let seen = false;
    try { seen = !!localStorage.getItem('hs_a2hs_seen'); } catch (e) {}
    if (seen) return;
    const t = setTimeout(() => setShowInstall(true), 1400);
    return () => clearTimeout(t);
  }, [session]);

  // Tapping a push lands here: the service worker focuses the existing window
  // and posts where it was about, since a single-page app has no URL to open.
  React.useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMsg = (e) => {
      if (e.data?.type !== 'push-nav') return;
      const link = e.data.link;
      navigateRef.current?.(link?.screen || 'dashboard', link || undefined);
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, []);

  const closeInstall = () => {
    setShowInstall(false);
    try { localStorage.setItem('hs_a2hs_seen', '1'); } catch (e) {}
  };

  const navigateRef = React.useRef(null);
  const navigate = (target, opts) => {
    if (target === 'preview') {
      setScreen('workouts');
      setPreviewWorkoutId(opts?.id || 'w1');
      return;
    }
    if (target === 'clientview') {
      // Enter "assume control" mode for a client and land on the chosen screen.
      setClientViewId(opts?.clientId || null);
      setClientViewName(opts?.clientName || null);
      setScreen(opts?.screen || 'dashboard');
      setPreviewWorkoutId(null);
      return;
    }
    if (target === 'log') { setLogDayId(opts?.dayId || null); setLogResume(!!opts?.resume); setLogEdit(!!opts?.edit); }
    if (target === 'sessionresults') setResultsDayId(opts?.dayId || null);
    // While controlling a client, navigation stays in their app until the coach
    // exits (which routes to 'coach').
    if (target === 'coach') {
      setClientViewId(null);
      setClientViewName(null);
      // A notification that names a client opens straight into their file, on
      // the tab the event belongs to - a completed session lands on TRAINING, a
      // reported injury on BODY with that injury's thread already open.
      if (opts?.clientId) setCoachOpen({
        clientId: opts.clientId, tab: opts.tab || 'overview',
        injuryId: opts.injuryId || null, dayId: opts.dayId || null,
        exerciseId: opts.exerciseId || null, exercise: opts.exercise || '',
      });
    }
    setScreen(target);
    setPreviewWorkoutId(null);
  };

  // Persist the chosen theme, and follow the OS when set to "system".
  React.useEffect(() => { try { localStorage.setItem('hs_theme', theme); } catch (e) {} }, [theme]);
  React.useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const fn = (e) => setSystemDark(e.matches);
    mq.addEventListener ? mq.addEventListener('change', fn) : mq.addListener(fn);
    return () => { mq.removeEventListener ? mq.removeEventListener('change', fn) : mq.removeListener(fn); };
  }, []);

  React.useEffect(() => {
    const root = document.documentElement;
    const effective = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
    const isLight = effective === 'light';
    root.dataset.theme = effective;
    const a = ACCENTS[accent] || ACCENTS.sea;
    root.style.setProperty('--accent', a.c);
    root.style.setProperty('--accent-soft', isLight
      ? a.soft.replace(/0\.16\)/, '0.13)')
      : a.soft);
    root.style.setProperty('--accent-glow', isLight
      ? a.glow.replace(/0\.45\)/, '0.32)').replace(/0\.40\)/, '0.28)')
      : a.glow);
    root.style.setProperty('--on-accent', a.on);
    if (!isLight) {
      const bgPreset = BG_PRESETS[bg] || BG_PRESETS.charcoal;
      Object.entries(bgPreset).forEach(([k, v]) => root.style.setProperty(k, v));
    } else {
      ['--bg-0', '--bg-1', '--bg-2', '--bg-3'].forEach(k => root.style.removeProperty(k));
    }
    root.style.setProperty('--type-intensity', typeIntensity);
    root.style.setProperty('--glow', glow);
    const d = DENSITY[density] || DENSITY.balanced;
    root.style.setProperty('--density-pad', d.pad + 'px');
    root.style.setProperty('--density-gap', d.gap + 'px');
    root.style.setProperty('--radius', d.radius + 'px');
  }, [theme, systemDark, accent, bg, typeIntensity, density, glow]);

  if (authLoading) return <LoadingScreen />;
  if (bootError && !profile) return <BootError onRetry={() => window.location.reload()} />;
  if (!session) return <Login />;
  if (needsPassword) return (
    <SetPassword
      onDone={() => {
        try { sessionStorage.removeItem('hs_set_pw'); } catch (e) {}
        if (window.location.hash) { try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) {} }
        setNeedsPassword(false);
      }}
      onSignOut={() => { try { sessionStorage.removeItem('hs_set_pw'); } catch (e) {} supabase.auth.signOut(); }}
    />
  );

  const isTrainer = profile?.role === 'trainer';
  const user = {
    name: profile?.name || session.user.email.split('@')[0],
    email: session.user.email,
    dob: profile?.date_of_birth || '',
  };

  const activeUserId = clientViewId || session.user.id;
  const homeScreen = isTrainer ? 'coach' : 'dashboard';
  // "Assume control": while controlling a client, render the CLIENT app
  // (their nav + their data) regardless of the coach's own role.
  const impersonating = !!clientViewId;
  const navIsTrainer = isTrainer && !impersonating;
  const dashUser = impersonating ? { name: clientViewName || 'Client', email: '', dob: '' } : user;
  // The bottom nav stays accessible everywhere except the immersive workout
  // logger (where the session player owns the full screen).
  const showNav = screen !== 'log';

  navigateRef.current = navigate;

  const exitClientView = () => { setClientViewId(null); setClientViewName(null); navigate('coach'); };
  // From the assume-control view, jump straight to this client's admin settings.
  const openClientSettings = () => {
    const cid = clientViewId;
    if (!cid) return;
    setCoachOpen({ clientId: cid, tab: 'settings' });
    exitClientView();
  };

  let ScreenEl;
  if (screen === 'workouts')        ScreenEl = <Workouts go={navigate} openPreview={previewWorkoutId} userId={activeUserId}/>;
  else if (screen === 'log')        ScreenEl = <ActiveLog go={navigate} dayId={logDayId} userId={activeUserId} resume={logResume} edit={logEdit} onExitClientView={impersonating ? exitClientView : undefined}/>;
  else if (screen === 'progress')   ScreenEl = <Progress go={navigate} userId={activeUserId}/>;
  else if (screen === 'body')       ScreenEl = <Body go={navigate} userId={activeUserId} trainerId={impersonating ? session.user.id : profile?.trainer_id}/>;
  else if (screen === 'resources')  ScreenEl = <Resources go={navigate} userId={session.user.id} isTrainer={navIsTrainer}/>;
  else if (screen === 'coach')      ScreenEl = <Coach go={navigate} trainerId={session.user.id} unread={unread} openTarget={coachOpen} onOpenConsumed={() => setCoachOpen(null)}/>;
  else if (screen === 'programmes') ScreenEl = <Coach go={navigate} trainerId={session.user.id} only="programmes"/>;
  else if (screen === 'exercises')  ScreenEl = <Exercises trainerId={session.user.id}/>;
  else if (screen === 'forms')      ScreenEl = <Forms trainerId={session.user.id}/>;
  else if (screen === 'notifications') ScreenEl = <Notifications go={navigate} userId={session.user.id} home={homeScreen}/>;
  else if (screen === 'sessionresults') ScreenEl = (
    <SessionResults dayId={resultsDayId} userId={activeUserId} go={navigate} onClose={() => navigate('dashboard')}/>
  );
  else if (screen === 'profile') ScreenEl = (
    <Profile
      go={navigate}
      user={user}
      profile={profile}
      home={homeScreen}
      onSave={async (u) => {
        await supabase.from('profiles')
          .update({ name: u.name, date_of_birth: u.dob || null })
          .eq('id', session.user.id);
        setProfile(p => ({ ...p, name: u.name, date_of_birth: u.dob }));
      }}
      theme={theme}
      onThemeChange={setTheme}
      onLogout={() => supabase.auth.signOut()}
    />
  );
  else ScreenEl = <Dashboard go={navigate} user={dashUser} userId={activeUserId} impersonating={impersonating} unread={unread} onClientSettings={impersonating ? openClientSettings : undefined}/>;

  return (
    <div data-role={navIsTrainer ? 'trainer' : 'client'} className="app-shell" style={{
      width: '100%', height: 'var(--app-vh, 100dvh)',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', monospace",
      background: 'var(--bg-1)',
      color: 'var(--text)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* A flex column, so the screen inside takes its height from flex rather
          than from a percentage of this box - see the note on .scroller. */}
      <div key={screen} className="screen-enter" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        <ErrorBoundary key={screen} onHome={() => navigate(homeScreen)}>
          <React.Suspense fallback={
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
              <HexLoader size={96}/>
            </div>
          }>
            {ScreenEl}
          </React.Suspense>
        </ErrorBoundary>
      </div>
      {showNav && <BottomNav screen={screen} go={navigate} isTrainer={navIsTrainer} impersonating={impersonating} onExitClientView={exitClientView}/>}

      {resumePrompt && screen !== 'log' && (
        <ResumeWorkoutPrompt
          snap={resumePrompt}
          onResume={() => { const s = resumePrompt; setResumePrompt(null); navigate('log', { dayId: s.dayId, resume: true }); }}
          onDiscard={() => { clearActiveWorkout(resumeUid); setResumePrompt(null); }}
        />
      )}

      {showInstall && !resumePrompt && screen !== 'log' && <InstallPrompt onClose={closeInstall}/>}

      {showSplash && <SignInSplash onDone={() => setShowSplash(false)} />}

      <ToastHost />
    </div>
  );
}

// Console-style boot splash after an active sign-in: the brand hex blooms in
// from a blur, the wordmark tracks in, then the overlay fades and unmounts.
function SignInSplash({ onDone }) {
  React.useEffect(() => {
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div onClick={onDone} style={{
      position: 'fixed', inset: 0, zIndex: 600, background: 'var(--bg-0)',
      display: 'grid', placeItems: 'center',
      animation: 'splashOut 2.4s ease forwards',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <div style={{
          animation: 'splashLogo 1.1s cubic-bezier(.22,.61,.36,1) both',
          filter: 'drop-shadow(0 0 calc(22px * var(--glow)) var(--accent-glow))',
        }}>
          <img src="/logo-mark.png" alt="HS PT" width={104} style={{ display: 'block', height: 'auto' }} />
        </div>
        <div style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 22, letterSpacing: '0.06em', color: '#189caa', animation: 'splashText .9s cubic-bezier(.22,.61,.36,1) .4s both' }}>
          HS PT
        </div>
        <div className="mono" style={{ fontSize: 9.5, letterSpacing: '0.3em', color: 'var(--text-3)', animation: 'splashSub .7s ease .9s both' }}>
          WELCOME BACK
        </div>
      </div>
    </div>
  );
}

function ResumeWorkoutPrompt({ snap, onResume, onDiscard }) {
  const setsDone = (snap.exercises || []).reduce((n, e) => n + (e.sets || []).filter(s => s.done).length, 0);
  const secs = snap.sessionTime || 0;
  const elapsed = `${Math.floor(secs / 60)}m`;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(6,10,12,0.66)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', padding: 28, animation: 'fadeIn .15s ease' }}>
      <div className="card" style={{ width: '100%', maxWidth: 320, padding: 22, textAlign: 'center', background: 'var(--bg-2)' }}>
        <div style={{ margin: '0 auto 14px', display: 'grid', placeItems: 'center' }}>
          <BrandIcon name="Hourglass" size={62} color="var(--accent)" glow/>
        </div>
        <div className="h-bold" style={{ fontSize: 19, marginBottom: 8 }}>CONTINUE YOUR WORKOUT?</div>
        <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.55, marginBottom: 18 }}>
          You have a session in progress{setsDone > 0 ? <> - <strong style={{ color: 'var(--text)' }}>{setsDone} set{setsDone === 1 ? '' : 's'}</strong> logged, {elapsed} in</> : ''}. Pick up where you left off?
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <button onClick={onResume} className="btn-primary" style={{ width: '100%', color: 'var(--heading-deep)' }}>RESUME WORKOUT</button>
          <button onClick={onDiscard} className="btn-ghost" style={{ width: '100%', color: 'var(--c-coral)', borderColor: 'color-mix(in srgb, var(--c-coral) 40%, var(--line-strong))' }}>DISCARD</button>
        </div>
      </div>
    </div>
  );
}

function BottomNav({ screen, go, isTrainer, impersonating, onExitClientView }) {
  const items = isTrainer ? [
    { id: 'coach',      label: 'COACH',     brand: 'Hub' },
    { id: 'programmes', label: 'BUILD',     brand: 'Calendar' },
    { id: 'exercises',  label: 'EXERCISES', brand: 'Dumbbell' },
    { id: 'forms',      label: 'FORMS',     brand: 'Checklist' },
    { id: 'resources',  label: 'RESOURCES', brand: 'Resources' },
  ] : [
    { id: 'dashboard', label: 'HOME',     brand: 'Home' },
    { id: 'workouts',  label: 'TRAIN',    brand: 'Calendar' },
    { id: 'progress',  label: 'PROGRESS', brand: 'Graph (Ascending)' },
    { id: 'resources', label: 'LIBRARY',  brand: 'Book' },
    { id: 'body',      label: 'HEATMAP',  brand: 'Flexed Bicep' },
  ];

  return (
    <div className="bnav">
      {/* Brand header - only visible in the desktop sidebar layout */}
      <div className="bnav-brand">
        <img src="/logo-mark.png" alt="HS PT" width={38} style={{ display: 'block', height: 'auto', flexShrink: 0 }} />
        <div>
          <div className="h-bold" style={{ fontSize: 13, lineHeight: 1.1, color: 'var(--heading-deep)' }}>HS PT</div>
          <div className="mono" style={{ fontSize: 7.5, letterSpacing: '0.16em', color: 'var(--text-3)', marginTop: 2 }}>COACH PORTAL</div>
        </div>
      </div>
      {items.map(it => {
        const active = screen === it.id;
        return (
          <button key={it.id} className={active ? 'active' : ''} onClick={() => go(it.id)}>
            <div style={{
              position: 'relative', height: 32, width: 38,
              display: 'grid', placeItems: 'center', marginBottom: 2,
            }}>
              <BrandIcon name={it.brand} size={30} glow={active}
                color={active ? 'var(--accent)' : 'var(--text-3)'} />
            </div>
            <span>{it.label}</span>
          </button>
        );
      })}
      {/* The way back out of a client's app. This replaced a banner pinned
          across the top of every screen, which ate a strip of the viewport
          for something needed once per visit. */}
      {impersonating && (
        <button onClick={onExitClientView} style={{ color: 'var(--c-amber)' }}>
          <div style={{ position: 'relative', height: 32, width: 38, display: 'grid', placeItems: 'center', marginBottom: 2 }}>
            <IconX2 size={22} />
          </div>
          <span>EXIT</span>
        </button>
      )}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100dvh', display: 'grid', placeItems: 'center',
      background: 'var(--bg-0)',
    }}>
      <HexLoader size={116} label="Loading" />
    </div>
  );
}

function BootError({ onRetry }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--bg-0)', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, opacity: 0.85 }}>
          <HexShape size={40} fill="var(--c-amber)" />
        </div>
        <div className="h-bold" style={{ fontSize: 18, color: 'var(--heading-deep)', marginBottom: 8 }}>CAN’T REACH THE SERVER</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 20 }}>
          The backend may be waking up (free-tier projects pause after inactivity). Give it a few seconds, then retry.
        </div>
        <button onClick={onRetry} className="btn-primary" style={{ padding: '12px 22px' }}>RETRY</button>
      </div>
    </div>
  );
}
