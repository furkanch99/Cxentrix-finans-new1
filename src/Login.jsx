import React, { useState } from 'react'
import { supabase } from './supabase'
import { LOGO_FULL_URL } from './utils'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at top, #1e293b 0%, #0f172a 50%, #020617 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, position: 'relative', overflow: 'hidden'
    }}>
      <div className="bg-glow-1" style={{
        position: 'absolute', top: '15%', left: '15%',
        width: 420, height: 420, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.25) 0%, transparent 70%)',
        filter: 'blur(60px)', pointerEvents: 'none'
      }}/>
      <div className="bg-glow-2" style={{
        position: 'absolute', bottom: '10%', right: '15%',
        width: 380, height: 380, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139, 92, 246, 0.20) 0%, transparent 70%)',
        filter: 'blur(80px)', pointerEvents: 'none'
      }}/>

      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(99, 102, 241, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(99, 102, 241, 0.05) 1px, transparent 1px)',
        backgroundSize: '50px 50px', pointerEvents: 'none'
      }}/>

      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 460,
        display: 'flex', flexDirection: 'column', alignItems: 'center'
      }}>
        <div className="logo-container" style={{ position: 'relative', marginBottom: 40, padding: 24 }}>
          <div style={{
            position: 'absolute', inset: -20,
            background: 'radial-gradient(circle, rgba(99, 102, 241, 0.5) 0%, transparent 60%)',
            filter: 'blur(50px)', zIndex: 0, pointerEvents: 'none',
            animation: 'glowPulse1 4s ease-in-out infinite'
          }}/>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(circle, rgba(139, 92, 246, 0.35) 0%, transparent 70%)',
            filter: 'blur(30px)', zIndex: 0, pointerEvents: 'none',
            animation: 'glowPulse2 4s ease-in-out infinite 1s'
          }}/>

          <img src={LOGO_FULL_URL} alt="Cxentrix Solutions" style={{
            width: 340, maxWidth: '90vw', height: 'auto',
            position: 'relative', zIndex: 1,
            filter: 'brightness(0) invert(1) drop-shadow(0 0 25px rgba(99, 102, 241, 0.7)) drop-shadow(0 0 50px rgba(139, 92, 246, 0.4))',
            animation: 'logoFadeIn 1s ease-out, logoBreathe 4s ease-in-out infinite 1s'
          }} onError={(e) => { e.target.style.display = 'none' }}/>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 32, animation: 'fadeInUp 0.6s ease-out 0.3s both' }}>
          <h1 style={{
            fontSize: 22, fontWeight: 700, color: 'rgba(255, 255, 255, 0.95)',
            marginBottom: 6, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.01em'
          }}>Finans Yönetim Paneli</h1>
          <p style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.5)', letterSpacing: '0.05em' }}>
            Hesabınıza giriş yaparak devam edin
          </p>
        </div>

        <div style={{
          width: '100%', background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          borderRadius: 20, padding: 32,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(99, 102, 241, 0.1) inset',
          animation: 'fadeInUp 0.6s ease-out 0.5s both'
        }}>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{
                display: 'block', fontSize: 10, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: 'rgba(255, 255, 255, 0.6)',
                fontWeight: 600, marginBottom: 8
              }}>E-Posta</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="ornek@cxentrix.com" style={{
                width: '100%', padding: '12px 14px', fontSize: 14,
                background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(99, 102, 241, 0.2)',
                borderRadius: 10, color: 'white', outline: 'none', transition: 'border 0.2s'
              }} onFocus={e => e.target.style.border = '1px solid rgba(99, 102, 241, 0.6)'} onBlur={e => e.target.style.border = '1px solid rgba(99, 102, 241, 0.2)'}/>
            </div>

            <div>
              <label style={{
                display: 'block', fontSize: 10, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: 'rgba(255, 255, 255, 0.6)',
                fontWeight: 600, marginBottom: 8
              }}>Şifre</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" style={{
                width: '100%', padding: '12px 14px', fontSize: 14,
                background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(99, 102, 241, 0.2)',
                borderRadius: 10, color: 'white', outline: 'none', transition: 'border 0.2s'
              }} onFocus={e => e.target.style.border = '1px solid rgba(99, 102, 241, 0.6)'} onBlur={e => e.target.style.border = '1px solid rgba(99, 102, 241, 0.2)'}/>
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: 8,
                color: '#fca5a5', fontSize: 12, fontWeight: 500
              }}>
                {error === 'Invalid login credentials' ? 'E-posta veya şifre hatalı.' : error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              marginTop: 8, padding: '13px', fontSize: 13, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              color: 'white', border: 'none', borderRadius: 10,
              cursor: loading ? 'wait' : 'pointer',
              boxShadow: '0 10px 25px -5px rgba(99, 102, 241, 0.5)',
              opacity: loading ? 0.7 : 1, transition: 'all 0.2s'
            }}>
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </button>
          </form>
        </div>

        <div style={{
          marginTop: 24, fontSize: 11, color: 'rgba(255, 255, 255, 0.3)',
          letterSpacing: '0.1em', animation: 'fadeInUp 0.6s ease-out 0.7s both'
        }}>
          © {new Date().getFullYear()} Cxentrix Solutions. Tüm hakları saklıdır.
        </div>
      </div>

      <style>{`
        @keyframes logoFadeIn { from { opacity: 0; transform: scale(0.85) translateY(-10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes logoBreathe {
          0%, 100% { filter: brightness(0) invert(1) drop-shadow(0 0 25px rgba(99, 102, 241, 0.7)) drop-shadow(0 0 50px rgba(139, 92, 246, 0.4)); }
          50% { filter: brightness(0) invert(1) drop-shadow(0 0 40px rgba(99, 102, 241, 0.95)) drop-shadow(0 0 70px rgba(139, 92, 246, 0.6)); }
        }
        @keyframes glowPulse1 { 0%, 100% { opacity: 0.6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.1); } }
        @keyframes glowPulse2 { 0%, 100% { opacity: 0.4; transform: scale(0.95); } 50% { opacity: 0.8; transform: scale(1.05); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .bg-glow-1 { animation: float1 8s ease-in-out infinite; }
        .bg-glow-2 { animation: float2 10s ease-in-out infinite; }
        @keyframes float1 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(20px, -20px); } }
        @keyframes float2 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-25px, 15px); } }
        input::placeholder { color: rgba(255, 255, 255, 0.3); }
      `}</style>
    </div>
  )
}
