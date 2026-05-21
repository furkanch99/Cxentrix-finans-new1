import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// =====================================================================
// Toast notification system
// Drop-in replacement for `alert()` calls. Provides:
//   const { success, error, info } = useToast()
//   error('Kayıt silinemedi')
//   success('Kaydedildi')
// Stacks bottom-right, auto-dismisses after 4.5s, animated entry/exit.
// =====================================================================

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback(id => {
    setToasts(ts => ts.map(t => t.id === id ? { ...t, leaving: true } : t))
    setTimeout(() => {
      setToasts(ts => ts.filter(t => t.id !== id))
    }, 220)
  }, [])

  const push = useCallback((kind, message, opts = {}) => {
    const id = ++idRef.current
    const duration = opts.duration ?? 4500
    setToasts(ts => [...ts, { id, kind, message }])
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration)
    }
    return id
  }, [dismiss])

  const api = {
    success: (msg, opts) => push('success', msg, opts),
    error:   (msg, opts) => push('error', msg, opts),
    info:    (msg, opts) => push('info', msg, opts),
    dismiss,
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Soft fallback for code paths not yet wrapped in provider
    return {
      success: (m) => console.log('[toast.success]', m),
      error:   (m) => { console.error('[toast.error]', m); window.alert(m) },
      info:    (m) => console.log('[toast.info]', m),
      dismiss: () => {},
    }
  }
  return ctx
}

function ToastContainer({ toasts, dismiss }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 10,
      pointerEvents: 'none', maxWidth: 'calc(100vw - 48px)'
    }}>
      {toasts.map(t => <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />)}
      <style>{`
        @keyframes toast-in  { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes toast-out { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(8px) scale(0.97); } }
      `}</style>
    </div>
  )
}

const PRESETS = {
  success: { bg: 'linear-gradient(135deg, rgba(16,185,129,0.96), rgba(16,185,129,0.86))', accent: '#10b981', icon: '✓' },
  error:   { bg: 'linear-gradient(135deg, rgba(239,68,68,0.96), rgba(239,68,68,0.86))', accent: '#ef4444', icon: '!' },
  info:    { bg: 'linear-gradient(135deg, rgba(99,102,241,0.96), rgba(99,102,241,0.86))', accent: '#6366f1', icon: 'i' },
}

function ToastItem({ toast, onClose }) {
  const p = PRESETS[toast.kind] || PRESETS.info
  return (
    <div
      style={{
        background: p.bg,
        color: 'white',
        padding: '10px 14px 10px 12px',
        borderRadius: 10,
        boxShadow: '0 16px 40px -10px rgba(15, 23, 42, 0.45), 0 0 0 1px rgba(255,255,255,0.08) inset',
        minWidth: 240, maxWidth: 420,
        display: 'flex', alignItems: 'flex-start', gap: 10,
        pointerEvents: 'auto',
        animation: toast.leaving ? 'toast-out 0.2s ease-in forwards' : 'toast-in 0.22s ease-out',
        fontFamily: "'Inter', sans-serif"
      }}
    >
      <div style={{
        width: 22, height: 22, flexShrink: 0,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.22)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, marginTop: 1
      }}>{p.icon}</div>
      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.45, fontWeight: 500, wordBreak: 'break-word' }}>
        {toast.message}
      </div>
      <button
        onClick={onClose}
        aria-label="Kapat"
        style={{
          background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.75)',
          cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0, marginTop: 2,
        }}
      >×</button>
    </div>
  )
}
