import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Hexagon, LogOut, Shield, Building2, ArrowLeft, Users, Clock3, Settings, LayoutDashboard, ChevronRight, MapPin } from 'lucide-react';
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
type Employee = { id: string; business_id: string; employee_number: string; full_name: string; email: string | null; is_active: boolean; created_at: string };
type SessionUser = { id: string; email?: string };
type WorkspaceTab = 'overview' | 'employees' | 'time' | 'settings';

const gold = '#efb83e';
const cardStyle: React.CSSProperties = { border: '1px solid #384253', borderRadius: 16, padding: 20, background: '#232b38' };
const navStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, padding: '12px 15px', borderRadius: 10, cursor: 'pointer', font: 'inherit', textAlign: 'left' };

function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>('overview');
  const [message, setMessage] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeeError, setEmployeeError] = useState('');
  const [addingEmployee, setAddingEmployee] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [invitingEmployeeId, setInvitingEmployeeId] = useState<string | null>(null);
  const [invitationNotice, setInvitationNotice] = useState('');

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
      setSelectedBusinessId(null);
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
            .in('id', ids).order('business_name');
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

  useEffect(() => {
    if (!db || !user || !selectedBusinessId || tab !== 'employees' || !businesses.some(b => b.id === selectedBusinessId)) return;
    let active = true;
    setEmployeesLoading(true);
    setEmployeeError('');
    db.from('employees').select('id,business_id,employee_number,full_name,email,is_active,created_at')
      .eq('business_id', selectedBusinessId).order('full_name')
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { setEmployeeError(error.message); setEmployees([]); }
        else setEmployees(data ?? []);
        setEmployeesLoading(false);
      });
    return () => { active = false; };
  }, [user?.id, selectedBusinessId, tab, businesses]);

  async function addEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !selectedBusiness || savingEmployee) return;
    setSavingEmployee(true);
    setEmployeeError('');
    const { data, error } = await db.from('employees').insert({
      business_id: selectedBusiness.id,
      employee_number: employeeNumber.trim(),
      full_name: employeeName.trim(),
      email: employeeEmail.trim() || null,
      is_active: true,
    }).select('id,business_id,employee_number,full_name,email,is_active,created_at').single();
    if (error) setEmployeeError(error.message + ' — Check the employee RLS setup instructions.');
    else if (data) {
      setEmployees(current => [...current, data].sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setEmployeeName(''); setEmployeeNumber(''); setEmployeeEmail(''); setAddingEmployee(false);
    }
    setSavingEmployee(false);
  }

  async function sendEmployeeInvitation(employee: Employee) {
    if (!db || invitingEmployeeId) return;
    setInvitingEmployeeId(employee.id);
    setEmployeeError('');
    setInvitationNotice('');
    try {
      const { data: sessionData, error: sessionError } = await db.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) throw new Error('Please sign in again before sending invitations.');
      const { data, error } = await db.functions.invoke('invite-employee', {
        body: { employee_id: employee.id },
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      });
      if (error) {
        let detail = error.message;
        const response = (error as { context?: Response }).context;
        if (response && typeof response.json === 'function') {
          try { const payload = await response.json(); detail = payload?.error || detail; } catch { /* keep original error */ }
        }
        throw new Error(detail);
      }
      if (!data?.success) throw new Error(data?.error || 'Invitation was not confirmed.');
      setInvitationNotice(`Invitation requested for ${employee.full_name}. Check their inbox.`);
    } catch (error) {
      setEmployeeError(error instanceof Error ? error.message : String(error));
    } finally {
      setInvitingEmployeeId(null);
    }
  }

  const selectedBusiness = businesses.find(b => b.id === selectedBusinessId) ?? null;

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db) return;
    setBusy(true); setMessage('');
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

  function openBusiness(id: string) {
    setSelectedBusinessId(id);
    setTab('overview');
  }

  const tabs: { id: WorkspaceTab; label: string; Icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
    { id: 'employees', label: 'Employees', Icon: Users },
    { id: 'time', label: 'Time records', Icon: Clock3 },
    { id: 'settings', label: 'Business settings', Icon: Settings },
  ];

  return (
    <main style={{ '--accent': gold } as React.CSSProperties}>
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
        ) : loadingRoles ? (
          <section className="panel"><h2>Checking your access...</h2></section>
        ) : selectedBusiness ? (
          <section className="panel" style={{ maxWidth: 1050 }}>
            <button className="textbtn" onClick={() => setSelectedBusinessId(null)} style={{ marginBottom: 18 }}><ArrowLeft size={17} /> All businesses</button>
            <div className="eyebrow">BUSINESS WORKSPACE</div>
            <h1 style={{ marginBottom: 8 }}>{selectedBusiness.business_name}</h1>
            <p>Manage this business from one place.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '26px 0' }} role="navigation" aria-label="Business workspace">
              {tabs.map(({ id, label, Icon }) => (
                <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
                  style={{ ...navStyle, background: tab === id ? gold : '#293241', color: tab === id ? '#1d2430' : '#e6e9ef', border: '1px solid #485161', fontWeight: tab === id ? 700 : 500 }}>
                  <Icon size={17} /> {label}
                </button>
              ))}
            </div>
            {tab === 'overview' && (
              <div style={{ display: 'grid', gap: 16 }}>
                <div style={cardStyle}>
                  <h2 style={{ marginTop: 0 }}>Business overview</h2>
                  <p>{selectedBusiness.business_name} is connected to your TimeHive administrator account.</p>
                  <div className="info"><span><Shield size={17} /> Your access</span><strong>Business administrator</strong></div>
                  <div className="info"><span><MapPin size={17} /> Clock-in model</span><strong>Mobile / anywhere (planned)</strong></div>
                </div>
                <div style={cardStyle}>
                  <h2 style={{ marginTop: 0 }}>Next up</h2>
                  <p>Employee onboarding, secure GPS clock-ins and time reports will be enabled in later updates after database permissions and server-side time recording are verified.</p>
                </div>
              </div>
            )}
            {tab === 'employees' && (
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div><h2 style={{ margin: 0 }}><Users size={21} /> Employees</h2><p style={{ marginBottom: 0 }}>Employee directory for {selectedBusiness.business_name}</p></div>
                  <button type="button" className="primary" onClick={() => { setAddingEmployee(v => !v); setEmployeeError(''); }}>
                    {addingEmployee ? 'Cancel' : '+ Add employee'}
                  </button>
                </div>
                {addingEmployee && <form onSubmit={addEmployee} style={{ marginTop: 20, display: 'grid', gap: 12 }}>
                  <label>Full name<input required maxLength={120} value={employeeName} onChange={e => setEmployeeName(e.target.value)} /></label>
                  <label>Employee number<input required maxLength={50} value={employeeNumber} onChange={e => setEmployeeNumber(e.target.value)} /></label>
                  <label>Email (optional)<input type="email" maxLength={254} value={employeeEmail} onChange={e => setEmployeeEmail(e.target.value)} /></label>
                  <button className="primary" disabled={savingEmployee || !employeeName.trim() || !employeeNumber.trim()}>{savingEmployee ? 'Saving…' : 'Save employee'}</button>
                  <p className="footer">This creates a staff record. Use Send invitation beside the employee to test email onboarding. Automatic invitations are the next step.</p>
                </form>}
                {invitationNotice && <p role="status" style={{ color: '#b8e5c5' }}>{invitationNotice}</p>}
                {employeeError && <p role="alert" style={{ color: '#ffb4a8' }}>Unable to complete employee request: {employeeError}</p>}
                {employeesLoading ? <p>Loading employees…</p> : employees.length ? (
                  <div style={{ marginTop: 20 }}>
                    {employees.map(employee => <div className="info" key={employee.id} style={{ alignItems: 'flex-start', gap: 12 }}>
                      <span style={{ display: 'grid', gap: 3 }}><strong>{employee.full_name}</strong><small>#{employee.employee_number} · {employee.email || 'No email'}</small></span>
                      <span style={{ display: 'grid', justifyItems: 'end', gap: 8 }}>
                        <strong style={{ color: employee.is_active ? '#b8e5c5' : '#c6cbd3' }}>{employee.is_active ? 'Active' : 'Inactive'}</strong>
                        {employee.is_active && employee.email && <button type="button" disabled={Boolean(invitingEmployeeId)} onClick={() => sendEmployeeInvitation(employee)} style={{ padding: '8px 12px', borderRadius: 8, background: gold, color: '#1d2430', border: 0, cursor: 'pointer', fontWeight: 700 }}>
                          {invitingEmployeeId === employee.id ? 'Sending…' : 'Send invitation'}
                        </button>}
                      </span>
                    </div>)}
                  </div>
                ) : !employeeError && <p style={{ marginTop: 20 }}>No employees yet. Add your first employee to get started.</p>}
              </div>
            )}
            {tab === 'time' && (
              <div style={cardStyle}>
                <h2 style={{ marginTop: 0 }}><Clock3 size={21} /> Time records</h2>
                <p>Timesheets and GPS clock-in history will appear here after secure recording and access rules are implemented.</p>
                <p className="footer">No time entries are being created or modified by this preview.</p>
              </div>
            )}
            {tab === 'settings' && (
              <div style={cardStyle}>
                <h2 style={{ marginTop: 0 }}><Settings size={21} /> Business settings</h2>
                <div className="info"><span>Business name</span><strong>{selectedBusiness.business_name}</strong></div>
                <div className="info"><span>Business ID</span><span style={{ overflowWrap: 'anywhere', textAlign: 'right' }}>{selectedBusiness.id}</span></div>
                <div className="info"><span>Brand color</span><strong>{selectedBusiness.primary_color ?? 'Not configured'}</strong></div>
                <p className="footer">Read-only settings preview. Branding edits will come later.</p>
              </div>
            )}
          </section>
        ) : (
          <section className="panel">
            <div className="eyebrow">TIMEHIVE ADMINISTRATION</div>
            <h1>Welcome to the hive.</h1>
            <p>Signed in as {user.email ?? 'your account'}</p>
            {isPlatformAdmin && <div className="info"><span><Shield size={17} /> Platform administrator</span><strong>Verified</strong></div>}
            <h2><Building2 size={21} /> Your businesses</h2>
            {businesses.length ? businesses.map(business => (
              <button key={business.id} type="button" onClick={() => openBusiness(business.id)}
                style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 15, padding: '18px 8px', background: 'transparent', border: 0, borderBottom: '1px solid #384253', color: 'inherit', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {business.logo_url ? <img src={business.logo_url} alt="" width={32} height={32} /> : <Building2 size={24} />}
                  <strong>{business.business_name}</strong>
                </span>
                <ChevronRight size={20} />
              </button>
            )) : <p>No business administrator assignments found.</p>}
            {!isPlatformAdmin && businesses.length === 0 && <p>No administrator access is assigned to this account.</p>}
            <p className="footer">Employee directory is available. Time tracking and employee login invitations are coming next.</p>
          </section>
        )}
        {message && <p className="status" role="status">{message}</p>}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
