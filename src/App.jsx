import React from 'react'
import { supabase } from './lib/supabase'
import { HexShape } from './components/hex'
import { IconHome, IconCalendar, IconChart, IconBook, IconUser, IconBolt, IconActivity, IconDumbbell, IconDoc, IconPlay } from './components/icons'
import { Login, SetPassword } from './screens/Login'
import { Dashboard } from './screens/Dashboard'
import { Workouts } from './screens/Workouts'
import { ActiveLog } from './screens/ActiveLog'
import { Progress } from './screens/Progress'
import { Resources } from './screens/Resources'
import { Profile } from './screens/Profile'
import { Notifications } from './screens/Notifications'
import { Coach } from './screens/Coach'
import { Body } from './screens/Body'
import { Exercises } from './screens/Exercises'
import { Forms } from './screens/Forms'
import { SessionResults } from './screens/ActiveLog'
import { unreadCount, subscribeNotifications, maybeBrowserNotify, requestNotifyPermission } from './lib/notifications'
import { loadActiveWorkout, clearActiveWorkout } from './lib/activeWorkout'
import { InstallPrompt } from './screens/InstallPrompt'
import { isStandalone } from './lib/installPrompt'
import { ToastHost } from './lib/toast'

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
  const [screen, setScreen] = React.useState('dashboard');
  const [previewWorkoutId, setPreviewWorkoutId] = React.useState(null);
  const [logDayId, setLogDayId] = React.useState(null);
  const [logResume, setLogResume] = React.useState(false);
  const [resumePrompt, setResumePrompt] = React.useState(null);
  const [showInstall, setShowInstall] = React.useState(false);
  const [resultsDayId, setResultsDayId] = React.useState(null);
  const [clientViewId, setClientViewId] = React.useState(null);
  const [clientViewName, setClientViewName] = React.useState(null);

  // Auth state
  const [session, setSession] = React.useState(null);
  const [profile, setProfile] = React.useState(null);
  const [authLoading, setAuthLoading] = React.useState(true);
  const [bootError, setBootError] = React.useState(false);
  // Invite / password-recovery email links land here with a session but no
  // usable password — force a set-password step. Captured from the URL hash
  // before supabase-js consumes it, and persisted across that processing.
  const [needsPassword, setNeedsPassword] = React.useState(() => {
    try {
      const h = window.location.hash || '';
      if (/type=(invite|recovery)/.test(h)) sessionStorage.setItem('hs_set_pw', '1');
      return sessionStorage.getItem('hs_set_pw') === '1';
    } catch (e) { return false; }
  });
  const [unread, setUnread] = React.useState(0);

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
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else { setProfile(null); setAuthLoading(false); setNeedsPassword(false); }
    });

    // Watchdog — never hang forever if the backend is paused/unreachable.
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
      // Coaches land on the Coach hub (no client homepage in their nav).
      if (data?.role === 'trainer') setScreen(s => s === 'dashboard' ? 'coach' : s);
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

  const closeInstall = () => {
    setShowInstall(false);
    try { localStorage.setItem('hs_a2hs_seen', '1'); } catch (e) {}
  };

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
    if (target === 'log') { setLogDayId(opts?.dayId || null); setLogResume(!!opts?.resume); }
    if (target === 'sessionresults') setResultsDayId(opts?.dayId || null);
    // While controlling a client, navigation stays in their app until the coach
    // exits (which routes to 'coach').
    if (target === 'coach') {
      setClientViewId(null);
      setClientViewName(null);
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

  let ScreenEl;
  if (screen === 'workouts')        ScreenEl = <Workouts go={navigate} openPreview={previewWorkoutId} userId={activeUserId}/>;
  else if (screen === 'log')        ScreenEl = <ActiveLog go={navigate} dayId={logDayId} userId={activeUserId} resume={logResume}/>;
  else if (screen === 'progress')   ScreenEl = <Progress go={navigate} userId={activeUserId}/>;
  else if (screen === 'body')       ScreenEl = <Body go={navigate} userId={activeUserId} trainerId={impersonating ? session.user.id : profile?.trainer_id}/>;
  else if (screen === 'resources')  ScreenEl = <Resources go={navigate} userId={session.user.id} isTrainer={navIsTrainer}/>;
  else if (screen === 'coach')      ScreenEl = <Coach go={navigate} trainerId={session.user.id} unread={unread}/>;
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
  else ScreenEl = <Dashboard go={navigate} user={dashUser} userId={activeUserId} impersonating={impersonating} unread={unread}/>;

  const exitClientView = () => { setClientViewId(null); setClientViewName(null); navigate('coach'); };

  return (
    <div data-role={navIsTrainer ? 'trainer' : 'client'} style={{
      width: '100%', height: '100dvh',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', monospace",
      background: 'var(--bg-1)',
      color: 'var(--text)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {clientViewId && (
        <div onClick={exitClientView} style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 300, minHeight: 44,
          paddingTop: 'env(safe-area-inset-top)', cursor: 'pointer',
          background: `color-mix(in srgb, var(--c-amber) 22%, var(--bg-0))`,
          borderBottom: '1px solid color-mix(in srgb, var(--c-amber) 55%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 14px',
        }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--c-amber)', fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ◉ VIEWING {clientViewName?.toUpperCase() || 'CLIENT'}'S APP
          </div>
          <span className="mono" style={{
            flexShrink: 0, fontSize: 10, letterSpacing: '0.1em',
            color: 'var(--on-accent)', fontWeight: 800, padding: '7px 14px', marginLeft: 10,
            background: 'var(--c-amber)', borderRadius: 8,
          }}>✕ EXIT</span>
        </div>
      )}
      <div key={screen} className="screen-enter" style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', marginTop: clientViewId ? 48 : 0 }}>
        {ScreenEl}
      </div>
      {showNav && <BottomNav screen={screen} go={navigate} isTrainer={navIsTrainer}/>}

      {resumePrompt && screen !== 'log' && (
        <ResumeWorkoutPrompt
          snap={resumePrompt}
          onResume={() => { const s = resumePrompt; setResumePrompt(null); navigate('log', { dayId: s.dayId, resume: true }); }}
          onDiscard={() => { clearActiveWorkout(resumeUid); setResumePrompt(null); }}
        />
      )}

      {showInstall && !resumePrompt && screen !== 'log' && <InstallPrompt onClose={closeInstall}/>}

      <ToastHost />
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
        <div style={{ width: 46, height: 46, borderRadius: 12, margin: '0 auto 14px', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', border: '1px solid var(--accent)', color: 'var(--accent)' }}>
          <IconPlay size={20}/>
        </div>
        <div className="h-bold" style={{ fontSize: 19, marginBottom: 8 }}>CONTINUE YOUR WORKOUT?</div>
        <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.55, marginBottom: 18 }}>
          You have a session in progress{setsDone > 0 ? <> — <strong style={{ color: 'var(--text)' }}>{setsDone} set{setsDone === 1 ? '' : 's'}</strong> logged, {elapsed} in</> : ''}. Pick up where you left off?
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <button onClick={onResume} className="btn-primary" style={{ width: '100%', color: 'var(--heading-deep)' }}>RESUME WORKOUT</button>
          <button onClick={onDiscard} className="btn-ghost" style={{ width: '100%', color: 'var(--c-coral)', borderColor: 'color-mix(in srgb, var(--c-coral) 40%, var(--line-strong))' }}>DISCARD</button>
        </div>
      </div>
    </div>
  );
}

function BottomNav({ screen, go, isTrainer }) {
  const items = isTrainer ? [
    { id: 'coach',      label: 'COACH',     Icon: IconBolt },
    { id: 'programmes', label: 'BUILD',     Icon: IconCalendar },
    { id: 'exercises',  label: 'EXERCISES', Icon: IconDumbbell },
    { id: 'forms',      label: 'FORMS',     Icon: IconDoc },
    { id: 'resources',  label: 'RECIPES',   Icon: IconBook },
  ] : [
    { id: 'dashboard', label: 'HOME',     Icon: IconHome },
    { id: 'workouts',  label: 'TRAIN',    Icon: IconCalendar },
    { id: 'progress',  label: 'PROGRESS', Icon: IconChart },
    { id: 'resources', label: 'LIBRARY',  Icon: IconBook },
    { id: 'body',      label: 'BODY',     Icon: IconActivity },
  ];

  return (
    <div className="bnav">
      {items.map(it => {
        const active = screen === it.id;
        return (
          <button key={it.id} className={active ? 'active' : ''} onClick={() => go(it.id)}>
            <div style={{
              position: 'relative', height: 32, width: 38,
              display: 'grid', placeItems: 'center', marginBottom: 2,
            }}>
              {active && (
                <HexShape size={30} fill="var(--accent-soft)"
                  stroke="var(--accent-2)" strokeWidth={13}
                  style={{
                    position: 'absolute', left: '50%', top: '50%',
                    transform: 'translate(-50%, -50%)',
                    filter: 'drop-shadow(0 0 calc(9px * var(--glow)) var(--accent-glow))',
                  }}/>
              )}
              <it.Icon size={18} style={{ position: 'relative' }}/>
            </div>
            <span>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100dvh', display: 'grid', placeItems: 'center',
      background: 'var(--bg-0)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          display: 'flex', justifyContent: 'center', marginBottom: 14,
          filter: 'drop-shadow(0 0 calc(18px * var(--glow)) var(--accent-glow))',
          opacity: 0.8,
        }}>
          <HexShape size={38} fill="var(--accent)" />
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.2em' }}>
          LOADING…
        </div>
      </div>
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
