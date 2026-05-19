import React, { useMemo } from 'react'
import { Icon, fmtTL, monthFull } from '../utils'
import { KPICard } from '../charts'

export default function Installments({ data }) {
  // Taksitli işlemleri grupla
  const installmentGroups = useMemo(() => {
    const groups = {}
    data.transactions
      .filter(t => t.installmentGroupId)
      .forEach(t => {
        if (!groups[t.installmentGroupId]) {
          groups[t.installmentGroupId] = {
            id: t.installmentGroupId,
            total: t.installmentTotal,
            installments: [],
            category: t.category,
            description: t.description?.replace(/\s*\(\d+\/\d+\)$/, '') || t.category,
            paymentType: t.paymentType,
            amountPerInstallment: t.amount,
          }
        }
        groups[t.installmentGroupId].installments.push(t)
      })
    return Object.values(groups).map(g => {
      const sortedInst = g.installments.sort((a,b) => a.installmentNo - b.installmentNo)
      const today = new Date().toISOString().slice(0,10)
      const paid = sortedInst.filter(i => i.date <= today)
      const remaining = sortedInst.filter(i => i.date > today)
      return {
        ...g,
        installments: sortedInst,
        paid,
        remaining,
        totalAmount: sortedInst.reduce((s,i) => s+i.amount, 0),
        paidAmount: paid.reduce((s,i) => s+i.amount, 0),
        remainingAmount: remaining.reduce((s,i) => s+i.amount, 0),
        startDate: sortedInst[0]?.date,
        nextDate: remaining[0]?.date,
        endDate: sortedInst[sortedInst.length-1]?.date,
        isComplete: remaining.length === 0
      }
    }).sort((a,b) => {
      // Aktif olanlar üstte, sonra biten son zamandaki bitiş tarihine göre
      if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1
      return (a.nextDate || a.endDate).localeCompare(b.nextDate || b.endDate)
    })
  }, [data.transactions])

  // Aktif (devam eden) taksitler
  const active = installmentGroups.filter(g => !g.isComplete)
  const completed = installmentGroups.filter(g => g.isComplete)

  // Önümüzdeki 12 ay için yük
  const futureMonthlyLoad = useMemo(() => {
    const now = new Date()
    const months = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const ym = d.toISOString().slice(0, 7)
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
      const monthStart = d.toISOString().slice(0, 10)

      let total = 0
      const items = []
      active.forEach(g => {
        g.remaining.forEach(inst => {
          if (inst.date >= monthStart && inst.date <= monthEnd) {
            total += inst.amount
            items.push({ ...inst, groupDesc: g.description })
          }
        })
      })
      months.push({
        month: d.getMonth(),
        year: d.getFullYear(),
        label: `${monthFull(d.getMonth())} ${d.getFullYear()}`,
        total,
        items
      })
    }
    return months.filter(m => m.total > 0)
  }, [active])

  const totalActive = active.length
  const totalRemainingAmount = active.reduce((s,g) => s+g.remainingAmount, 0)
  const nextMonthLoad = futureMonthlyLoad[0]?.total || 0

  if (installmentGroups.length === 0) {
    return (
      <div className="glow-card" style={{ background: 'var(--bg-card)', borderRadius: 16, padding: '80px 40px', textAlign: 'center', border: '1px solid var(--line)' }}>
        <div className="display gradient-text" style={{ fontSize: 28, marginBottom: 12 }}>Henüz taksitli işlem yok</div>
        <p style={{ fontSize: 14, color: 'var(--ink-muted)', maxWidth: 480, margin: '0 auto' }}>
          "Yeni İşlem" eklerken "Taksitli ödeme" seçeneğini işaretleyerek taksitli alımları otomatik aylık olarak dağıtabilirsin.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Üst KPI'lar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <KPICard label="Aktif Taksit" value={totalActive.toString()} subtitle={`${completed.length} tamamlandı`} icon="list" color="blue" big Icon={Icon} />
        <KPICard label="Kalan Toplam Yük" value={fmtTL(totalRemainingAmount)} subtitle="Önümüzdeki aylar" icon="wallet" color="amber" big Icon={Icon} />
        <KPICard label="Bu Ay Ödenecek" value={fmtTL(nextMonthLoad)} subtitle={futureMonthlyLoad[0]?.label || ''} icon="trending" gradient big Icon={Icon} />
      </div>

      {/* Aktif Taksitler */}
      {active.length > 0 && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--line)', marginBottom: 16 }}>
          <h3 className="display" style={{ fontSize: 17, marginBottom: 4 }}>Aktif Taksitler ({active.length})</h3>
          <p style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 16 }}>
            Devam eden taksitli alımların. Sonraki ödeme tarihine göre sıralı.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {active.map(g => (
              <div key={g.id} style={{
                background: 'var(--bg-elevated)', borderRadius: 10,
                padding: 16, border: '1px solid var(--line)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{g.description}</div>
                    <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--ink-muted)', flexWrap: 'wrap' }}>
                      <span><strong style={{ color: 'var(--ink-soft)' }}>{g.category}</strong></span>
                      <span>•</span>
                      <span>{g.paymentType}</span>
                      <span>•</span>
                      <span>Toplam: <strong className="mono" style={{ color: 'var(--ink-soft)' }}>{fmtTL(g.totalAmount)}</strong></span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
                      {fmtTL(g.remainingAmount)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--ink-muted)' }}>kalan</div>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>
                    <span>{g.paid.length} / {g.total} taksit ödendi</span>
                    <span className="mono">{Math.round((g.paid.length / g.total) * 100)}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--line-soft)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(g.paid.length / g.total) * 100}%`, background: 'var(--gradient-1)', transition: 'width 0.3s' }}></div>
                  </div>
                </div>

                {/* Taksitler */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
                  {g.installments.map(inst => {
                    const isPaid = inst.date <= new Date().toISOString().slice(0,10)
                    const isNext = inst === g.remaining[0]
                    return (
                      <div key={inst.id} style={{
                        padding: '8px 10px', borderRadius: 6, fontSize: 11,
                        background: isPaid ? 'var(--green-soft)' : isNext ? 'var(--amber-soft)' : 'var(--bg-input)',
                        border: `1px solid ${isPaid ? 'var(--green)' : isNext ? 'var(--amber)' : 'var(--line)'}`,
                        opacity: isPaid ? 0.7 : 1
                      }}>
                        <div style={{ fontSize: 9, color: 'var(--ink-muted)', marginBottom: 2, fontWeight: 600 }}>
                          {inst.installmentNo}/{inst.installmentTotal} {isPaid && '✓'} {isNext && '⏰'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginBottom: 2 }}>
                          {new Date(inst.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                        </div>
                        <div className="mono" style={{ fontSize: 11, fontWeight: 700 }}>
                          {fmtTL(inst.amount)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gelecek aylar yük tablosu */}
      {futureMonthlyLoad.length > 0 && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--line)', marginBottom: 16 }}>
          <h3 className="display" style={{ fontSize: 17, marginBottom: 4 }}>Gelecek Aylar — Taksit Yükü</h3>
          <p style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 16 }}>
            Her ay ne kadar taksit ödemen gerekecek — nakit akışı planlaması için.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            {futureMonthlyLoad.map((m, i) => (
              <div key={i} style={{
                background: 'var(--bg-elevated)', borderRadius: 10,
                padding: 14, border: '1px solid var(--line)'
              }}>
                <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600, marginBottom: 6 }}>
                  {m.label}
                </div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>
                  {fmtTL(m.total)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--ink-muted)' }}>{m.items.length} taksit</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tamamlanmış Taksitler */}
      {completed.length > 0 && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--line)' }}>
          <h3 className="display" style={{ fontSize: 17, marginBottom: 4 }}>Tamamlanmış Taksitler ({completed.length})</h3>
          <p style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 16 }}>
            Tüm taksitleri ödenmiş olan geçmiş alımlar.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {completed.map(g => (
              <div key={g.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 120px 120px 100px', gap: 12,
                padding: '12px 16px', alignItems: 'center',
                background: 'var(--bg-input)', borderRadius: 8
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-muted)' }}>{g.category}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                  {new Date(g.startDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  <br/>→ {new Date(g.endDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                  {g.total} taksit
                </div>
                <div className="mono" style={{ fontSize: 13, fontWeight: 600, textAlign: 'right', color: 'var(--green)' }}>
                  ✓ {fmtTL(g.totalAmount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
