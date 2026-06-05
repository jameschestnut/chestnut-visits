'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
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

const FREQUENCY_LABELS: Record<string, string> = {
  weekly:                'Weekly',
  one_point_five_weekly: '1.5x Weekly',
  twice_weekly:          '2x Weekly',
  three_times_weekly:    '3x Weekly',
  fortnightly:           'Fortnightly',
  three_weekly:          'Every 3 weeks',
  monthly:               'Monthly',
  half_termly:           'Half-termly',
  termly:                'Termly',
  custom:                'Custom',
}

interface Contract {
  id: string
  start_date: string
  end_date: string
  frequency: string
  visit_duration: string
  fortnightly_tag: number | null
  monthly_tags: number[] | null
}

interface RotaWeek {
  week_start: string
  tag_weekly: boolean | null
  tag_fortnightly: number | null
  tag_monthly: number | null
}

interface TermDate {
  term_name: string
  start_date: string
  end_date: string
}

interface GeneratedVisit {
  date: string
  slot: string
  termName: string
  isBankHoliday: boolean
  bhAdjusted: boolean
  conflict: boolean
}

function toStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function getMondayOf(d: Date): Date {
  const r = new Date(d)
  const day = r.getDay()
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1))
  return r
}

export default function ScheduleGeneratorPage() {
  const router   = useRouter()
  const params   = useParams()
  const schoolId = params.id as string
  const supabase = createClient()

  const [school, setSchool]           = useState<{ name: string } | null>(null)
  const [contract, setContract]       = useState<Contract | null>(null)
  const [technicians, setTechnicians] = useState<{ id: string; full_name: string; initials: string }[]>([])
  const [rotaCalendar, setRotaCalendar] = useState<RotaWeek[]>([])
  const [termDates, setTermDates]     = useState<TermDate[]>([])
  const [bankHolidays, setBankHolidays] = useState<Set<string>>(new Set())
  const [existingVisits, setExistingVisits] = useState<{ visit_date: string; slot: string; technician_id: string }[]>([])
  const [loading, setLoading]         = useState(true)
  const [noRota, setNoRota]           = useState(false)

  const [techId, setTechId]           = useState('')
  const [preferredDay, setPreferredDay] = useState(1)
  const [preferredSlot, setPreferredSlot] = useState('am')
  // For termly/custom: manual dates
  const [manualDates, setManualDates] = useState<string[]>([''])

  const [preview, setPreview]         = useState<GeneratedVisit[] | null>(null)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [
        { data: schoolData },
        { data: contractData },
        { data: techData },
        { data: rotaData },
        { data: termData },
        { data: holidayData },
        { data: visitData },
      ] = await Promise.all([
        supabase.from('schools').select('name').eq('id', schoolId).single(),
        supabase.from('contracts').select('id,start_date,end_date,frequency,visit_duration,fortnightly_tag,monthly_tags')
          .eq('school_id', schoolId).eq('status', 'active')
          .lte('start_date', new Date().toISOString().split('T')[0])
          .gte('end_date', new Date().toISOString().split('T')[0])
          .single(),
        supabase.from('technicians').select('id,full_name,initials').eq('is_active', true).order('full_name'),
        supabase.from('rota_calendar').select('week_start,tag_weekly,tag_fortnightly,tag_monthly').order('week_start'),
        supabase.from('term_dates').select('term_name,start_date,end_date').order('start_date'),
        supabase.from('bank_holidays').select('holiday_date'),
        supabase.from('visits').select('visit_date,slot,technician_id').eq('school_id', schoolId),
      ])

      setSchool(schoolData)
      setContract(contractData)
      setTechnicians(techData ?? [])
      setRotaCalendar(rotaData ?? [])
      setTermDates(termData ?? [])
      setBankHolidays(new Set((holidayData ?? []).map((h: { holiday_date: string }) => h.holiday_date)))
      setExistingVisits(visitData ?? [])
      setNoRota(!rotaData || rotaData.length === 0)
      setLoading(false)
    }
    load()
  }, [schoolId])

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getTermName(dateStr: string): string {
    const t = termDates.find(t => dateStr >= t.start_date && dateStr <= t.end_date)
    return t?.term_name ?? 'School holiday'
  }

  function isTermTime(weekStart: string): boolean {
    const weekEnd = toStr(addDays(new Date(weekStart + 'T12:00:00'), 4))
    return termDates.some(t => weekStart <= t.end_date && t.start_date <= weekEnd)
  }

  function hasConflict(dateStr: string, slot: string, tid: string): boolean {
    return existingVisits.some(v =>
      v.visit_date === dateStr && v.technician_id === tid &&
      (v.slot === slot || slot === 'full_day' || v.slot === 'full_day')
    )
  }

  function resolveDate(weekStart: Date, dayOffset: number): { date: string; bhAdjusted: boolean } {
    const d     = addDays(weekStart, dayOffset)
    const dStr  = toStr(d)
    if (bankHolidays.has(dStr)) {
      const tue     = addDays(weekStart, dayOffset === 0 ? 1 : dayOffset + 1)
      return { date: toStr(tue), bhAdjusted: true }
    }
    return { date: dStr, bhAdjusted: false }
  }

  // ── Tag validation ─────────────────────────────────────────────────────────

  function contractNeedsFortnightlyTag(): boolean {
    return ['fortnightly', 'one_point_five_weekly'].includes(contract?.frequency ?? '')
  }

  function contractNeedsMonthlyTags(): boolean {
    return ['monthly', 'three_weekly', 'half_termly'].includes(contract?.frequency ?? '')
  }

  function tagsConfigured(): boolean {
    if (!contract) return false
    const freq = contract.frequency
    if (freq === 'fortnightly' || freq === 'one_point_five_weekly') {
      return contract.fortnightly_tag === 1 || contract.fortnightly_tag === 2
    }
    if (freq === 'monthly' || freq === 'three_weekly' || freq === 'half_termly') {
      return Array.isArray(contract.monthly_tags) && contract.monthly_tags.length > 0
    }
    return true
  }

  // ── Generate ───────────────────────────────────────────────────────────────

  function generatePreview() {
    if (!contract || !techId) return
    setError(null)

    const freq      = contract.frequency
    const isManual  = freq === 'termly' || freq === 'custom'

    if (isManual) {
      const visits: GeneratedVisit[] = []
      for (const ds of manualDates) {
        if (!ds) continue
        const isBH = bankHolidays.has(ds)
        visits.push({
          date:        ds,
          slot:        contract.visit_duration === 'full_day' ? 'full_day' : preferredSlot,
          termName:    getTermName(ds),
          isBankHoliday: isBH,
          bhAdjusted:  false,
          conflict:    hasConflict(ds, preferredSlot, techId),
        })
      }
      if (visits.length === 0) { setError('Add at least one visit date.'); return }
      setPreview(visits)
      return
    }

    const visits: GeneratedVisit[] = []
    const contractStart = new Date(contract.start_date + 'T12:00:00')
    const contractEnd   = new Date(contract.end_date + 'T12:00:00')
    const dayOffset     = preferredDay - 1  // 0=Mon, 1=Tue, …

    let weekStart = getMondayOf(contractStart)

    while (weekStart <= contractEnd) {
      const wsStr = toStr(weekStart)
      const rota  = rotaCalendar.find(r => r.week_start === wsStr)

      if (!rota) { weekStart = addDays(weekStart, 7); continue }
      if (!isTermTime(wsStr)) { weekStart = addDays(weekStart, 7); continue }

      const addVisit = (offset: number, slot: string) => {
        const { date, bhAdjusted } = resolveDate(weekStart, offset)
        if (date < contract.start_date || date > contract.end_date) return
        visits.push({
          date,
          slot,
          termName:    getTermName(date),
          isBankHoliday: bankHolidays.has(date),
          bhAdjusted,
          conflict:    hasConflict(date, slot, techId),
        })
      }

      const slot = contract.visit_duration === 'full_day' ? 'full_day' : preferredSlot

      if (freq === 'weekly' && rota.tag_weekly) {
        addVisit(dayOffset, slot)
      } else if (freq === 'twice_weekly' && rota.tag_weekly) {
        addVisit(dayOffset, 'full_day')
      } else if (freq === 'three_times_weekly' && rota.tag_weekly) {
        addVisit(0, slot)  // Monday
        addVisit(2, slot)  // Wednesday
        addVisit(4, slot)  // Friday
      } else if (freq === 'fortnightly' && rota.tag_fortnightly === contract.fortnightly_tag) {
        addVisit(dayOffset, slot)
      } else if (freq === 'one_point_five_weekly') {
        if (rota.tag_fortnightly === contract.fortnightly_tag) {
          addVisit(dayOffset, 'full_day')
        } else if (rota.tag_weekly) {
          addVisit(dayOffset, preferredSlot)
        }
      } else if ((freq === 'monthly' || freq === 'three_weekly') &&
                 Array.isArray(contract.monthly_tags) &&
                 rota.tag_monthly !== null &&
                 contract.monthly_tags.includes(rota.tag_monthly)) {
        addVisit(dayOffset, slot)
      } else if (freq === 'half_termly' &&
                 Array.isArray(contract.monthly_tags) &&
                 rota.tag_monthly !== null &&
                 contract.monthly_tags.includes(rota.tag_monthly)) {
        addVisit(dayOffset, slot)
      }

      weekStart = addDays(weekStart, 7)
    }

    if (visits.length === 0) {
      setError('No visits generated. Check the rota calendar tags match the contract settings.')
    }
    setPreview(visits)
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!preview || !contract) return
    setSaving(true)
    setError(null)

    const { error: err } = await supabase.from('visits').insert(
      preview.map(v => ({
        school_id:     schoolId,
        technician_id: techId,
        contract_id:   contract.id,
        visit_date:    v.date,
        slot:          v.slot,
        status:        'confirmed',
        visit_type:    'technology_partner',
        notes:         v.bhAdjusted ? 'Moved from bank holiday Monday' : null,
      }))
    )

    if (err) { setError(err.message); setSaving(false); return }
    router.push(`/admin/schools/${schoolId}`)
    router.refresh()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    )
  }

  if (!contract) {
    return (
      <div className="max-w-lg">
        <div className="flex items-center gap-3 mb-6">
          <Link href={`/admin/schools/${schoolId}`} className="text-gray-400 hover:text-gray-600 text-sm">← School</Link>
          <span className="text-gray-200">/</span>
          <h1 className="text-xl font-semibold text-gray-900">Generate schedule</h1>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-6 text-center">
          <p className="text-sm text-amber-700 font-medium mb-1">No active contract</p>
          <p className="text-xs text-amber-600 mb-4">Add a contract before generating a schedule.</p>
          <Link href={`/admin/schools/${schoolId}/contracts/new`}
            className="inline-flex px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: '#46DA26' }}>
            Add contract
          </Link>
        </div>
      </div>
    )
  }

  if (noRota) {
    return (
      <div className="max-w-lg">
        <div className="flex items-center gap-3 mb-6">
          <Link href={`/admin/schools/${schoolId}`} className="text-gray-400 hover:text-gray-600 text-sm">← School</Link>
          <span className="text-gray-200">/</span>
          <h1 className="text-xl font-semibold text-gray-900">Generate schedule</h1>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-6 text-center">
          <p className="text-sm text-amber-700 font-medium mb-1">No rota calendar set up</p>
          <p className="text-xs text-amber-600 mb-4">Set up the rota calendar before generating schedules.</p>
          <Link href="/admin/calendar"
            className="inline-flex px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: '#46DA26' }}>
            Go to calendar
          </Link>
        </div>
      </div>
    )
  }

  const freq         = contract.frequency
  const isManual     = freq === 'termly' || freq === 'custom'
  const showDayPick  = !isManual && freq !== 'three_times_weekly'
  const showSlotPick = !isManual && freq !== 'twice_weekly' && freq !== 'three_times_weekly'
  const needsTags    = !tagsConfigured()

  const confirmedCount = preview?.filter(v => !v.conflict).length ?? 0
  const conflictCount  = preview?.filter(v => v.conflict).length ?? 0
  const adjustedCount  = preview?.filter(v => v.bhAdjusted).length ?? 0

  return (
    <div className="max-w-4xl">

      <div className="flex items-center gap-3 mb-6">
        <Link href={`/admin/schools/${schoolId}`} className="text-gray-400 hover:text-gray-600 text-sm">
          ← {school?.name}
        </Link>
        <span className="text-gray-200">/</span>
        <h1 className="text-xl font-semibold text-gray-900">Generate schedule</h1>
      </div>

      {needsTags && (
        <div className="mb-4 bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-start gap-3">
          <span className="text-amber-500 text-lg">⚠</span>
          <div>
            <p className="text-sm font-medium text-amber-800">Contract tags not configured</p>
            <p className="text-xs text-amber-600 mt-0.5">
              This contract needs{' '}
              {contractNeedsFortnightlyTag() ? 'a fortnightly tag (1 or 2)' : ''}
              {contractNeedsMonthlyTags() ? 'monthly tags' : ''}{' '}
              set before generating a schedule.
            </p>
            <Link href={`/admin/schools/${schoolId}/contracts/${contract.id}/edit`}
              className="inline-block mt-2 text-xs font-medium text-amber-700 underline">
              Edit contract →
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">

        {/* Settings */}
        <div className="col-span-1 space-y-4">

          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Contract</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-400">Frequency</dt>
                <dd className="font-medium text-gray-900">{FREQUENCY_LABELS[freq]}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Duration</dt>
                <dd className="font-medium text-gray-900">{contract.visit_duration === 'half_day' ? 'Half day' : 'Full day'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Start</dt>
                <dd className="font-medium text-gray-900">
                  {new Date(contract.start_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">End</dt>
                <dd className="font-medium text-gray-900">
                  {new Date(contract.end_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </dd>
              </div>
              {contract.fortnightly_tag && (
                <div className="flex justify-between">
                  <dt className="text-gray-400">Fortnightly tag</dt>
                  <dd className="font-medium text-gray-900">{contract.fortnightly_tag}</dd>
                </div>
              )}
              {Array.isArray(contract.monthly_tags) && contract.monthly_tags.length > 0 && (
                <div className="flex justify-between">
                  <dt className="text-gray-400">Monthly tags</dt>
                  <dd className="font-medium text-gray-900">{contract.monthly_tags.join(', ')}</dd>
                </div>
              )}
            </dl>
          </div>

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

            {showDayPick && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Preferred day</label>
                <select value={preferredDay} onChange={e => { setPreferredDay(parseInt(e.target.value)); setPreview(null) }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                  {DAY_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
            )}

            {freq === 'three_times_weekly' && (
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                Visits on Monday, Wednesday and Friday each term week.
              </p>
            )}

            {freq === 'twice_weekly' && (
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                Full-day visit every term week.
              </p>
            )}

            {showSlotPick && contract.visit_duration === 'half_day' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {freq === 'one_point_five_weekly' ? 'Alternate week slot' : 'Slot'}
                </label>
                <select value={preferredSlot} onChange={e => { setPreferredSlot(e.target.value); setPreview(null) }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                  {SLOT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                {freq === 'one_point_five_weekly' && (
                  <p className="text-xs text-gray-400 mt-1">Fortnightly weeks will be full day.</p>
                )}
              </div>
            )}

            {isManual && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Visit dates</label>
                <div className="space-y-2">
                  {manualDates.map((d, i) => (
                    <div key={i} className="flex gap-2">
                      <input type="date" value={d}
                        onChange={e => {
                          const next = [...manualDates]
                          next[i] = e.target.value
                          setManualDates(next)
                          setPreview(null)
                        }}
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                      {manualDates.length > 1 && (
                        <button onClick={() => { setManualDates(manualDates.filter((_, j) => j !== i)); setPreview(null) }}
                          className="text-gray-300 hover:text-gray-600 text-lg leading-none">×</button>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => setManualDates([...manualDates, ''])}
                  className="mt-2 text-xs text-gray-400 hover:text-gray-700">+ Add date</button>

                {contract.visit_duration === 'half_day' && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Slot</label>
                    <select value={preferredSlot} onChange={e => { setPreferredSlot(e.target.value); setPreview(null) }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                      {SLOT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={generatePreview}
              disabled={!techId || (needsTags && !isManual)}
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
              <p className="text-sm text-gray-400">Set the options and click Preview schedule</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">

              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">{preview.length} visits</span>
                  <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                    {confirmedCount} confirmed
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
                <button
                  onClick={handleConfirm}
                  disabled={saving || preview.length === 0}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                  style={{ background: '#46DA26' }}>
                  {saving ? 'Saving…' : 'Confirm & save all'}
                </button>
              </div>

              <div className="divide-y divide-gray-50 max-h-[560px] overflow-auto">
                {preview.map((v, i) => (
                  <div key={i}
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm ${
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

                    {v.bhAdjusted && (
                      <span className="text-xs text-blue-500 shrink-0">BH → Tue</span>
                    )}
                    {v.conflict && (
                      <span className="text-xs text-amber-600 font-medium shrink-0">⚠ clash</span>
                    )}
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
        </div>

      </div>
    </div>
  )
}
