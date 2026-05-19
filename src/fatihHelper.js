// Bir işlemin "Şirket → Fatih transferi" olup olmadığını kontrol et
// Bu işlemler raporlardan düşülür çünkü iç para hareketidir
//
// DÜZELTİLDİ: Maaş ve primler Logic'e DAHİL, sadece manuel transferler HARİÇ
//
// Kural:
// - "Fatih Karakaş" kategorisi + açıklamasında "transfer" YOK → maaş/prim (Logic'e dahil)
// - "Fatih Karakaş" kategorisi + açıklamasında "transfer" VAR → transfer (Logic'e dahil değil)
// - "French Team Primi" → Logic'e dahil (zaten ayrı kategori)

export function isFatihTransferTx(tx) {
  if (!tx) return false
  const cat = (tx.category || '').toLowerCase()
  const desc = (tx.description || '').toLowerCase()
  
  // Eğer kategori "Fatih" içermiyorsa → transfer değildir
  if (!cat.includes('fatih')) return false
  
  // Kategori "Fatih Karakaş" ise:
  // - Açıklamasında "maaş" veya "aylık" veya "primi" varsa → maaş/primdir, Logic'e dahil (transfer DEĞİL)
  // - Açıklamasında "transfer" varsa → transferdir, Logic'e dahil değil (transfer)
  // - Hiçbiri yoksa → muhtemelen manuel transfer, Logic'e dahil değil
  
  if (desc.includes('maaş') || desc.includes('aylık') || desc.includes('primi')) {
    return false // Maaş/prim → Logic'e dahil et
  }
  
  // Geri kalanlar transfer sayılır
  return true
}

// Operasyonel giderler (Fatih transferi hariç tüm giderler)
export function filterOperationalExpenses(transactions) {
  return transactions.filter(t => t.type === 'expense' && !isFatihTransferTx(t))
}

// Operasyonel gider toplamı
export function calculateOperationalTotal(transactions) {
  return filterOperationalExpenses(transactions).reduce((s, t) => s + t.amount, 0)
}
