import React from 'react'
import { supabase } from './lib/supabase'
import { ACTIVE_EXERCISES } from './data/index'
import { HexShape } from './components/hex'
import { IconHome, IconCalendar, IconChart, IconBook, IconUser, IconBolt } from './components/icons'
import { Login } from './screens/Login'
import { Dashboard } from './screens/Dashboard'
import { Workouts } from './screens/Workouts'
import { ActiveLog } from './screens/ActiveLog'
import { Progress } from './screens/Progress'
import { Resources } from './screens/Resources'
import { Profile } from './screens/Profile'
import { Notifications } from './screens/Notifications'
import { Coach } from './screens/Coach'
import { SessionComplete } from './screens/ActiveLog'

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
  const [theme, setTheme] = React.useState('light');
  const [accent] = React.useState('sea');
  const [bg] = React.useState('charcoal');
  const [typeIntensity] = React.useState(1);
  const [density] = React.useState('balanced');
  const [glow] = React.useState(1);
  const [screen, setScreen] = React.useState('dashboard');
  const [previewWorkoutId, setPreviewWorkoutId] = React.useState(null);
  const [logDayId, setLogDayId] = React.useState(null);
  const [clientViewId, setClientViewId] = React.useState(null);
  const [clientViewName, setClientViewName] = React.useState(null);

  // Auth state
  const [session, setSession] = React.useState(null);
  const [profile, setProfile] = React.useState(null);
  const [authLoading, setAuthLoading] = React.useState(true);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else { setProfile(null); setAuthLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(data);
    setAuthLoading(false);

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

  const navigate = (target, opts) => {
    if (target === 'preview') {
      setScreen('workouts');
      setPreviewWorkoutId(opts?.id || 'w1');
      return;
    }
    if (target === 'clientview') {
      setClientViewId(opts?.clientId || null);
      setClientViewName(opts?.clientName || null);
      setScreen('workouts');
      setPreviewWorkoutId(null);
      return;
    }
    if (target === 'log') setLogDayId(opts?.dayId || null);
    if (!['workouts', 'log'].includes(target)) {
      setClientViewId(null);
      setClientViewName(null);
    }
    setScreen(target);
    setPreviewWorkoutId(null);
  };

  React.useEffect(() => {
    const root = document.documentElement;
    const isLight = theme === 'light';
    root.dataset.theme = theme || 'dark';
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
  }, [theme, accent, bg, typeIntensity, density, glow]);

  if (authLoading) return <LoadingScreen />;
  if (!session) return <Login />;

  const isTrainer = profile?.role === 'trainer';
  const user = {
    name: profile?.name || session.user.email.split('@')[0],
    email: session.user.email,
    dob: profile?.date_of_birth || '',
  };

  const showNav = !['log', 'notifications', 'sessionresults'].includes(screen);
  const activeUserId = clientViewId || session.user.id;

  let ScreenEl;
  if (screen === 'workouts')        ScreenEl = <Workouts go={navigate} openPreview={previewWorkoutId} userId={activeUserId}/>;
  else if (screen === 'log')        ScreenEl = <ActiveLog go={navigate} dayId={logDayId} userId={activeUserId}/>;
  else if (screen === 'progress')   ScreenEl = <Progress go={navigate} userId={session.user.id}/>;
  else if (screen === 'resources')  ScreenEl = <Resources go={navigate}/>;
  else if (screen === 'coach')      ScreenEl = <Coach go={navigate} trainerId={session.user.id}/>;
  else if (screen === 'notifications') ScreenEl = <Notifications go={navigate}/>;
  else if (screen === 'sessionresults') ScreenEl = (
    <SessionComplete exercises={ACTIVE_EXERCISES} sessionTime={2820} go={navigate} onClose={() => navigate('dashboard')}/>
  );
  else if (screen === 'profile') ScreenEl = (
    <Profile
      go={navigate}
      user={user}
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
  else ScreenEl = <Dashboard go={navigate} user={user} userId={session.user.id}/>;

  const exitClientView = () => { setClientViewId(null); setClientViewName(null); navigate('coach'); };

  return (
    <div data-role={isTrainer ? 'trainer' : 'client'} style={{
      width: '100%', minHeight: '100dvh',
      fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', monospace",
      background: 'var(--bg-1)',
      color: 'var(--text)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {clientViewId && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: 36,
          background: `color-mix(in srgb, var(--c-amber) 14%, var(--bg-0))`,
          borderBottom: '1px solid color-mix(in srgb, var(--c-amber) 45%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px',
        }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--c-amber)', fontWeight: 700 }}>
            ◉ TRAINING AS {clientViewName?.toUpperCase() || 'CLIENT'}
          </div>
          <button onClick={exitClientView} className="mono" style={{
            all: 'unset', cursor: 'pointer', fontSize: 9, letterSpacing: '0.12em',
            color: 'var(--c-amber)', fontWeight: 700, padding: '3px 8px',
            border: '1px solid color-mix(in srgb, var(--c-amber) 60%, transparent)', borderRadius: 6,
          }}>EXIT</button>
        </div>
      )}
      <div style={{ marginTop: clientViewId ? 36 : 0 }}>
        {ScreenEl}
      </div>
      {showNav && <BottomNav screen={screen} go={navigate} isTrainer={isTrainer}/>}
    </div>
  );
}

function BottomNav({ screen, go, isTrainer }) {
  const items = isTrainer ? [
    { id: 'dashboard', label: 'HOME',     Icon: IconHome },
    { id: 'coach',     label: 'COACH',    Icon: IconBolt },
    { id: 'progress',  label: 'PROGRESS', Icon: IconChart },
    { id: 'resources', label: 'LIBRARY',  Icon: IconBook },
    { id: 'profile',   label: 'PROFILE',  Icon: IconUser },
  ] : [
    { id: 'dashboard', label: 'HOME',     Icon: IconHome },
    { id: 'workouts',  label: 'TRAIN',    Icon: IconCalendar },
    { id: 'progress',  label: 'PROGRESS', Icon: IconChart },
    { id: 'resources', label: 'LIBRARY',  Icon: IconBook },
    { id: 'profile',   label: 'PROFILE',  Icon: IconUser },
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
