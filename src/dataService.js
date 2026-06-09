import { supabase } from './supabase'
// FALLBACK_RATE utils.jsx'ten geliyor (CurrencyContext üzerinden değil)
// çünkü CurrencyContext bu dosyadan import ediyor → circular import
// production build'de "Cannot access before initialization" hatasına
// yol açıyordu.
import { FALLBACK_RATE } from './utils'

// === TRANSACTIONS ===
export async function fetchTransactions() {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw error
  return (data || []).map(t => ({
    id: t.id,
    type: t.type,
    date: t.date,
    amount: parseFloat(t.amount),
    category: t.category,
    customer: t.customer || '',
    paymentType: t.payment_type || '',
    description: t.description || '',
    installmentGroupId: t.installment_group_id || null,
    installmentNo: t.installment_no || null,
    installmentTotal: t.installment_total || null,
    checked: !!t.checked,
  }))
}

// İşlemin "kontrol edildi" bayrağını günceller — UI tarafından
// optimistic olarak değiştirilen tek alandır.
export async function setTransactionChecked(id, checked) {
  const { error } = await supabase
    .from('transactions')
    .update({ checked: !!checked })
    .eq('id', id)
  if (error) throw error
}

export async function addTransaction(tx) {
  const user = (await supabase.auth.getUser()).data.user
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      type: tx.type, date: tx.date, amount: tx.amount, category: tx.category,
      customer: tx.customer || null, payment_type: tx.paymentType || null,
      description: tx.description || null, created_by: user?.id,
    })
    .select().single()
  if (error) throw error
  await supabase.from('audit_log').insert({
    user_id: user?.id, user_email: user?.email, action: 'create_transaction',
    details: { amount: tx.amount, type: tx.type, category: tx.category },
  })
  return data
}

// YENİ: İşlem güncelleme fonksiyonu
export async function updateTransaction(id, updates) {
  const user = (await supabase.auth.getUser()).data.user
  const payload = {
    type: updates.type,
    date: updates.date,
    amount: parseFloat(updates.amount),
    category: updates.category,
    customer: updates.customer || null,
    payment_type: updates.paymentType || null,
    description: updates.description || null,
  }
  const { data, error } = await supabase
    .from('transactions')
    .update(payload)
    .eq('id', id)
    .select().single()
  if (error) throw error
  await supabase.from('audit_log').insert({
    user_id: user?.id, user_email: user?.email, action: 'update_transaction',
    details: { id, updates: payload },
  })
  return data
}

export async function addInstallmentTransaction(tx, installmentCount) {
  const user = (await supabase.auth.getUser()).data.user
  const groupId = crypto.randomUUID()
  const perInstallment = Math.round((tx.amount / installmentCount) * 100) / 100
  const baseDate = new Date(tx.date)
  const inserts = []
  for (let i = 0; i < installmentCount; i++) {
    const d = new Date(baseDate)
    d.setMonth(baseDate.getMonth() + i)
    if (d.getDate() !== baseDate.getDate()) d.setDate(0)
    inserts.push({
      type: tx.type, date: d.toISOString().slice(0, 10), amount: perInstallment,
      category: tx.category, customer: tx.customer || null,
      payment_type: tx.paymentType || null,
      description: tx.description ? `${tx.description} (${i+1}/${installmentCount})` : `(${i+1}/${installmentCount})`,
      created_by: user?.id, installment_group_id: groupId,
      installment_no: i + 1, installment_total: installmentCount,
    })
  }
  const { data, error } = await supabase.from('transactions').insert(inserts).select()
  if (error) throw error
  return data
}

export async function deleteTransaction(id) {
  const user = (await supabase.auth.getUser()).data.user
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) throw error
  await supabase.from('audit_log').insert({
    user_id: user?.id, user_email: user?.email, action: 'delete_transaction', details: { id },
  })
}

export async function deleteInstallmentGroup(groupId) {
  const { error } = await supabase.from('transactions').delete().eq('installment_group_id', groupId)
  if (error) throw error
}

// === CATEGORIES & PAYMENT TYPES ===
export async function fetchCategories() {
  const { data, error } = await supabase.from('categories').select('*').order('name')
  if (error) throw error
  return data || []
}
export async function addCategory(name, type) {
  const { data, error } = await supabase.from('categories').insert({ name, type }).select().single()
  if (error) throw error
  return data
}
export async function deleteCategory(id) {
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw error
}
export async function fetchPaymentTypes() {
  const { data, error } = await supabase.from('payment_types').select('*').order('name')
  if (error) throw error
  return (data || []).map(p => p.name)
}
export async function addPaymentType(name) {
  const { error } = await supabase.from('payment_types').insert({ name })
  if (error) throw error
}
export async function deletePaymentType(name) {
  const { error } = await supabase.from('payment_types').delete().eq('name', name)
  if (error) throw error
}

// === EXCHANGE RATES ===
export async function fetchExchangeRates() {
  const { data, error } = await supabase.from('exchange_rates').select('*').order('date', { ascending: false })
  if (error) throw error
  return data || []
}
export async function getLatestRate() {
  const { data, error } = await supabase.from('exchange_rates').select('*').order('date', { ascending: false }).limit(1).single()
  if (error) return null
  return data
}
export async function getRateForDate(date) {
  const { data, error } = await supabase.from('exchange_rates').select('*').lte('date', date).order('date', { ascending: false }).limit(1).single()
  if (error) return null
  return data
}
export async function upsertExchangeRate(date, rate, source = 'manual') {
  const { data, error } = await supabase.from('exchange_rates').upsert({ date, chf_to_try: rate, source }, { onConflict: 'date' }).select().single()
  if (error) throw error
  return data
}

// YENİ: Belirli bir yıl için tüm ay sonlarındaki kurları getir
export async function fetchYearlyRates(year) {
  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')
  if (error) throw error
  return data || []
}

// YENİ: Kur silme
export async function deleteExchangeRate(date) {
  const { error } = await supabase.from('exchange_rates').delete().eq('date', date)
  if (error) throw error
}

export async function fetchTCMBRate() {
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/CHF')
    const data = await response.json()
    if (data && data.rates && data.rates.TRY) return parseFloat(data.rates.TRY)
    return null
  } catch (err) {
    return null
  }
}

// === FRENCH TEAM ===
export async function fetchCommissions() {
  const { data, error } = await supabase.from('french_team_commissions').select('*').order('year', { ascending: false }).order('month', { ascending: false })
  if (error) throw error
  return data || []
}

export async function addCommission(year, month, salesCount, retentionCount, notes, manualRate = null) {
  const user = (await supabase.auth.getUser()).data.user
  const totalChf = (salesCount * 10) + (retentionCount * 3)
  const monthEndDate = new Date(year, month + 1, 0).toISOString().slice(0, 10)

  let rateValue
  if (manualRate && manualRate > 0) {
    rateValue = manualRate
  } else {
    const rate = await getRateForDate(monthEndDate)
    rateValue = rate ? parseFloat(rate.chf_to_try) : FALLBACK_RATE
  }

  const totalTry = totalChf * rateValue

  const { data: tx, error: txError } = await supabase.from('transactions').insert({
    type: 'expense', date: monthEndDate, amount: totalTry,
    category: 'French Team Primi', customer: null, payment_type: 'Fatih Karakaş',
    description: `French Team Primi ${monthName(month)} ${year} (${salesCount} sales + ${retentionCount} retention${manualRate ? ', manuel kur' : ''})`,
    created_by: user?.id,
  }).select().single()
  if (txError) throw txError

  const { data, error } = await supabase.from('french_team_commissions').upsert({
    year, month, sales_count: salesCount, retention_count: retentionCount,
    total_chf: totalChf, transaction_id: tx.id, notes, created_by: user?.id,
  }, { onConflict: 'year,month' }).select().single()
  if (error) throw error
  return data
}

export async function updateCommission(id, { year, month, salesCount, retentionCount, notes, manualRate = null }) {
  // Mevcut kaydı çek (transaction_id'ye ulaşmak için)
  const { data: existing, error: fetchError } = await supabase
    .from('french_team_commissions')
    .select('*')
    .eq('id', id)
    .single()
  if (fetchError) throw fetchError

  const totalChf = (salesCount * 10) + (retentionCount * 3)
  const monthEndDate = new Date(year, month + 1, 0).toISOString().slice(0, 10)

  let rateValue
  if (manualRate && manualRate > 0) {
    rateValue = manualRate
  } else {
    const rate = await getRateForDate(monthEndDate)
    rateValue = rate ? parseFloat(rate.chf_to_try) : FALLBACK_RATE
  }

  const totalTry = totalChf * rateValue
  const description = `French Team Primi ${monthName(month)} ${year} (${salesCount} sales + ${retentionCount} retention${manualRate ? ', manuel kur' : ''})`

  // Bağlı transaction kaydını güncelle (varsa)
  if (existing.transaction_id) {
    const { error: txError } = await supabase
      .from('transactions')
      .update({
        date: monthEndDate,
        amount: totalTry,
        description,
      })
      .eq('id', existing.transaction_id)
    if (txError) throw txError
  }

  // Komisyon kaydını güncelle
  const { data, error } = await supabase
    .from('french_team_commissions')
    .update({
      year, month, sales_count: salesCount, retention_count: retentionCount,
      total_chf: totalChf, notes,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCommission(id) {
  const { data: commission } = await supabase.from('french_team_commissions').select('transaction_id').eq('id', id).single()
  if (commission?.transaction_id) {
    await supabase.from('transactions').delete().eq('id', commission.transaction_id)
  }
  const { error } = await supabase.from('french_team_commissions').delete().eq('id', id)
  if (error) throw error
}

// === LOGIC REPORTS ===
export async function fetchLogicReports() {
  const { data, error } = await supabase.from('logic_report_status').select('*').order('year', { ascending: false }).order('month', { ascending: false })
  if (error) throw error
  return data || []
}
export async function upsertLogicReport(year, month, status, totalTry, totalChf) {
  const user = (await supabase.auth.getUser()).data.user
  const update = { year, month, status, total_try: totalTry, total_chf: totalChf, updated_by: user?.id, updated_at: new Date().toISOString() }
  if (status === 'sent') update.sent_at = new Date().toISOString()
  if (status === 'paid') update.paid_at = new Date().toISOString()
  const { data, error } = await supabase.from('logic_report_status').upsert(update, { onConflict: 'year,month' }).select().single()
  if (error) throw error
  return data
}

// === FATİH AYARLARI ===
export async function fetchFatihSettings() {
  const { data, error } = await supabase.from('fatih_settings').select('*').limit(1).single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data
}

export async function updateFatihSettings(updates) {
  const user = (await supabase.auth.getUser()).data.user
  const existing = await fetchFatihSettings()
  if (existing) {
    const { data, error } = await supabase.from('fatih_settings').update({
      ...updates, updated_by: user?.id, updated_at: new Date().toISOString()
    }).eq('id', existing.id).select().single()
    if (error) throw error
    return data
  } else {
    const { data, error } = await supabase.from('fatih_settings').insert({ ...updates, updated_by: user?.id }).select().single()
    if (error) throw error
    return data
  }
}

// === FATİH MAAŞ ===
export async function fetchFatihSalaries() {
  const { data, error } = await supabase.from('fatih_monthly_salaries').select('*').order('year', { ascending: false }).order('month', { ascending: false })
  if (error) throw error
  return data || []
}

export async function accrueFatihSalary(year, month, salaryChf, manualRate = null) {
  const user = (await supabase.auth.getUser()).data.user
  const { data: existing } = await supabase
    .from('fatih_monthly_salaries')
    .select('*')
    .eq('year', year).eq('month', month).maybeSingle()

  if (existing) throw new Error(`${monthName(month)} ${year} için maaş zaten tahakkuk ettirilmiş.`)

  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`

  let rateValue
  if (manualRate && manualRate > 0) {
    rateValue = manualRate
  } else {
    const rate = await getRateForDate(monthStart)
    rateValue = rate ? parseFloat(rate.chf_to_try) : FALLBACK_RATE
  }

  const totalTry = salaryChf * rateValue

  const { data: tx, error: txError } = await supabase.from('transactions').insert({
    type: 'expense', date: monthStart, amount: totalTry,
    category: 'Fatih Karakaş', customer: null, payment_type: 'Fatih Karakaş',
    description: `${monthName(month)} ${year} Aylık Maaş (${salaryChf} CHF${manualRate ? ', manuel kur' : ''})`,
    created_by: user?.id,
  }).select().single()
  if (txError) throw txError

  const { data, error } = await supabase.from('fatih_monthly_salaries').insert({
    year, month, amount_chf: salaryChf, amount_try: totalTry,
    chf_to_try_rate: rateValue, transaction_id: tx.id, accrued_by: user?.id,
  }).select().single()
  if (error) throw error
  return data
}

export async function deleteFatihSalary(id) {
  const { data: salary } = await supabase.from('fatih_monthly_salaries').select('transaction_id').eq('id', id).single()
  if (salary?.transaction_id) {
    await supabase.from('transactions').delete().eq('id', salary.transaction_id)
  }
  const { error } = await supabase.from('fatih_monthly_salaries').delete().eq('id', id)
  if (error) throw error
}

// === TUĞBA MAAŞI (Fatih hakedişinden düşülür) ===
export async function fetchTugbaSalaries() {
  const { data, error } = await supabase
    .from('tugba_monthly_salaries')
    .select('*')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
  if (error) throw error
  return data || []
}

export async function accrueTugbaSalary(year, month, salaryChf, manualRate = null, notes = null) {
  const user = (await supabase.auth.getUser()).data.user
  const { data: existing } = await supabase
    .from('tugba_monthly_salaries')
    .select('*')
    .eq('year', year).eq('month', month).maybeSingle()
  if (existing) throw new Error(`${monthName(month)} ${year} için Tuğba maaşı zaten girilmiş.`)

  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`

  let rateValue
  if (manualRate && manualRate > 0) {
    rateValue = manualRate
  } else {
    const rate = await getRateForDate(monthStart)
    rateValue = rate ? parseFloat(rate.chf_to_try) : FALLBACK_RATE
  }

  const totalTry = salaryChf * rateValue

  const { data, error } = await supabase
    .from('tugba_monthly_salaries')
    .insert({
      year, month,
      amount_chf: salaryChf,
      amount_try: totalTry,
      chf_to_try_rate: rateValue,
      notes,
      accrued_by: user?.id,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTugbaSalary(id) {
  const { error } = await supabase.from('tugba_monthly_salaries').delete().eq('id', id)
  if (error) throw error
}

// === ÖDEME DURUMU ===
export async function fetchPaymentStatuses() {
  const { data, error } = await supabase.from('payment_status').select('*')
  if (error) throw error
  return data || []
}

export async function setPaymentStatus(transactionId, isPaid, paidDate, notes) {
  const user = (await supabase.auth.getUser()).data.user
  const payload = {
    transaction_id: transactionId,
    is_paid: isPaid,
    paid_date: isPaid ? (paidDate || new Date().toISOString().slice(0, 10)) : null,
    paid_by: isPaid ? user?.id : null,
    notes: notes || null,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase.from('payment_status').upsert(payload, { onConflict: 'transaction_id' }).select().single()
  if (error) throw error
  return data
}

export async function bulkSetPaymentStatus(transactionIds, isPaid, paidDate) {
  const user = (await supabase.auth.getUser()).data.user
  const payloads = transactionIds.map(transaction_id => ({
    transaction_id, is_paid: isPaid,
    paid_date: isPaid ? (paidDate || new Date().toISOString().slice(0, 10)) : null,
    paid_by: isPaid ? user?.id : null,
    updated_at: new Date().toISOString(),
  }))
  const { data, error } = await supabase.from('payment_status').upsert(payloads, { onConflict: 'transaction_id' }).select()
  if (error) throw error
  return data
}

const monthName = (m) => ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'][m]
