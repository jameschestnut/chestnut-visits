'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

const DAY_OPTIONS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
]

const SLOT_OPTIONS = [
  { value: 'am', label: 'AM (09:00–13:00)' },
  { value: 'pm', label: 'PM (13:00–17:00)' },
]

const FREQUENCY_OPTIONS = [
  { value: 'weekly',      label: 'Weekly',      description: 'Every term week' },
  { value: 'fortnightly', label: 'Fortnightly',  description: 'Every other term week' },
  { value: 'monthly',     label: 'Monthly',      description: 'Specific monthly slots' },
  { value: 'half_termly', label: 'Half-termly',  description: 'One per half-term' },
]

interface School { id: string; name: string; short_name: string | null }
interface Contract {
  id: string
  start_date: string
  end_date: string
  frequency: string
  visit_duration: string
}
interface RotaWeek {
  week_start: string
  tag_weekly: boolean | null
  tag_fortnightly: number | null
  tag_monthly: number | null
}
interface TermDate { term_name: string; start_date: string; end_date: string }
interface GeneratedVisit {
  date: string; slot: string; termName: string
  bhAdjusted: boolean; conflict: boolean
}

function toStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate()+n); return r }
function getMondayOf(d: Date) {
  const r = new Date(d)
  const day = r.getDay()
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1))
  return r
}

function getDatePresets(contract: Contract | null) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const laStart   = m >= 4 ? y : y - 1
  const acadStart = m >= 9 ? y : y - 1
  const presets = [
    { label: `LA ${laStart}-${String(laStart+1).slice(2)}`,       start: `${laStart}-04-01`,     end: `${laStart+1}-03-31` },
    { label: `LA ${laStart+1}-${String(laStart+2).slice(2)}`,     start: `${laStart+1}-04-01`,   end: `${laStart+2}-03-31` },
    { label: `Acad ${acadStart}-${String(acadStart+1).slice(2)}`, start: `${acadStart}-09-01`,   end: `${acadStart+1}-07-18` },
    { label: `Acad ${acadStart+1}-${String(acadStart+2).slice(2)}`, start: `${acadStart+1}-09-01`, end: `${acadStart+2}-07-18` },
  ]
  if (contract) {
    presets.push({ label: 'Contract dates', start: contract.start_date, end: contract.end_date })
  }
  return presets
}

export default function ScheduleGeneratePage() {
  const router   = useRouter()
  const supabase = createClient()

  // Reference data
  const [schools, setSchools]           = useState<School[]>([])
  const [technicians, setTechnicians]   = useState<{ id: string; full_name: string; initials: string }[]>([])
  const [rotaCalendar, setRotaCalendar] = useState<RotaWeek[]>([])
  const [termDates, setTermDates]       = useState<TermDate[]>([])
  const [bankHolidays, setBankHolidays] = useState<Set<string>>(new Set())
  const [loadingRef, setLoadingRef]     = useState(true)

  // School & contract
  const [schoolId, setSchoolId]   = useState('')
  const [contract, setContract]   = useState<Contract | null>(null)
  const [loadingContract, setLoadingContract] = useState(false)
  const [existingVisits, setExistingVisits]   = useState<{ visit_date: string; slot: string; technician_id: string }[]>([])

  // Timeframe
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate]     = useState('')

  // Frequency (defaults to contract frequency, overridable)
  const [frequency, setFrequency] = useState('')
  const [visitDuration, setVisitDuration] = useState('half_day')

  // Settings
  const [techId, setTechId]               = useState('')
  const [preferredDay, setPreferredDay]   = useState(1)
  const [preferredSlot, setPreferredSlot] = useState('am')
  const [fortnightlyTag, setFortnightlyTag] = useState<1 | 2 | null>(null)
  const [monthlyTags, setMonthlyTags]     = useState<number[]>([])

  // Output
  const [preview, setPreview] = useState<GeneratedVisit[] | null>(null)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // Load reference data once
  useEffect(() => {
    async function load() {
      const [
        { data: schoolData },
        { data: techData },
        { data: rotaData },
        { data: termData },
        { data: holidayData },
      ] = await Promise.all([
        supabase.from('schools').select('id,name,short_name').eq('is_active', true).order('name'),
        supabase.from('technicians').select('id,full_name,initials,is_active,leaving_date').order('full_name'),
        supabase.from('rota_calendar').select('week_start,tag_weekly,tag_fortnightly,tag_monthly').order('week_start'),
        supabase.from('term_dates').select('term_name,start_date,end_date').order('start_date'),
        supabase.from('bank_holidays').select('holiday_date'),
      ])
      setSchools(schoolData ?? [])
      const today2 = new Date().toISOString().split('T')[0]
      setTechnicians((techData ?? []).filter((t: { is_active: boolean; leaving_date: string | null }) =>
        t.is_active || (t.leaving_date && t.leaving_date >= today2)
      ))
      setRotaCalendar(rotaData ?? [])
      setTermDates(termData ?? [])
      setBankHolidays(new Set((holidayData ?? []).map((h: { holiday_date: string }) => h.holiday_date)))
      setLoadingRef(false)
    }
    load()
  }, [])

  // Load contract when school changes
  useEffect(() => {
    if (!schoolId) { setContract(null); setExistingVisits([]); return }
    setLoadingContract(true)
    const today = new Date().toISOString().split('T')[0]
    Promise.all([
      supabase.from('contracts')
        .select('id,start_date,end_date,frequency,visit_duration')
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .lte('start_date', today)
        .gte('end_date', today)
        .maybeSingle(),
      supabase.from('visits')
        .select('visit_date,slot,technician_id')
        .eq('school_id', schoolId),
    ]).then(([{ data: c }, { data: v }]) => {
      setContract(c ?? null)
      setExistingVisits(v ?? [])
      const supportedFreqs = FREQUENCY_OPTIONS.map(o => o.value)
      setFrequency(c?.frequency && supportedFreqs.includes(c.frequency) ? c.frequency : '')
      setVisitDuration(c?.visit_duration ?? 'half_day')
      setFortnightlyTag(null)
      setMonthlyTags([])
      setPreview(null)
      setLoadingContract(false)
    })
  }, [schoolId])

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getTermName(dateStr: string) {
    return termDates.find(t => dateStr >= t.start_date && dateStr <= t.end_date)?.term_name ?? 'School holiday'
  }

  function isTermTime(weekStart: string) {
    const weekEnd = toStr(addDays(new Date(weekStart + 'T12:00:00'), 4))
    return termDates.some(t => weekStart <= t.end_date && t.start_date <= weekEnd)
  }

  function hasConflict(dateStr: string, slot: string, tid: string) {
    return existingVisits.some(v =>
      v.visit_date === dateStr && v.technician_id === tid &&
      (v.slot === slot || slot === 'full_day' || v.slot === 'full_day')
    )
  }

  function resolveDate(weekStart: Date, dayOffset: number): { date: string; bhAdjusted: boolean } {
    const d = addDays(weekStart, dayOffset)
    const dStr = toStr(d)
    if (bankHolidays.has(dStr)) {
      const tue = addDays(weekStart, dayOffset === 0 ? 1 : dayOffset + 1)
      return { date: toStr(tue), bhAdjusted: true }
    }
    return { date: dStr, bhAdjusted: false }
  }

  function needsFortnightlyTag() {
    return ['fortnightly', 'one_point_five_weekly'].includes(frequency)
  }

  function needsMonthlyTags() {
    return ['monthly', 'half_termly'].includes(frequency)
  }

  function tagsReady() {
    if (!contract) return true
    if (needsFortnightlyTag()) return fortnightlyTag === 1 || fortnightlyTag === 2
    if (needsMonthlyTags()) return monthlyTags.length > 0
    return true
  }

  // ── Generate ───────────────────────────────────────────────────────────────

  function generatePreview() {
    if (!techId || !startDate || !endDate || !schoolId || !frequency) return
    setError(null)

    const freq     = frequency
    const duration = visitDuration
    const visits: GeneratedVisit[] = []
    const rangeStart = new Date(startDate + 'T12:00:00')
    const rangeEnd   = new Date(endDate   + 'T12:00:00')
    const dayOffset  = preferredDay - 1
    const slot       = duration === 'full_day' ? 'full_day' : preferredSlot

    let weekStart = getMondayOf(rangeStart)

    while (weekStart <= rangeEnd) {
      const wsStr = toStr(weekStart)
      const rota  = rotaCalendar.find(r => r.week_start === wsStr)

      if (!rota || !isTermTime(wsStr)) { weekStart = addDays(weekStart, 7); continue }

      const addVisit = (offset: number, s: string) => {
        const { date, bhAdjusted } = resolveDate(weekStart, offset)
        if (date < startDate || date > endDate) return
        visits.push({
          date, slot: s,
          termName:   getTermName(date),
          bhAdjusted,
          conflict:   hasConflict(date, s, techId),
        })
      }

      if (freq === 'weekly' && rota.tag_weekly) {
        addVisit(dayOffset, slot)
      } else if (freq === 'twice_weekly' && rota.tag_weekly) {
        addVisit(dayOffset, 'full_day')
      } else if (freq === 'three_times_weekly' && rota.tag_weekly) {
        addVisit(0, slot); addVisit(2, slot); addVisit(4, slot)
      } else if (freq === 'fortnightly' && fortnightlyTag !== null && rota.tag_fortnightly === fortnightlyTag) {
        addVisit(dayOffset, slot)
      } else if (freq === 'one_point_five_weekly' && fortnightlyTag !== null) {
        if (rota.tag_fortnightly === fortnightlyTag) addVisit(dayOffset, 'full_day')
        else if (rota.tag_weekly) addVisit(dayOffset, preferredSlot)
      } else if ((freq === 'monthly' || freq === 'half_termly') && monthlyTags.length > 0 &&
                 rota.tag_monthly !== null && monthlyTags.includes(rota.tag_monthly)) {
        addVisit(dayOffset, slot)
      }

      weekStart = addDays(weekStart, 7)
    }

    if (visits.length === 0) setError('No visits generated. Check your date range, rota tags, and that term dates are set up.')
    setPreview(visits)
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!preview || !schoolId || !techId) return
    setSaving(true)
    setError(null)

    const { error: err } = await supabase.from('visits').insert(
      preview.map(v => ({
        school_id:     schoolId,
        technician_id: techId,
        contract_id:   contract?.id ?? null,
        visit_date:    v.date,
        slot:          v.slot,
        status:        'confirmed',
        visit_type:    'technology_partner',
        notes:         v.bhAdjusted ? 'Moved from bank holiday Monday' : null,
      }))
    )

    if (err) { setError(err.message); setSaving(false); return }
    router.push('/admin/schedule')
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const freq        = frequency
  const showDay     = !!freq
  const showSlot    = !!freq && visitDuration === 'half_day'
  const canGenerate = !!schoolId && !!techId && !!freq && !!startDate && !!endDate && tagsReady()

  const confirmedCount = preview?.filter(v => !v.conflict).length ?? 0
  const conflictCount  = preview?.filter(v => v.conflict).length ?? 0
  const adjustedCount  = preview?.filter(v => v.bhAdjusted).length ?? 0

  const presets = getDatePresets(contract)

  if (loadingRef) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">

      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/schedule" className="text-gray-400 hover:text-gray-600 text-sm">← Planner</Link>
        <span className="text-gray-200">/</span>
        <h1 className="text-xl font-semibold text-gray-900">Generate schedule</h1>
      </div>

      <div className="grid grid-cols-3 gap-4">

        {/* Settings */}
        <div className="col-span-1 space-y-4">

          {/* School */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">School</h2>
            <select
              value={schoolId}
              onChange={e => { setSchoolId(e.target.value); setPreview(null); setStartDate(''); setEndDate('') }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
              <option value="">Select school…</option>
              {schools.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            {schoolId && loadingContract && (
              <p className="text-xs text-gray-400">Loading contract…</p>
            )}
            {schoolId && !loadingContract && !contract && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                No active contract found — using manual settings.
              </p>
            )}
            {schoolId && !loadingContract && (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Frequency</label>
                  <select value={frequency}
                    onChange={e => { setFrequency(e.target.value); setFortnightlyTag(null); setMonthlyTags([]); setPreview(null) }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                    <option value="">Select…</option>
                    {FREQUENCY_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Duration</label>
                  <select value={visitDuration}
                    onChange={e => { setVisitDuration(e.target.value); setPreview(null) }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                    <option value="half_day">Half day</option>
                    <option value="full_day">Full day</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Timeframe */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Timeframe</h2>

            <div className="flex flex-wrap gap-1.5">
              {presets.map(p => (
                <button key={p.label} type="button"
                  onClick={() => { setStartDate(p.start); setEndDate(p.end); setPreview(null) }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    startDate === p.start && endDate === p.end
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Start date</label>
                <input type="date" value={startDate}
                  onChange={e => { setStartDate(e.target.value); setPreview(null) }}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">End date</label>
                <input type="date" value={endDate} min={startDate}
                  onChange={e => { setEndDate(e.target.value); setPreview(null) }}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>
          </div>

          {/* Settings */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Settings</h2>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Technician</label>
              <select value={techId} onChange={e => { setTechId(e.target.value); setPreview(null) }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="">Select…</option>
                {technicians.map(t => (
                  <option key={t.id} value={t.id}>{t.full_name} ({t.initials})</option>
                ))}
              </select>
            </div>

            {showDay && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Preferred day</label>
                <select value={preferredDay} onChange={e => { setPreferredDay(parseInt(e.target.value)); setPreview(null) }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                  {DAY_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
            )}

            {showSlot && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Slot</label>
                <select value={preferredSlot} onChange={e => { setPreferredSlot(e.target.value); setPreview(null) }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                  {SLOT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            )}

            {/* No contract — half-day manual slot */}
            {/* Fortnightly tag */}
            {needsFortnightlyTag() && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Fortnightly group</label>
                <div className="flex gap-2">
                  {([1, 2] as const).map(tag => (
                    <button key={tag} type="button"
                      onClick={() => { setFortnightlyTag(tag); setPreview(null) }}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        fortnightlyTag === tag
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}>
                      Week {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Monthly tags */}
            {needsMonthlyTags() && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Monthly schedule slots
                </label>
                <p className="text-xs text-gray-400 mb-2">
                  {freq === 'half_termly' ? 'Select 1 slot.' : 'Select a pair (e.g. 1 & 4).'}
                </p>
                <div className="flex gap-1.5">
                  {[1,2,3,4,5,6].map(tag => (
                    <button key={tag} type="button"
                      onClick={() => {
                        setMonthlyTags(prev =>
                          prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag].sort()
                        )
                        setPreview(null)
                      }}
                      className={`w-9 h-9 rounded-lg text-sm font-bold border transition-colors ${
                        monthlyTags.includes(tag)
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}>
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}



            <button onClick={generatePreview} disabled={!canGenerate}
              className="w-full py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
              style={{ background: '#46DA26' }}>
              Preview schedule
            </button>
          </div>

        </div>

        {/* Preview */}
        <div className="col-span-2">
          {preview === null ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center h-full flex items-center justify-center">
              <div className="text-center">
                <p className="text-sm text-gray-400 mb-1">Choose a school, timeframe and settings</p>
                <p className="text-xs text-gray-300">then click Preview schedule</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">

              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">{preview.length} visits</span>
                  <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                    {confirmedCount} to confirm
                  </span>
                  {adjustedCount > 0 && (
                    <span className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                      {adjustedCount} BH adjusted
                    </span>
                  )}
                  {conflictCount > 0 && (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <button onClick={handleConfirm} disabled={saving || preview.length === 0}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                  style={{ background: '#46DA26' }}>
                  {saving ? 'Saving…' : 'Confirm & save all'}
                </button>
              </div>

              <div className="divide-y divide-gray-50 max-h-[560px] overflow-auto">
                {preview.map((v, i) => (
                  <div key={i} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${
                    v.conflict ? 'bg-amber-50' : v.bhAdjusted ? 'bg-blue-50/40' : ''
                  }`}>
                    <span className="text-gray-300 w-5 text-xs text-right shrink-0">{i + 1}</span>
                    <span className="font-medium text-gray-900 w-20 shrink-0">
                      {new Date(v.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                    <span className="text-gray-400 text-xs w-7 shrink-0">
                      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(v.date + 'T12:00:00').getDay()]}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-14 text-center shrink-0 ${
                      v.slot === 'am'       ? 'bg-blue-50 text-blue-700' :
                      v.slot === 'pm'       ? 'bg-orange-50 text-orange-700' :
                                              'bg-gray-100 text-gray-600'
                    }`}>
                      {v.slot === 'full_day' ? 'Full' : v.slot.toUpperCase()}
                    </span>
                    <span className="text-gray-500 text-xs flex-1 truncate">{v.termName}</span>
                    {v.bhAdjusted && <span className="text-xs text-blue-500 shrink-0">BH → Tue</span>}
                    {v.conflict && <span className="text-xs text-amber-600 font-medium shrink-0">⚠ clash</span>}
                  </div>
                ))}
              </div>

              {error && (
                <div className="px-4 py-3 border-t border-gray-100">
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}

            </div>
          )}

          {error && preview === null && (
            <div className="mt-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
