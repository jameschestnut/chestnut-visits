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
  { value: 'am',       label: 'AM (09:00–13:00)' },
  { value: 'pm',       label: 'PM (13:00–17:00)' },
  { value: 'full_day', label: 'Full day (09:00–17:00)' },
]

const FREQUENCY_LABELS: Record<string, string> = {
  weekly:       'Weekly',
  fortnightly:  'Fortnightly',
  three_weekly: 'Every 3 weeks',
  monthly:      'Monthly',
  half_termly:  'Half-termly',
  termly:       'Termly',
  custom:       'Custom',
}

const ROTA_COLOURS: Record<number, string> = {
  1: '#C0392B',
  2: '#1A6FA8',
  3: '#3D6B5E',
  4: '#7A5C2E',
  5: '#6B3A7A',
  6: '#2C6E8A',
}

// Suggested rota week selections per frequency
const FREQUENCY_SUGGESTIONS: Record<string, number[][]> = {
  weekly:       [[1,2,3,4,5,6]],
  fortnightly:  [[1,3,5],[2,4,6]],
  three_weekly: [[1,4],[2,5],[3,6]],
  monthly:      [[1,5],[2,6],[3,1],[4,2]],
  half_termly:  [[1],[2],[3],[4],[5],[6]],
  termly:       [[1],[2],[3],[4],[5],[6]],
  custom:       [],
}

interface GeneratedVisit {
  date: string
  day: string
  slot: string
  term: string
  rotaWeek: number
  isBankHoliday: boolean
  conflict: boolean
}

interface Contract {
  id: string
  start_date: string
  end_date: string
  frequency: string
  custom_visits_per_year: number | null
  visit_duration: string
}

interface Technician {
  id: string
  full_name: string
  initials: string
}

interface RotaWeek {
  week_start: string
  rota_week: number
}

interface TermDate {
  term_name: string
  start_date: string
  end_date: string
}

export default function ScheduleGeneratorPage() {
  const router = useRouter()
  const params = useParams()
  const schoolId = params.id as string
  const supabase = createClient()

  const [school, setSchool]             = useState<{ name: string } | null>(null)
  const [contract, setContract]         = useState<Contract | null>(null)
  const [technicians, setTechnicians]   = useState<Technician[]>([])
  const [rotaCalendar, setRotaCalendar] = useState<RotaWeek[]>([])
  const [termDates, setTermDates]       = useState<TermDate[]>([])
  const [bankHolidays, setBankHolidays] = useState<Set<string>>(new Set())
  const [existingVisits, setExistingVisits] = useState<{ visit_date: string; slot: string; technician_id: string }[]>([])
  const [loading, setLoading]           = useState(true)
  const [noRota, setNoRota]             = useState(false)

  const [form, setForm] = useState({
    technician_id:       '',
    preferred_day:       1,
    preferred_slot:      'am',
    selected_rota_weeks: [1, 3, 5] as number[],
  })

  const [preview, setPreview] = useState<GeneratedVisit[] | null>(null)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

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
        supabase.from('contracts').select('*').eq('school_id', schoolId).eq('status', 'active').single(),
        supabase.from('technicians').select('id, full_name, initials').eq('is_active', true).order('full_name'),
        supabase.from('rota_calendar').select('week_start, rota_week').order('week_start'),
        supabase.from('term_dates').select('term_name, start_date, end_date').order('start_date'),
        supabase.from('bank_holidays').select('holiday_date'),
        supabase.from('visits').select('visit_date, slot, technician_id').eq('school_id', schoolId),
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

      if (contractData?.frequency) {
        const suggestions = FREQUENCY_SUGGESTIONS[contractData.frequency]
        if (suggestions?.length > 0) {
          setForm(f => ({ ...f, selected_rota_weeks: suggestions[0] }))
        }
      }
    }
    load()
  }, [schoolId])

  // ── Helpers ────────────────────────────────────────────────────────────────

  function toStr(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  function addDays(date: Date, n: number): Date {
    const d = new Date(date)
    d.setDate(d.getDate() + n)
    return d
  }

  function getMonday(date: Date): Date {
    const d = new Date(date)
    const day = d.getDay()
    const diff = day === 0 ? -6 : 1 - day
    d.setDate(d.getDate() + diff)
    return d
  }

  function getRotaWeekForDate(monday: Date): number | null {
    return rotaCalendar.find(r => r.week_start === toStr(monday))?.rota_week ?? null
  }

  function getTermName(dateStr: string): string {
    const term = termDates.find(t => dateStr >= t.start_date && dateStr <= t.end_date)
    return term?.term_name ?? 'School holiday'
  }

  function isBankHoliday(dateStr: string): boolean {
    return bankHolidays.has(dateStr)
  }

  function hasConflict(dateStr: string, slot: string, techId: string): boolean {
    return existingVisits.some(v =>
      v.visit_date === dateStr &&
      v.technician_id === techId &&
      (v.slot === slot || slot === 'full_day' || v.slot === 'full_day')
    )
  }

  function toggleRotaWeek(week: number) {
    setForm(prev => {
      const current = prev.selected_rota_weeks
      const updated = current.includes(week)
        ? current.filter(w => w !== week)
        : [...current, week].sort()
      return { ...prev, selected_rota_weeks: updated }
    })
    setPreview(null)
  }

  // ── Generate ───────────────────────────────────────────────────────────────

  function generatePreview() {
    if (!contract || !form.technician_id || form.selected_rota_weeks.length === 0) return
    setError(null)

    const visits: GeneratedVisit[] = []
    const dayNames  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const dayOffset = form.preferred_day - 1

    const contractStart = new Date(contract.start_date + 'T12:00:00')
    const contractEnd   = new Date(contract.end_date + 'T12:00:00')

    let weekStart = getMonday(contractStart)

    while (weekStart <= contractEnd) {
      const rotaWeek = getRotaWeekForDate(weekStart)

      if (rotaWeek && form.selected_rota_weeks.includes(rotaWeek)) {
        const visitDate = addDays(weekStart, dayOffset)
        const dateStr   = toStr(visitDate)
        const bankHol   = isBankHoliday(dateStr)

        visits.push({
          date:          dateStr,
          day:           dayNames[visitDate.getDay()],
          slot:          form.preferred_slot,
          term:          bankHol ? 'Bank holiday' : getTermName(dateStr),
          rotaWeek,
          isBankHoliday: bankHol,
          conflict:      !bankHol && hasConflict(dateStr, form.preferred_slot, form.technician_id),
        })
      }

      weekStart = addDays(weekStart, 7)
    }

    if (visits.length === 0) {
      setError('No visits generated. Make sure the rota calendar covers the contract period and the selected rota weeks are correct.')
    }

    setPreview(visits)
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!preview || !contract) return
    setSaving(true)
    setError(null)

    const { error } = await supabase
      .from('visits')
      .insert(
        preview.map(v => ({
          school_id:     schoolId,
          technician_id: form.technician_id,
          contract_id:   contract.id,
          visit_date:    v.date,
          slot:          v.slot,
          status:        v.isBankHoliday ? 'banked' : 'confirmed',
          visit_type:    'technology_partner',
          banked_at:     v.isBankHoliday ? new Date().toISOString() : null,
        }))
      )

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

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
            style={{ background: '#8B3A2A' }}>
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
            style={{ background: '#8B3A2A' }}>
            Go to calendar
          </Link>
        </div>
      </div>
    )
  }

  const confirmedCount = preview?.filter(v => !v.isBankHoliday).length ?? 0
  const bankedCount    = preview?.filter(v => v.isBankHoliday).length ?? 0
  const conflictCount  = preview?.filter(v => v.conflict).length ?? 0
  const suggestions    = FREQUENCY_SUGGESTIONS[contract.frequency] ?? []

  return (
    <div className="max-w-4xl">

      <div className="flex items-center gap-3 mb-6">
        <Link href={`/admin/schools/${schoolId}`} className="text-gray-400 hover:text-gray-600 text-sm">
          ← {school?.name}
        </Link>
        <span className="text-gray-200">/</span>
        <h1 className="text-xl font-semibold text-gray-900">Generate schedule</h1>
      </div>

      <div className="grid grid-cols-3 gap-4">

        {/* Settings */}
        <div className="col-span-1 space-y-4">

          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Contract</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-400">Frequency</dt>
                <dd className="font-medium text-gray-900">{FREQUENCY_LABELS[contract.frequency]}</dd>
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
            </dl>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Settings</h2>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Technician</label>
              <select
                value={form.technician_id}
                onChange={e => setForm(p => ({ ...p, technician_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">Select...</option>
                {technicians.map(t => (
                  <option key={t.id} value={t.id}>{t.full_name} ({t.initials})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Preferred day</label>
              <select
                value={form.preferred_day}
                onChange={e => { setForm(p => ({ ...p, preferred_day: parseInt(e.target.value) })); setPreview(null) }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                {DAY_OPTIONS.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Slot</label>
              <select
                value={form.preferred_slot}
                onChange={e => { setForm(p => ({ ...p, preferred_slot: e.target.value })); setPreview(null) }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                {SLOT_OPTIONS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Rota week selection — single set of buttons */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Visit on rota weeks
              </label>
              <div className="flex gap-1.5 mb-2">
                {[1,2,3,4,5,6].map(w => (
                  <button
                    key={w}
                    onClick={() => toggleRotaWeek(w)}
                    className="w-8 h-8 rounded-lg text-sm font-bold text-white transition-opacity"
                    style={{
                      background: ROTA_COLOURS[w],
                      opacity:    form.selected_rota_weeks.includes(w) ? 1 : 0.2,
                    }}
                    title={`Rota week ${w}`}
                  >
                    {w}
                  </button>
                ))}
              </div>

              {/* Quick suggestions based on frequency */}
{/* Quick suggestions based on frequency */}
{suggestions.length > 0 && (
  <div className="mb-1">
    <p className="text-xs text-gray-400 mb-1">Presets for {FREQUENCY_LABELS[contract.frequency].toLowerCase()}:</p>
    <div className="flex flex-wrap gap-1">
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => { setForm(p => ({ ...p, selected_rota_weeks: s })); setPreview(null) }}
          className={`text-xs px-2 py-1 rounded-md transition-colors border ${
            JSON.stringify(form.selected_rota_weeks) === JSON.stringify(s)
              ? 'border-gray-900 bg-gray-900 text-white'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          Weeks {s.join(', ')}
        </button>
      ))}
    </div>
  </div>
)}

              <p className="text-xs text-gray-400 mt-1">
                {form.selected_rota_weeks.length} visit{form.selected_rota_weeks.length !== 1 ? 's' : ''} per 6-week cycle
              </p>
            </div>

            <button
              onClick={generatePreview}
              disabled={!form.technician_id || form.selected_rota_weeks.length === 0}
              className="w-full py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
              style={{ background: '#8B3A2A' }}
            >
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

              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">{preview.length} visits</span>
                  <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                    {confirmedCount} confirmed
                  </span>
                  {bankedCount > 0 && (
                    <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                      {bankedCount} to bank
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
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                  style={{ background: '#8B3A2A' }}
                >
                  {saving ? 'Saving…' : 'Confirm & save all'}
                </button>
              </div>

              <div className="divide-y divide-gray-50 max-h-[560px] overflow-auto">
                {preview.map((visit, i) => (
                  <div key={i}
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm ${
                      visit.isBankHoliday ? 'bg-purple-50/40 opacity-70' :
                      visit.conflict      ? 'bg-amber-50' : ''
                    }`}
                  >
                    <span className="text-gray-300 w-5 text-xs text-right">{i + 1}</span>

                    <span className="font-medium text-gray-900 w-20">
                      {new Date(visit.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>

                    <span className="text-gray-400 w-7 text-xs">{visit.day}</span>

                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-14 text-center ${
                      visit.slot === 'am'       ? 'bg-blue-50 text-blue-700' :
                      visit.slot === 'pm'       ? 'bg-orange-50 text-orange-700' :
                                                  'bg-gray-100 text-gray-600'
                    }`}>
                      {visit.slot === 'full_day' ? 'Full' : visit.slot.toUpperCase()}
                    </span>

                    <span
                      className="inline-flex w-5 h-5 items-center justify-center rounded-full text-white font-bold text-xs shrink-0"
                      style={{ background: ROTA_COLOURS[visit.rotaWeek] }}
                      title={`Rota week ${visit.rotaWeek}`}
                    >
                      {visit.rotaWeek}
                    </span>

                    <span className="text-gray-500 text-xs flex-1">{visit.term}</span>

                    {visit.isBankHoliday && (
                      <span className="text-xs text-purple-500 shrink-0">banked</span>
                    )}
                    {visit.conflict && (
                      <span className="text-xs text-amber-600 font-medium shrink-0">⚠ conflict</span>
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