import React, { useState, useEffect } from 'react'
import { supabase } from './supabase'
import Dashboard from './views/Dashboard'
import Transactions from './views/Transactions'
import Reports from './views/Reports'
import CategoryTrend from './views/CategoryTrend'
import PersonnelReport from './views/PersonnelReport'
import FatihAccount from './views/FatihAccount'
import Installments from './views/Installments'
import FrenchTeam from './views/FrenchTeam'
import LogicView from './views/LogicView'
import Settings from './views/Settings'
import MonthlyRates from './MonthlyRates'
import AddModal from './views/AddModal'
import CurrencyTicker from './CurrencyTicker'
import Login from './Login'
import { Icon, LOGO_URL } from './utils'
import { CurrencyProvider } from './CurrencyContext'
import { fetchTransactions, fetchCategories, fetchPaymentTypes, fetchPaymentStatuses } from './dataService'

export default function App() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div className="spinner" style={{ width: 40, height: 40, border: '3px solid var(--line)', borderTopColor: 'var(--accent)', borderRadius: '50%' }}></div>
      </div>
    )
  }

  if (!session) return <Login />

  return (
    <CurrencyProvider>
      <AppInner session={session} />
    </CurrencyProvider>
  )
}

function AppInner({ session }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('cxentrix-theme') || 'light' } catch { return 'light' }
  })
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem('cxentrix-mode') || 'cxentrix' } catch { return 'cxentrix' }
  })

  const [data, setData] = useState({ transactions: [], categories: [], paymentTypes: [], paymentStatuses: [] })
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('dashboard')
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('cxentrix-theme', theme) } catch {}
  }, [theme])

  useEffect(() => {
    try { localStorage.setItem('cxentrix-mode', mode) } catch {}
    if (mode === 'logic') setView('logic-summary')
    else setView('dashboard')
  }, [mode])

  useEffect(() => {
    loadAllData()
  }, [])

  const loadAllData = async () => {
    setLoading(true)
    try {
      const [transactions, categories, paymentTypes, paymentStatuses] = await Promise.all([
        fetchTransactions(),
        fetchCategories(),
        fetchPaymentTypes(),
        fetchPaymentStatuses().catch(() => []),
      ])
      setData({ transactions, categories, paymentTypes, paymentStatuses })
    } catch (err) {
      console.error(err)
      alert('Veriler yüklenemedi: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ width: 40, height: 40, border: '3px solid var(--line)', borderTopColor: 'var(--accent)', borderRadius: '50%', margin: '0 auto 16px' }}></div>
        <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Veriler yükleniyor...</div>
      </div>
    </div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <CurrencyTicker />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar mode={mode} view={view} setView={setView} onAdd={() => setShowAdd(true)} theme={theme} toggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')} user={session?.user || { email: '' }} onLogout={() => supabase.auth.signOut()} />
        <main style={{ flex: 1, padding: '20px 36px 28px', maxWidth: 1600, width: '100%' }}>
          <Header view={view} mode={mode} setMode={setMode} />
          <div className="fade-in">
            {mode === 'logic' && <LogicView data={data} />}
            {mode === 'cxentrix' && view === 'dashboard' && <Dashboard data={data} setView={setView} />}
            {mode === 'cxentrix' && view === 'transactions' && <Transactions data={data} reload={loadAllData} />}
            {mode === 'cxentrix' && view === 'installments' && <Installments data={data} />}
            {mode === 'cxentrix' && view === 'reports' && <Reports data={data} />}
            {mode === 'cxentrix' && view === 'trend' && <CategoryTrend data={data} />}
            {mode === 'cxentrix' && view === 'personnel' && <PersonnelReport data={data} reload={loadAllData} />}
            {mode === 'cxentrix' && view === 'fatih' && <FatihAccount data={data} reload={loadAllData} />}
            {mode === 'cxentrix' && view === 'french' && <FrenchTeam reload={loadAllData} />}
            {mode === 'cxentrix' && view === 'monthly-rates' && <MonthlyRates reload={loadAllData} />}
            {mode === 'cxentrix' && view === 'settings' && <Settings data={data} reload={loadAllData} />}
          </div>
        </main>
      </div>
      {showAdd && <AddModal data={data} reload={loadAllData} onClose={() => setShowAdd(false)} />}
    </div>
  )
}

function Sidebar({ mode, view, setView, onAdd, theme, toggleTheme, user, onLogout }) {
  const cxentrixItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', section: 'main' },
    { id: 'transactions', label: 'İşlemler', icon: 'list', section: 'main' },
    { id: 'installments', label: 'Taksitlerim', icon: 'spark', section: 'main' },
    { id: 'reports', label: 'Detay Raporlar', icon: 'chart', section: 'reports' },
    { id: 'trend', label: 'Kategori Trendi', icon: 'trending', section: 'reports' },
    { id: 'personnel', label: 'Ödeyen Raporu', icon: 'users', section: 'people' },
    { id: 'fatih', label: 'Fatih Hesabı', icon: 'wallet', section: 'people' },
    { id: 'french', label: 'French Team Primi', icon: 'spark', section: 'people' },
    { id: 'monthly-rates', label: 'Aylık Kurlar', icon: 'spark', section: 'system' },
    { id: 'settings', label: 'Ayarlar', icon: 'settings', section: 'system' },
  ]

  const logicItems = [
    { id: 'logic-summary', label: 'Yıllık Maliyet Raporu', icon: 'dashboard', section: 'logic' },
  ]

  const items = mode === 'logic' ? logicItems : cxentrixItems
  const sections = mode === 'logic'
    ? { logic: 'Logic Holding Görünümü' }
    : { main: 'Ana', reports: 'Raporlar', people: 'Kişiler', system: 'Sistem' }

  const logoFilter = theme === 'dark'
    ? 'brightness(0) invert(1) drop-shadow(0 0 8px rgba(99, 102, 241, 0.6))'
    : 'drop-shadow(0 2px 6px rgba(99, 102, 241, 0.25))'

  return (
    <aside style={{
      width: 240, borderRight: '1px solid var(--line)', padding: '20px 16px',
      background: 'var(--bg-sidebar)', position: 'sticky', top: 0, height: '100vh',
      display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto'
    }}>
      <div style={{ marginBottom: 22, paddingLeft: 6, paddingRight: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{ position: 'relative', width: 42, height: 42, flexShrink: 0 }}>
            <div className="sidebar-logo-glow" style={{
              position: 'absolute', inset: -8,
              background: 'radial-gradient(circle, rgba(99, 102, 241, 0.5) 0%, transparent 70%)',
              borderRadius: '50%', filter: 'blur(10px)',
              animation: 'sidebarLogoPulse 3s ease-in-out infinite', zIndex: 0
            }}/>
            <img src={LOGO_URL} alt="Cxentrix" style={{
              width: 42, height: 42, position: 'relative', zIndex: 1,
              filter: logoFilter, transition: 'filter 0.3s'
            }} onError={(e) => { e.target.style.display = 'none' }}/>
          </div>
          <div>
            <div className="display" style={{
              fontSize: 19, lineHeight: 1, marginBottom: 3,
              background: 'linear-gradient(135deg, var(--ink) 0%, var(--accent) 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text', fontWeight: 700
            }}>Cxentrix</div>
            <div style={{
              fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase',
              color: 'var(--ink-muted)', fontWeight: 600
            }}>Solutions</div>
          </div>
        </div>
        <div style={{
          fontSize: 10, color: mode === 'logic' ? 'var(--accent)' : 'var(--ink-faint)',
          marginTop: 8, paddingLeft: 2,
          fontWeight: mode === 'logic' ? 700 : 500,
          letterSpacing: mode === 'logic' ? '0.1em' : 'normal',
          textTransform: mode === 'logic' ? 'uppercase' : 'none'
        }}>
          {mode === 'logic' ? 'Logic Holding Modu' : 'Finans Yönetim Paneli'}
        </div>
      </div>

      {mode === 'cxentrix' && (
        <button onClick={onAdd} style={{
          background: 'var(--gradient-1)', color: 'white',
          padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8,
          justifyContent: 'center', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)'
        }}>
          <Icon name="plus" size={16} /> Yeni İşlem
        </button>
      )}

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        {Object.entries(sections).map(([sectionId, sectionLabel]) => {
          const sectionItems = items.filter(i => i.section === sectionId)
          if (sectionItems.length === 0) return null
          return (
            <div key={sectionId} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontWeight: 700, padding: '0 12px 6px' }}>{sectionLabel}</div>
              {sectionItems.map(item => (
                <button key={item.id} onClick={() => setView(item.id)} className="nav-item" style={{
                  padding: '8px 12px', borderRadius: 7, fontSize: 12, textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  background: view === item.id ? 'var(--accent-soft)' : 'transparent',
                  color: view === item.id ? 'var(--accent)' : 'var(--ink-soft)',
                  fontWeight: view === item.id ? 600 : 500, transition: 'all 0.15s'
                }}>
                  <Icon name={item.icon} size={14} />{item.label}
                </button>
              ))}
            </div>
          )
        })}
      </nav>

      <div style={{ marginTop: 'auto', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px', marginBottom: 4 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--gradient-1)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>
            {(user?.email?.[0] || '?').toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
          </div>
        </div>
        <button onClick={toggleTheme} style={{ width: '100%', padding: '6px 10px', borderRadius: 7, fontSize: 11, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-muted)', marginBottom: 3 }}>
          <Icon name={theme === 'light' ? 'moon' : 'sun'} size={12} />{theme === 'light' ? 'Koyu Tema' : 'Açık Tema'}
        </button>
        {onLogout && (
          <button onClick={onLogout} style={{ width: '100%', padding: '6px 10px', borderRadius: 7, fontSize: 11, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-muted)' }}>
            <Icon name="settings" size={12} />Çıkış Yap
          </button>
        )}
      </div>

      <style>{`
        @keyframes sidebarLogoPulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
      `}</style>
    </aside>
  )
}

function Header({ view, mode, setMode }) {
  const titles = {
    dashboard: { title: 'Dashboard', sub: 'Finansal durumun anlık özeti ve performans göstergeleri' },
    transactions: { title: 'İşlemler', sub: 'Tüm gelir ve gider kayıtları (French Team Primi hariç)' },
    installments: { title: 'Taksitlerim', sub: 'Aktif taksitli alımlar ve gelecek ay ödemeleri' },
    reports: { title: 'Detay Raporlar', sub: 'Aylık kâr/zarar analizi ve performans tablosu' },
    trend: { title: 'Kategori Trend Analizi', sub: 'Aylık değişim oranları ve karşılaştırmalı raporlar' },
    personnel: { title: 'Ödeyen Raporu', sub: 'Şirket adına kendi cebinden ödeme yapanların raporu' },
    fatih: { title: 'Fatih Karakaş — Cari Hesap', sub: 'Maaş, prim, transferler ve net bakiye' },
    french: { title: 'French Team Primi', sub: 'Aylık sales ve retention bazlı prim hesabı' },
    'monthly-rates': { title: 'Aylık Kurlar', sub: 'CHF/TL kurlarını her ay için elle gir — tüm uygulamada kullanılır' },
    settings: { title: 'Ayarlar', sub: 'Kategoriler, ödeme türleri, kur ve veri yönetimi' },
    'logic-summary': { title: 'Logic Holding Görünümü', sub: 'Cxentrix Solutions maliyet raporu — yıllık özet ve detay' },
  }
  const t = titles[view] || titles.dashboard

  return (
    <div style={{ marginBottom: 24, paddingBottom: 18, borderBottom: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6, fontWeight: 600 }}>
            {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <h1 className="display" style={{ fontSize: 32, lineHeight: 1.1, marginBottom: 4 }}>{t.title}</h1>
          <p style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{t.sub}</p>
        </div>
        <ModeToggle mode={mode} setMode={setMode} />
      </div>
    </div>
  )
}

function ModeToggle({ mode, setMode }) {
  return (
    <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 10, padding: 4, boxShadow: 'var(--shadow-sm)', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 4, left: mode === 'cxentrix' ? 4 : '50%', bottom: 4, width: 'calc(50% - 4px)', background: 'var(--gradient-1)', borderRadius: 7, transition: 'left 0.25s ease', boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)', zIndex: 0 }}/>
      <button onClick={() => setMode('cxentrix')} style={{ padding: '8px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600, color: mode === 'cxentrix' ? 'white' : 'var(--ink-muted)', background: 'transparent', position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 6, transition: 'color 0.25s' }}>
        <Icon name="dashboard" size={13} />Cxentrix
      </button>
      <button onClick={() => setMode('logic')} style={{ padding: '8px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600, color: mode === 'logic' ? 'white' : 'var(--ink-muted)', background: 'transparent', position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 6, transition: 'color 0.25s' }}>
        <Icon name="pie" size={13} />Logic
      </button>
    </div>
  )
}
