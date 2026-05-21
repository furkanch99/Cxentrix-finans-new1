import React, { createContext, useContext, useState, useEffect } from 'react'
import { fetchExchangeRates, getLatestRate, fetchTCMBRate, upsertExchangeRate } from './dataService'

// Tüm CHF<->TL hesaplamaları için ortak fallback kuru.
// exchange_rates tablosu boş veya henüz yüklenmemiş olduğunda
// kullanılır. Mevcut iş kuralı: 1 CHF = 54 TL.
export const FALLBACK_RATE = 54

const CurrencyContext = createContext()

export function CurrencyProvider({ children }) {
  const [rates, setRates] = useState([])
  const [latestRate, setLatestRate] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRates()
    // Her saatte bir güncel kuru çek
    const interval = setInterval(autoUpdateRate, 3600000)
    return () => clearInterval(interval)
  }, [])

  const loadRates = async () => {
    setLoading(true)
    try {
      const allRates = await fetchExchangeRates()
      setRates(allRates)
      const latest = await getLatestRate()
      setLatestRate(latest)
      // Bugünün kuru yoksa otomatik güncelle
      const today = new Date().toISOString().slice(0,10)
      if (!latest || latest.date < today) {
        autoUpdateRate()
      }
    } catch (err) {
      console.error('Kur yüklenirken hata:', err)
    } finally {
      setLoading(false)
    }
  }

  const autoUpdateRate = async () => {
    try {
      const rate = await fetchTCMBRate()
      if (rate) {
        const today = new Date().toISOString().slice(0,10)
        await upsertExchangeRate(today, rate, 'auto')
        const newRates = await fetchExchangeRates()
        setRates(newRates)
        setLatestRate(newRates[0])
      }
    } catch (err) {
      console.error('Otomatik kur güncelleme hatası:', err)
    }
  }

  const manualUpdate = async (date, rate) => {
    await upsertExchangeRate(date, rate, 'manual')
    await loadRates()
  }

  // Belirli bir tarih için kur bul (o tarih veya öncesindeki en yakın)
  const getRateAt = (dateStr) => {
    if (!rates.length) return latestRate?.chf_to_try || FALLBACK_RATE
    const found = rates.find(r => r.date <= dateStr)
    return found ? found.chf_to_try : (rates[rates.length-1]?.chf_to_try || FALLBACK_RATE)
  }

  // TL -> CHF dönüşüm
  const tryToCHF = (amount, dateStr = null) => {
    const rate = dateStr ? getRateAt(dateStr) : (latestRate?.chf_to_try || FALLBACK_RATE)
    return amount / rate
  }

  // CHF -> TL dönüşüm
  const chfToTry = (amount, dateStr = null) => {
    const rate = dateStr ? getRateAt(dateStr) : (latestRate?.chf_to_try || FALLBACK_RATE)
    return amount * rate
  }

  return (
    <CurrencyContext.Provider value={{
      rates, latestRate, loading,
      tryToCHF, chfToTry, getRateAt,
      manualUpdate, autoUpdateRate, reload: loadRates
    }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export const useCurrency = () => useContext(CurrencyContext)

// Formatter
export const fmtCHF = (n) => 'CHF ' + new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
