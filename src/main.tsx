import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Hexagon, LogOut, Shield, Building2 } from 'lucide-react';
import './style.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const db = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

type Business = {
  id: string;
  business_name: string;
  logo_url: string | null;
  primary_color: string | null;
};

type SessionUser = { id: string; email?: string };

function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!db) { setAuthReady(true); return; }
    let active = true;
    db.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage(error.message);
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    const { data: { subscription } } = db.auth.onAuthStateChange((_event, session) => {
      if (active) { setUser(session?.user ?? null); setAuthReady(true); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!db || !user) {
      setIsPlatformAdmin(false);
      setBusinesses([]);
      return;
    }
    let active = true;
    setLoadingRoles(true);
    setMessage('');
    (async () => {
      try {
        const [platformResult, membershipResult] = await Promise.all([
          db.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
          db.from('business_admins').select('business_id').eq('user_id', user.id),
        ]);
        if (platformResult.error) throw platformResult.error;
        if (membershipResult.error) throw membershipResult.error;
        const ids = [...new Set((membershipResult.data ?? []).map(row => row.business_id))];
        let assignedBusinesses: Business[] = [];
        if (ids.length) {
          const result = await db.from('businesses')
            .select('id,business_name,logo_url,primary_color')
            .in('id', ids)
            .order('business_name');
          if (result.error) throw result.error;
          assignedBusinesses = result.data ?? [];
        }
        if (active) {
          setIsPlatformAdmin(Boolean(platformResult.data));
          setBusinesses(assignedBusinesses);
          if (ids.length !== assignedBusinesses.length) {
            setMessage('Some assigned businesses could not be loaded. Check business read permissions.');
          }
        }
      } catch (error) {
        if (active) setMessage('Could not load administrator access: ' + (error instanceof Error ? error.message : String(error)));
      } finally {
        if (active) setLoadingRoles(false);
      }
    })();
    return () => { active = false; };
  }, [user?.id]);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db) return;
    setBusy(true);
    setMessage('');
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
    setBusy(false);
  }

  async function signOut() {
    if (!db) return;
    setBusy(true);
    const { error } = await db.auth.signOut();
    if (error) setMessage(error.message);
    setBusy(false);
  }

  return (
    <main style={{ '--accent': '#efb83e' } as React.CSSProperties}>
      <div className="shell">
        <header>
          <div className="brand"><Hexagon size={30} /><strong>Time<span>Hive</span></strong></div>
          {user && <button className="textbtn" onClick={signOut} disabled={busy}><LogOut size={17} /> Sign out</button>}
        </header>
        {!db ? (
          <section className="panel"><h2>TimeHive configuration needed</h2><p>Check your Vercel Supabase environment variables.</p></section>
        ) : !authReady ? (
          <section className="panel"><h2>Loading TimeHive...</h2></section>
        ) : !user ? (
          <section className="panel">
            <div className="eyebrow">WELCOME TO THE HIVE</div>
            <h1>Welcome back.</h1>
            <p>Sign in to your TimeHive account.</p>
            <form onSubmit={signIn}>
              <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
              <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
              <button className="primary" disabled={busy}>Sign in</button>
            </form>
          </section>
        ) : (
          <>
            <section className="panel">
              <div className="eyebrow">TIMEHIVE ADMINISTRATION</div>
              <h1>Welcome to the hive.</h1>
              <p>Signed in as {user.email ?? 'your account'}</p>
              {loadingRoles ? <p>Checking your access...</p> : (
                <>
                  {isPlatformAdmin && <div className="info"><span><Shield size={17} /> Platform administrator</span><strong>Verified</strong></div>}
                  <h2><Building2 size={21} /> Your businesses</h2>
                  {businesses.length ? businesses.map(business => (
                    <div className="info" key={business.id}>
                      <span>{business.logo_url ? <img src={business.logo_url} alt="" width={32} height={32} /> : <Building2 size={20} />}</span>
                      <strong>{business.business_name}</strong>
                    </div>
                  )) : <p>No business administrator assignments found.</p>}
                  {!isPlatformAdmin && businesses.length === 0 && <p>No administrator access is assigned to this account.</p>}
                  <p className="footer">Read-only preview. Employee management and clock-ins are not enabled yet.</p>
                </>
              )}
            </section>
          </>
        )}
        {message && <p className="status" role="status">{message}</p>}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
