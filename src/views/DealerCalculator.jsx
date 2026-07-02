import React, { useState, useMemo } from 'react'
import { Icon } from '../utils'

// ============================================================================
// BAYİ KÂR / ZARAR HESAPLAYICI
// ----------------------------------------------------------------------------
// Cxentrix ürünlerini (Logic CC, Logic AI, Voice AI) 4 farklı bayi modeliyle
// satarken maliyet + yüzdelikler üzerinden aylık / yıllık / sözleşme boyu
// kâr-zararı hesaplar.
//
// Fiyatlandırma tabanı:
//   Logic CC  -> agent başına / ay (abonelik)
//   Logic AI  -> dakika başına
//   Voice AI  -> dakika başına
//
// İki gelir kalemi vardır: tek seferlik KURULUM ve aylık ABONELİK.
//
// Modellerin temel farkı "işçiliği kim yapıyor":
//   Referans & Satış Bayisi -> kurulum + destek işçiliği Cxentrix'te (maliyet bizde),
//                              bayiye komisyon öderiz, faturayı biz keseriz.
//   Çözüm Ortağı & Distribütör -> peşin iskonto veririz; kurulum + 1. seviye desteği
//                              bayi yapar, faturayı bayi keser. Bizde işçilik maliyeti yok.
// ============================================================================

const MODELS = [
  { key: 'referans',    label: 'Referans',       icon: 'users',    color: '#6366f1' },
  { key: 'reseller',    label: 'Satış Bayisi',   icon: 'trending', color: '#8b5cf6' },
  { key: 'whitelabel',  label: 'Çözüm Ortağı',   icon: 'spark',    color: '#ec4899' },
  { key: 'distributor', label: 'Bölge / Distribütör', icon: 'dashboard', color: '#f59e0b' },
]

const MODEL_INFO = {
  referans: {
    tagline: 'Tavsiye ortağı — sadece müşteri getirir',
    labor: 'Satış · kurulum · destek · fatura → Cxentrix',
    desc: 'Ortak sadece tanıştırır, hiçbir taahhüt yok. Komisyon: kurulumun bir yüzdesi + ilk N ay aboneliğin bir yüzdesi. Süre bitince komisyon durur, birim kârın en yükseğe çıkar.',
  },
  reseller: {
    tagline: 'Sen sat, biz faturalar ve kurarız',
    labor: 'Kurulum · destek · fatura → Cxentrix',
    desc: 'Müşteriyi bayi kapatır, ilişki paylaşımlı. Komisyon 12 ayla sınırlı değil — sözleşme boyunca her ay devam eder. Uzun vadede birim kârın referanstan düşük kalır.',
  },
  whitelabel: {
    tagline: 'Peşin iskonto — kendi markasıyla satar',
    labor: 'Kurulum · 1. seviye destek · fatura → Bayi',
    desc: 'Komisyon yok, peşin iskonto. Birim kârın düşer ama hiç kurulum/destek işçiliği yapmazsın — aynı ekiple çok daha fazla müşteriye ölçeklenirsin. Kurulumu bayi kendi fiyatlar.',
  },
  distributor: {
    tagline: 'Bölge münhasırlığı + alt bayi ağı',
    labor: 'Kurulum · destek · alt bayi yönetimi → Distribütör',
    desc: 'White-label\'ın üstüne bölge münhasırlığı + alt bayi override\'ı. Distribütör sana 1 değil çok anlaşma getirir ve alt bayi ağını kendi kurar. Alt bayi cirosundan aldığı override onu satmaya iter.',
  },
}

// --- Saf hesaplama: bir deal + parametreler -> 4 modelin sonucu ---------------
function computeAll(d, p) {
  const mList = d.agentCount * d.ccPrice + d.aiMinutes * d.aiPrice + d.voiceMinutes * d.voicePrice
  const mServ = d.agentCount * d.ccCost + d.aiMinutes * d.aiCost + d.voiceMinutes * d.voiceCost
  const N = Math.max(1, d.contractMonths)

  // Komisyon modeli (Referans, Satış Bayisi) — işçilik Cxentrix'te
  const commission = (setupPct, subPct, commMonthsRaw) => {
    const commMonths = Math.min(commMonthsRaw, N)
    const setupPartner = d.setupPrice * setupPct / 100
    const setupProfit = d.setupPrice - d.setupCost - setupPartner
    const monthlyCost = mServ + d.supportCost
    const monthlyPartner = mList * subPct / 100
    const profitComm = mList - monthlyCost - monthlyPartner   // komisyonlu ay
    const profitPost = mList - monthlyCost                    // komisyon bitince
    const contractProfit = setupProfit + commMonths * profitComm + (N - commMonths) * profitPost
    // Yıl 1: ilk 12 ayın kaçı komisyonlu?
    const y1Comm = Math.min(12, commMonths)
    const y1Post = Math.min(12, N) - y1Comm
    const year1Profit = setupProfit + y1Comm * profitComm + y1Post * profitPost
    // Kararlı yıl (kurulum yok): komisyon hâlâ sürüyorsa komisyonlu, bittiyse komisyonsuz
    const steadyMonthly = commMonths >= N ? profitComm : profitPost
    return {
      partnerDoesLabor: false,
      mList, mServ,
      setupRevenue: d.setupPrice, setupCost: d.setupCost, setupPartner, setupProfit,
      monthlyRevenue: mList, monthlyCost, monthlyPartner,
      monthlyProfit: profitComm, monthlyProfitPost: profitPost,
      commMonths, steadyMonthly,
      year1Profit, steadyAnnualProfit: 12 * steadyMonthly, contractProfit,
      marginPct: mList > 0 ? (steadyMonthly / mList) * 100 : 0,
      partnerYear1: setupPartner + Math.min(12, commMonths) * monthlyPartner,
      partnerContract: setupPartner + commMonths * monthlyPartner,
      override: null,
    }
  }

  // İskonto modeli (Çözüm Ortağı, Distribütör) — işçilik bayide
  const discount = (discPct, opts = {}) => {
    const disc = discPct / 100
    const monthlyRevenue = mList * (1 - disc)
    const monthlyCost = mServ                 // destek + kurulum bayide → bizde işçilik yok
    const monthlyProfit = monthlyRevenue - monthlyCost
    const partnerMargin = mList * disc        // iskonto = bayinin örtük marjı

    let override = null
    if (opts.overridePct != null) {
      const sub = opts.subList
      const subDisc = opts.subDiscountPct / 100
      const costRatio = mList > 0 ? mServ / mList : 0     // ana deal'ın maliyet oranı ile tahmin
      const subRevToCx = sub * (1 - subDisc)
      const subCost = sub * costRatio
      const overrideCost = sub * opts.overridePct / 100
      const networkMonthly = subRevToCx - subCost - overrideCost
      override = { sub, subRevToCx, subCost, overrideCost, networkMonthly, networkAnnual: networkMonthly * 12 }
    }

    return {
      partnerDoesLabor: true,
      mList, mServ,
      setupRevenue: 0, setupCost: 0, setupPartner: d.setupPrice, setupProfit: 0,
      monthlyRevenue, monthlyCost, monthlyPartner: partnerMargin,
      monthlyProfit, monthlyProfitPost: monthlyProfit,
      commMonths: 0, steadyMonthly: monthlyProfit,
      year1Profit: 12 * monthlyProfit, steadyAnnualProfit: 12 * monthlyProfit, contractProfit: N * monthlyProfit,
      marginPct: monthlyRevenue > 0 ? (monthlyProfit / monthlyRevenue) * 100 : 0,
      partnerYear1: partnerMargin * 12 + d.setupPrice,
      partnerContract: partnerMargin * N + d.setupPrice,
      override,
    }
  }

  return {
    referans:    commission(p.referans.setupPct, p.referans.subPct, p.referans.subMonths),
    reseller:    commission(p.reseller.setupPct, p.reseller.subPct, N),
    whitelabel:  discount(p.whitelabel.discountPct),
    distributor: discount(p.distributor.discountPct, {
      overridePct: p.distributor.overridePct,
      subList: p.distributor.subList,
      subDiscountPct: p.distributor.subDiscountPct,
    }),
  }
}

// ============================================================================

export default function DealerCalculator() {
  const [sym, setSym] = useState('₺')
  const [model, setModel] = useState('referans')

  const [d, setD] = useState({
    agentCount: '10', ccPrice: '1500', ccCost: '600',
    aiMinutes: '5000', aiPrice: '3', aiCost: '1.2',
    voiceMinutes: '3000', voicePrice: '4', voiceCost: '1.5',
    setupPrice: '50000', setupCost: '20000',
    supportCost: '8000', contractMonths: '24',
  })
  const [params, setParams] = useState({
    referans:    { setupPct: '10', subPct: '8', subMonths: '12' },
    reseller:    { setupPct: '20', subPct: '18' },
    whitelabel:  { discountPct: '45' },
    distributor: { discountPct: '55', overridePct: '8', subList: '80000', subDiscountPct: '45' },
  })

  const setDeal = (k, v) => setD(s => ({ ...s, [k]: v }))
  const setParam = (m, k, v) => setParams(s => ({ ...s, [m]: { ...s[m], [k]: v } }))

  const dn = useMemo(() => {
    const o = {}; for (const k in d) o[k] = Number(d[k]) || 0; return o
  }, [d])
  const pn = useMemo(() => {
    const o = {}
    for (const m in params) { o[m] = {}; for (const k in params[m]) o[m][k] = Number(params[m][k]) || 0 }
    return o
  }, [params])

  const R = useMemo(() => computeAll(dn, pn), [dn, pn])
  const r = R[model]
  const info = MODEL_INFO[model]
  const active = MODELS.find(m => m.key === model)

  const money = (n) => (n < 0 ? '-' : '') + sym + Math.abs(Math.round(n)).toLocaleString('tr-TR')
  const pct = (n) => n.toFixed(1) + '%'

  return (
    <div>
      {/* === HERO === */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1f2e 0%, #2d3548 100%)',
        color: 'white', borderRadius: 16, padding: '24px 28px', marginBottom: 18,
        position: 'relative', overflow: 'hidden',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap',
      }}>
        <div style={{ position: 'absolute', top: -60, right: -60, width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99, 102, 241, 0.25) 0%, transparent 70%)' }} />
        <div style={{ position: 'relative', flex: 1 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7, fontWeight: 600, marginBottom: 8 }}>
            Cxentrix · Bayi Fiyatlandırma
          </div>
          <h2 className="display" style={{ fontSize: 28, marginBottom: 4, lineHeight: 1.1 }}>Bayi Kâr / Zarar Hesaplayıcı</h2>
          <p style={{ fontSize: 12.5, opacity: 0.8 }}>Maliyet + yüzdelikleri gir, 4 bayi modelinde aylık ve yıllık kâr-zararını gör</p>
        </div>
        <div style={{ position: 'relative', display: 'flex', background: 'rgba(255,255,255,0.1)', borderRadius: 9, padding: 4 }}>
          {['₺', 'CHF', '€', '$'].map(s => (
            <button key={s} onClick={() => setSym(s)} style={{
              padding: '7px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
              background: sym === s ? 'rgba(255,255,255,0.95)' : 'transparent',
              color: sym === s ? '#1a1f2e' : 'rgba(255,255,255,0.7)', transition: 'all 0.2s',
            }}>{s}</button>
          ))}
        </div>
      </div>

      {/* === MODEL SEKMELERİ === */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
        {MODELS.map(m => {
          const isActive = model === m.key
          const mr = R[m.key]
          return (
            <button key={m.key} onClick={() => setModel(m.key)} style={{
              textAlign: 'left', padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
              background: isActive ? 'var(--bg-card)' : 'var(--bg-elevated)',
              border: `1.5px solid ${isActive ? m.color : 'var(--line)'}`,
              boxShadow: isActive ? `0 6px 18px ${m.color}33` : 'none', transition: 'all 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: `${m.color}22`, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={m.icon} size={13} />
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: isActive ? 'var(--ink)' : 'var(--ink-soft)' }}>{m.label}</span>
              </div>
              <div style={{ fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600, marginBottom: 2 }}>Sözleşme Kârı</div>
              <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: mr.contractProfit >= 0 ? m.color : 'var(--red)' }}>
                {money(mr.contractProfit)}
              </div>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* === SOL: GİRDİLER === */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card title="Deal Tanımı" subtitle="Müşteriye satılan paket (aylık)" icon="wallet">
            <ProductBlock label="Logic CC" hint="agent başına / ay" color="#6366f1"
              qty={{ label: 'Agent sayısı', value: d.agentCount, on: v => setDeal('agentCount', v), suffix: 'agent' }}
              price={{ label: 'Liste fiyatı', value: d.ccPrice, on: v => setDeal('ccPrice', v), suffix: `${sym}/agent` }}
              cost={{ label: 'Maliyetin', value: d.ccCost, on: v => setDeal('ccCost', v), suffix: `${sym}/agent` }}
            />
            <ProductBlock label="Logic AI" hint="dakika başına" color="#8b5cf6"
              qty={{ label: 'Aylık dakika', value: d.aiMinutes, on: v => setDeal('aiMinutes', v), suffix: 'dk' }}
              price={{ label: 'Liste fiyatı', value: d.aiPrice, on: v => setDeal('aiPrice', v), suffix: `${sym}/dk` }}
              cost={{ label: 'Maliyetin', value: d.aiCost, on: v => setDeal('aiCost', v), suffix: `${sym}/dk` }}
            />
            <ProductBlock label="Voice AI" hint="dakika başına" color="#ec4899"
              qty={{ label: 'Aylık dakika', value: d.voiceMinutes, on: v => setDeal('voiceMinutes', v), suffix: 'dk' }}
              price={{ label: 'Liste fiyatı', value: d.voicePrice, on: v => setDeal('voicePrice', v), suffix: `${sym}/dk` }}
              cost={{ label: 'Maliyetin', value: d.voiceCost, on: v => setDeal('voiceCost', v), suffix: `${sym}/dk` }}
            />

            <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 12, marginTop: 2, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>Aylık liste geliri / maliyet</span>
              <span className="mono" style={{ fontWeight: 700 }}>{money(dn.agentCount * dn.ccPrice + dn.aiMinutes * dn.aiPrice + dn.voiceMinutes * dn.voicePrice)} <span style={{ color: 'var(--ink-faint)' }}>/</span> <span style={{ color: 'var(--red)' }}>{money(dn.agentCount * dn.ccCost + dn.aiMinutes * dn.aiCost + dn.voiceMinutes * dn.voiceCost)}</span></span>
            </div>
          </Card>

          <Card title="Kurulum · Destek · Sözleşme" subtitle="Tek seferlik kurulum ve aylık işçilik" icon="settings">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <NumField label="Kurulum bedeli (liste)" value={d.setupPrice} onChange={v => setDeal('setupPrice', v)} suffix={sym} hint="Tek seferlik, müşteriden" />
              <NumField label="Kurulum maliyetin" value={d.setupCost} onChange={v => setDeal('setupCost', v)} suffix={sym} hint="İşçilik + kurulum gideri" />
              <NumField label="Aylık destek maliyetin" value={d.supportCost} onChange={v => setDeal('supportCost', v)} suffix={`${sym}/ay`} hint="Referans/Satış'ta sende" />
              <NumField label="Sözleşme süresi" value={d.contractMonths} onChange={v => setDeal('contractMonths', v)} suffix="ay" hint="Toplam kâr için" />
            </div>
          </Card>

          <Card title={`${active.label} · Yüzdelikler`} subtitle="Bu modele özel oranlar" icon="spark" accent={active.color}>
            <ModelParams model={model} params={params} setParam={setParam} sym={sym} />
          </Card>
        </div>

        {/* === SAĞ: SONUÇLAR === */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Model açıklaması */}
          <div style={{ background: `${active.color}12`, border: `1px solid ${active.color}44`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: active.color, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={active.icon} size={13} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{active.label}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-muted)' }}>{info.tagline}</div>
              </div>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: 8 }}>{info.desc}</p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600, background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 20, padding: '4px 10px', color: 'var(--ink-muted)' }}>
              <Icon name="users" size={11} /> {info.labor}
            </div>
          </div>

          {/* KPI'lar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <KPI label={r.commMonths > 0 && r.commMonths < dn.contractMonths ? 'Aylık Kâr (komisyonlu)' : 'Aylık Kâr'} value={money(r.monthlyProfit)} sign={r.monthlyProfit} color={active.color} />
            <KPI label="Yıllık Kâr (kararlı)" value={money(r.steadyAnnualProfit)} sign={r.steadyAnnualProfit} sub={r.commMonths > 0 && r.commMonths < dn.contractMonths ? 'komisyon bitince' : null} />
            <KPI label="Yıl 1 Kârı" value={money(r.year1Profit)} sign={r.year1Profit} sub="kurulum dahil" />
            <KPI label="Kâr Marjı" value={pct(r.marginPct)} sign={r.marginPct} isPct />
          </div>

          {/* Sözleşme toplamı */}
          <div style={{
            background: r.contractProfit >= 0 ? 'linear-gradient(135deg, var(--accent) 0%, var(--purple) 100%)' : 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
            color: 'white', borderRadius: 14, padding: '16px 20px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
            boxShadow: '0 8px 24px rgba(99,102,241,0.22)',
          }}>
            <div>
              <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.85, fontWeight: 700, marginBottom: 3 }}>
                {dn.contractMonths} Aylık Sözleşme {r.contractProfit >= 0 ? 'Toplam Kârı' : 'Toplam Zararı'}
              </div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>Kurulum + tüm aylar dahil net</div>
            </div>
            <div className="mono" style={{ fontSize: 26, fontWeight: 700 }}>{money(r.contractProfit)}</div>
          </div>

          {/* Döküm */}
          <Card title="Kâr Dökümü" subtitle="Nereden ne kalıyor" icon="list">
            <Breakdown r={r} money={money} sym={sym} contractMonths={dn.contractMonths} />
          </Card>

          {/* Distribütör override */}
          {model === 'distributor' && r.override && (
            <Card title="Alt Bayi Ağı — Override" subtitle="Distribütörün getirdiği ek ağ (tahmini)" icon="trending" accent="#f59e0b">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <NumField label="Alt bayi aylık cirosu" value={params.distributor.subList} onChange={v => setParam('distributor', 'subList', v)} suffix={`${sym}/ay`} hint="Tüm alt bayilerin toplam liste cirosu" />
                <NumField label="Alt bayi iskontosu" value={params.distributor.subDiscountPct} onChange={v => setParam('distributor', 'subDiscountPct', v)} suffix="%" hint="Alt bayilere verilen iskonto" />
              </div>
              <BRow label="Alt bayiden Cxentrix'e gelir" value={money(r.override.subRevToCx)} />
              <BRow label="Tahmini servis maliyeti" value={'-' + money(r.override.subCost)} red />
              <BRow label={`Distribütöre override (${pn.distributor.overridePct}%)`} value={'-' + money(r.override.overrideCost)} red />
              <BRow label="Ağdan aylık net" value={money(r.override.networkMonthly)} bold accent="#f59e0b" top />
              <BRow label="Ağdan yıllık net" value={money(r.override.networkAnnual)} bold accent="#f59e0b" />
              <div style={{ marginTop: 10, fontSize: 10, color: 'var(--ink-faint)', lineHeight: 1.4 }}>
                Not: Alt bayi servis maliyeti, ana deal'ın maliyet/gelir oranıyla tahmin edilir. Gerçek alt bayi paketleri farklıysa cirodan bağımsız girebilmek için söyle, ayrı alan açayım.
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* === MODEL KARŞILAŞTIRMA === */}
      <Card title="Model Karşılaştırma" subtitle="Aynı deal, 4 model yan yana" icon="chart">
        <Comparison R={R} money={money} pct={pct} contractMonths={dn.contractMonths} active={model} onPick={setModel} />
      </Card>

      <div style={{ marginTop: 14, fontSize: 11, color: 'var(--ink-faint)', lineHeight: 1.6, background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 16px' }}>
        <strong style={{ color: 'var(--ink-muted)' }}>Varsayımlar:</strong> Referans komisyonu ilk N ay (varsayılan 12) abonelikte geçerli, sonra durur. Satış Bayisi komisyonu sözleşme boyu sürer. Çözüm Ortağı & Distribütör'de kurulum + destek işçiliğini bayi yaptığı için bu maliyetler Cxentrix'e yansımaz ve kurulum bedelini bayi kendi fiyatlar (Cxentrix kurulumdan gelir/gider yazmaz). İskonto, bayinin örtük marjıdır. Bu varsayımlardan biri sizde farklı çalışıyorsa söyleyin, mantığı güncelleyeyim.
      </div>
    </div>
  )
}

// ============================================================================
// Alt komponentler
// ============================================================================

function Card({ title, subtitle, icon, accent, children }) {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 18, border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: accent ? `${accent}22` : 'var(--accent-soft)', color: accent || 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={14} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10, color: 'var(--ink-muted)', marginTop: 1 }}>{subtitle}</div>}
        </div>
      </div>
      {children}
    </div>
  )
}

function NumField({ label, value, onChange, suffix, hint }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-input)', border: '1px solid var(--line)', borderRadius: 8, padding: '0 10px' }}>
        <input
          type="number" value={value} onChange={e => onChange(e.target.value)}
          style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', padding: '9px 0', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: 'var(--ink)' }}
        />
        {suffix && <span style={{ fontSize: 10.5, color: 'var(--ink-muted)', fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 6 }}>{suffix}</span>}
      </div>
      {hint && <span style={{ fontSize: 9.5, color: 'var(--ink-faint)' }}>{hint}</span>}
    </label>
  )
}

function ProductBlock({ label, hint, color, qty, price, cost }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
        <span style={{ fontSize: 12, fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: 9.5, color: 'var(--ink-faint)', fontWeight: 500 }}>· {hint}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <NumField label={qty.label} value={qty.value} onChange={qty.on} suffix={qty.suffix} />
        <NumField label={price.label} value={price.value} onChange={price.on} suffix={price.suffix} />
        <NumField label={cost.label} value={cost.value} onChange={cost.on} suffix={cost.suffix} />
      </div>
    </div>
  )
}

function ModelParams({ model, params, setParam, sym }) {
  const P = params[model]
  if (model === 'referans') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <NumField label="Kurulum komisyonu" value={P.setupPct} onChange={v => setParam('referans', 'setupPct', v)} suffix="%" hint="Tek seferlik" />
        <NumField label="Abonelik komisyonu" value={P.subPct} onChange={v => setParam('referans', 'subPct', v)} suffix="%" hint="Aylık, N ay" />
        <NumField label="Komisyon süresi" value={P.subMonths} onChange={v => setParam('referans', 'subMonths', v)} suffix="ay" hint="İlk N ay" />
      </div>
    )
  }
  if (model === 'reseller') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <NumField label="Kurulum komisyonu" value={P.setupPct} onChange={v => setParam('reseller', 'setupPct', v)} suffix="%" hint="Tek seferlik" />
        <NumField label="Abonelik komisyonu" value={P.subPct} onChange={v => setParam('reseller', 'subPct', v)} suffix="%" hint="Sözleşme boyu her ay" />
      </div>
    )
  }
  if (model === 'whitelabel') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
        <NumField label="Peşin iskonto" value={P.discountPct} onChange={v => setParam('whitelabel', 'discountPct', v)} suffix="%" hint="Liste fiyatından — bayi bu marjla satar, kurulum + desteği kendi yapar" />
      </div>
    )
  }
  // distributor
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <NumField label="Peşin iskonto" value={P.discountPct} onChange={v => setParam('distributor', 'discountPct', v)} suffix="%" hint="Distribütör alım iskontosu" />
      <NumField label="Alt bayi override" value={P.overridePct} onChange={v => setParam('distributor', 'overridePct', v)} suffix="%" hint="Alt bayi cirosundan distribütöre" />
      <div style={{ gridColumn: '1 / -1', fontSize: 10, color: 'var(--ink-faint)' }}>Alt bayi ağı girdileri aşağıdaki Override kartında.</div>
    </div>
  )
}

function KPI({ label, value, sign, sub, color, isPct }) {
  const positive = sign >= 0
  const c = color || (positive ? 'var(--green)' : 'var(--red)')
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 8 }}>{label}</div>
      <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: isPct ? 'var(--ink)' : c, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function BRow({ label, value, red, bold, accent, top }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderTop: top ? '1px solid var(--line)' : 'none',
      marginTop: top ? 4 : 0,
    }}>
      <span style={{ fontSize: 12, color: bold ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: bold ? 700 : 500 }}>{label}</span>
      <span className="mono" style={{ fontSize: bold ? 14 : 12.5, fontWeight: bold ? 700 : 600, color: accent || (red ? 'var(--red)' : 'var(--ink)') }}>{value}</span>
    </div>
  )
}

function Breakdown({ r, money, contractMonths }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 2 }}>Kurulum (tek seferlik)</div>
      {r.partnerDoesLabor ? (
        <BRow label="Kurulumu bayi yapar / fiyatlar" value="Cxentrix'e 0" />
      ) : (
        <>
          <BRow label="Kurulum geliri" value={money(r.setupRevenue)} />
          <BRow label="Kurulum maliyetin" value={'-' + money(r.setupCost)} red />
          <BRow label="Bayi komisyonu" value={'-' + money(r.setupPartner)} red />
          <BRow label="Kurulum net kârı" value={money(r.setupProfit)} bold top />
        </>
      )}

      <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, margin: '14px 0 2px' }}>Aylık {r.commMonths > 0 && r.commMonths < contractMonths ? '(komisyonlu dönem)' : ''}</div>
      <BRow label={r.partnerDoesLabor ? 'Aylık gelir (iskontolu)' : 'Aylık abonelik geliri'} value={money(r.monthlyRevenue)} />
      <BRow label="Aylık maliyetin" value={'-' + money(r.monthlyCost)} red />
      <BRow label={r.partnerDoesLabor ? 'Bayi marjı (iskonto)' : 'Aylık bayi komisyonu'} value={r.partnerDoesLabor ? 'bayide' : '-' + money(r.monthlyPartner)} red={!r.partnerDoesLabor} />
      <BRow label="Aylık net kâr" value={money(r.monthlyProfit)} bold accent="var(--accent)" top />

      {r.commMonths > 0 && r.commMonths < contractMonths && (
        <BRow label="Komisyon bitince aylık kâr" value={money(r.monthlyProfitPost)} bold accent="var(--green)" />
      )}
    </div>
  )
}

function Comparison({ R, money, pct, contractMonths, active, onPick }) {
  const rows = MODELS.map(m => ({ ...m, r: R[m.key] }))
  const maxAbs = Math.max(...rows.map(x => Math.abs(x.r.contractProfit)), 1)
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr style={{ textAlign: 'right', color: 'var(--ink-muted)' }}>
            <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Model</th>
            <th style={{ padding: '8px 10px', fontWeight: 600, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Aylık Kâr</th>
            <th style={{ padding: '8px 10px', fontWeight: 600, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Yıllık (kararlı)</th>
            <th style={{ padding: '8px 10px', fontWeight: 600, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Marj</th>
            <th style={{ padding: '8px 10px', fontWeight: 600, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{contractMonths} Ay Toplam</th>
            <th style={{ padding: '8px 10px', width: 130 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(x => {
            const isActive = active === x.key
            const w = (Math.abs(x.r.contractProfit) / maxAbs) * 100
            const positive = x.r.contractProfit >= 0
            return (
              <tr key={x.key} onClick={() => onPick(x.key)} style={{
                cursor: 'pointer', background: isActive ? 'var(--accent-soft)' : 'transparent',
                borderTop: '1px solid var(--line)',
              }}>
                <td style={{ padding: '10px', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: x.color }} />
                    <span style={{ fontWeight: isActive ? 700 : 600 }}>{x.label}</span>
                  </div>
                </td>
                <td className="mono" style={{ padding: '10px', textAlign: 'right', color: x.r.monthlyProfit >= 0 ? 'var(--ink)' : 'var(--red)' }}>{money(x.r.monthlyProfit)}</td>
                <td className="mono" style={{ padding: '10px', textAlign: 'right', color: x.r.steadyAnnualProfit >= 0 ? 'var(--ink)' : 'var(--red)' }}>{money(x.r.steadyAnnualProfit)}</td>
                <td className="mono" style={{ padding: '10px', textAlign: 'right', color: 'var(--ink-muted)' }}>{pct(x.r.marginPct)}</td>
                <td className="mono" style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: positive ? x.color : 'var(--red)' }}>{money(x.r.contractProfit)}</td>
                <td style={{ padding: '10px' }}>
                  <div style={{ height: 6, background: 'var(--line-soft)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${w}%`, background: positive ? x.color : 'var(--red)', borderRadius: 3 }} />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
