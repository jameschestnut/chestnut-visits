'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

const ROTA_COLOURS: Record<number, string> = {
  1: '#C0392B',
  2: '#1A6FA8',
  3: '#3D6B5E',
  4: '#7A5C2E',
  5: '#6B3A7A',
  6: '#2C6E8A',
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

interface TermDate {
  term_name: string
  start_date: string
  end_date: string
}

interface BankHoliday {
  id: string
  holiday_date: string
  name: string
}

interface RotaWeek {
  id: string
  week_start: string
  rota_week: number
  is_override: boolean
}

interface DayInfo {
  date: Date
  dateStr: string
  isCurrentMonth: boolean
  isWeekend: boolean
  termName: string | null
  isInTerm: boolean
  bankHoliday: BankHoliday | null
  rotaWeek: number | null
  isRotaOverride: boolean
  weekStart: string
}

export default function CalendarPage() {
  const supabase = createClient()

  const today = new Date()
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))

  const [termDates, setTermDates]       = useState<TermDate[]>([])
  const [bankHolidays, setBankHolidays] = useState<BankHoliday[]>([])
  const [rotaCalendar, setRotaCalendar] = useState<RotaWeek[]>([])
  const [loaded, setLoaded]             = useState(false)

  // Modals
  const [addingException, setAddingException] = useState<string | null>(null)
  const [exceptionName, setExceptionName]     = useState('')
  const [overrideWeek, setOverrideWeek]       = useState<string | null>(null)
  const [overrideValue, setOverrideValue]     = useState(1)
  const [saving, setSaving]                   = useState(false)

  // Setup modal
  const [showSetup, setShowSetup]           = useState(false)
  const [setupStartDate, setSetupStartDate] = useState('')
  const [setupEndDate, setSetupEndDate]     = useState('')
  const [setupStartRota, setSetupStartRota] = useState(1)
  const [generating, setGenerating]         = useState(false)

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const [
        { data: terms },
        { data: holidays },
        { data: rota },
      ] = await Promise.all([
        supabase.from('term_dates').select('*').order('start_date'),
        supabase.from('bank_holidays').select('*').order('holiday_date'),
        supabase.from('rota_calendar').select('*').order('week_start'),
      ])

      setTermDates(terms ?? [])
      setBankHolidays(holidays ?? [])
      setRotaCalendar(rota ?? [])
      setLoaded(true)
    }
    load()
  }, [])

  // ── Date helpers ───────────────────────────────────────────────────────────

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

  function getTermName(dateStr: string): string | null {
    const found = termDates.find(t => dateStr >= t.start_date && dateStr <= t.end_date)
    return found?.term_name ?? null
  }

  function getBankHoliday(dateStr: string): BankHoliday | null {
    return bankHolidays.find(h => h.holiday_date === dateStr) ?? null
  }

  function getRotaForWeek(weekStart: string): RotaWeek | null {
    return rotaCalendar.find(r => r.week_start === weekStart) ?? null
  }

  function getAcademicYear(dateStr: string): string {
    const d     = new Date(dateStr + 'T12:00:00')
    const year  = d.getFullYear()
    const month = d.getMonth()
    const sy    = month >= 8 ? year : year - 1
    return `${sy}-${String(sy + 1).slice(2)}`
  }

  function isSchoolWeek(monday: Date): boolean {
    for (let i = 0; i < 5; i++) {
      if (getTermName(toStr(addDays(monday, i)))) return true
    }
    return false
  }

  // ── Build calendar grid ────────────────────────────────────────────────────

  function buildGrid(): DayInfo[][] {
    const year  = viewDate.getFullYear()
    const month = viewDate.getMonth()

    const firstDay = new Date(year, month, 1)
    const lastDay  = new Date(year, month + 1, 0)

    const gridStart = getMonday(firstDay)
    const gridEnd   = new Date(lastDay)
    while (gridEnd.getDay() !== 0) gridEnd.setDate(gridEnd.getDate() + 1)

    const weeks: DayInfo[][] = []
    let current = new Date(gridStart)

    while (current <= gridEnd) {
      const week: DayInfo[]  = []
      const monday           = new Date(current)
      const mondayStr        = toStr(monday)
      const rota             = getRotaForWeek(mondayStr)

      for (let d = 0; d < 7; d++) {
        const dateStr  = toStr(current)
        const termName = getTermName(dateStr)

        week.push({
          date:           new Date(current),
          dateStr,
          isCurrentMonth: current.getMonth() === month,
          isWeekend:      current.getDay() === 0 || current.getDay() === 6,
          termName,
          isInTerm:       termName !== null,
          bankHoliday:    getBankHoliday(dateStr),
          rotaWeek:       rota?.rota_week ?? null,
          isRotaOverride: rota?.is_override ?? false,
          weekStart:      mondayStr,
        })
        current = addDays(current, 1)
      }
      weeks.push(week)
    }

    return weeks
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  async function addException() {
    if (!addingException || !exceptionName.trim()) return
    setSaving(true)

    const { data: region } = await supabase
      .from('term_date_regions')
      .select('id')
      .eq('name', 'worcestershire')
      .single()

    await supabase.from('bank_holidays').insert({
      holiday_date: addingException,
      name:         exceptionName.trim(),
      region_id:    region?.id,
    })

    setSaving(false)
    setAddingException(null)
    setExceptionName('')
    window.location.reload()
  }

  async function removeException(id: string) {
    await supabase.from('bank_holidays').delete().eq('id', id)
    window.location.reload()
  }

  async function saveOverride() {
    if (!overrideWeek) return
    setSaving(true)

    await supabase.from('rota_calendar').upsert({
      week_start:    overrideWeek,
      rota_week:     overrideValue,
      academic_year: getAcademicYear(overrideWeek),
      is_override:   true,
    }, { onConflict: 'week_start' })

    setSaving(false)
    setOverrideWeek(null)
    window.location.reload()
  }

  async function generateRota() {
    if (!setupStartDate || !setupEndDate) return
    setGenerating(true)

    const start  = getMonday(new Date(setupStartDate + 'T12:00:00'))
    const end    = new Date(setupEndDate + 'T12:00:00')
    const rows: { week_start: string; rota_week: number; academic_year: string; is_override: boolean }[] = []

    let current = new Date(start)
    let rotaNum = setupStartRota - 1

    while (current <= end) {
      if (isSchoolWeek(current)) {
        rotaNum = (rotaNum % 6) + 1
        const weekStr = toStr(current)
        rows.push({
          week_start:    weekStr,
          rota_week:     rotaNum,
          academic_year: getAcademicYear(weekStr),
          is_override:   false,
        })
      }
      current = addDays(current, 7)
    }

    if (rows.length > 0) {
      await supabase.from('rota_calendar').upsert(rows, { onConflict: 'week_start' })
    }

    setGenerating(false)
    setShowSetup(false)
    window.location.reload()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-gray-400">Loading calendar...</p>
      </div>
    )
  }

  const grid    = buildGrid()
  const hasRota = rotaCalendar.length > 0

  return (
    <div className="max-w-4xl">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">School calendar</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {termDates.length} terms · {bankHolidays.length} bank holidays · {rotaCalendar.length} rota weeks loaded
          </p>
        </div>
        <button
          onClick={() => setShowSetup(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          {hasRota ? 'Regenerate rota' : 'Set up rota calendar'}
        </button>
      </div>

      {!hasRota && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-4 text-sm text-amber-700">
          No rota calendar set up yet. Click <strong>Set up rota calendar</strong> to generate rota week numbers.
        </div>
      )}

      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          className="w-8 h-8 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"
        >‹</button>
        <h2 className="text-sm font-semibold text-gray-900">
          {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}
        </h2>
        <button
          onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          className="w-8 h-8 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"
        >›</button>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">

        {/* Column headers */}
        <div className="grid grid-cols-8 border-b border-gray-100 bg-gray-50">
          <div className="px-3 py-2 text-xs font-medium text-gray-400 text-center">Rota</div>
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
            <div key={d} className="px-3 py-2 text-xs font-medium text-gray-400 text-center">{d}</div>
          ))}
        </div>

        {/* Week rows */}
        {grid.map((week, wi) => {
          const rota          = week[0].rotaWeek
          const isHolidayWeek = !week.slice(0, 5).some(d => d.isInTerm)
          const rotaColour    = rota ? ROTA_COLOURS[rota] : '#94a3b8'

          return (
            <div key={wi} className={`grid grid-cols-8 border-b border-gray-50 last:border-b-0 ${
              isHolidayWeek ? 'bg-gray-50/60' : ''
            }`}>

              {/* Rota badge */}
              <div className="flex items-center justify-center px-2 py-2 border-r border-gray-50">
                {rota && !isHolidayWeek ? (
                  <button
                    onClick={() => { setOverrideWeek(week[0].weekStart); setOverrideValue(rota) }}
                    className="w-7 h-7 rounded-full text-xs font-bold text-white flex items-center justify-center hover:opacity-80 transition-opacity"
                    style={{
                      background:  rotaColour,
                      boxShadow:   week[0].isRotaOverride ? `0 0 0 2px white, 0 0 0 3px ${rotaColour}` : 'none',
                    }}
                    title={`Rota week ${rota}${week[0].isRotaOverride ? ' (override)' : ''} — click to change`}
                  >
                    {rota}
                  </button>
                ) : (
                  <span className="text-xs text-gray-300">—</span>
                )}
              </div>

              {/* Day cells */}
              {week.map((day, di) => {
                const isToday  = day.dateStr === toStr(today)
                const canClick = !day.isWeekend && !day.bankHoliday && day.isCurrentMonth

                return (
                  <div
                    key={di}
                    onClick={() => {
                      if (canClick) {
                        setAddingException(day.dateStr)
                        setExceptionName('')
                      }
                    }}
                    className={`min-h-[60px] px-2 py-1.5 border-r border-gray-50 last:border-r-0 ${
                      !day.isCurrentMonth ? 'opacity-25' :
                      day.isWeekend      ? 'bg-gray-50/50' : ''
                    } ${canClick ? 'cursor-pointer hover:bg-blue-50/30' : ''}`}
                  >
                    {/* Date number */}
                    <div className="mb-0.5">
                      <span className={`inline-flex w-5 h-5 items-center justify-center rounded-full text-xs font-medium ${
                        isToday         ? 'bg-gray-900 text-white' :
                        day.isWeekend   ? 'text-gray-300' :
                        day.isInTerm    ? 'text-gray-800' :
                                          'text-gray-400'
                      }`}>
                        {day.date.getDate()}
                      </span>
                    </div>

                    {/* Term label on first day of term */}
                    {(() => {
                      const termStart = termDates.find(t => t.term_name === day.termName)?.start_date
                      if (day.termName && day.dateStr === termStart) {
                        return (
                          <div className="text-xs font-semibold truncate leading-tight" style={{ color: rotaColour }}>
                            {day.termName}
                          </div>
                        )
                      }
                      return null
                    })()}

                    {/* Bank holiday / closure */}
                    {day.bankHoliday && (
                      <div className="mt-0.5 flex items-start gap-0.5">
                        <span className="flex-1 text-xs bg-red-50 text-red-600 px-1 py-0.5 rounded leading-tight truncate">
                          {day.bankHoliday.name}
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); removeException(day.bankHoliday!.id) }}
                          className="text-red-300 hover:text-red-500 text-xs leading-tight shrink-0"
                        >×</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 px-1">
        {[1,2,3,4,5,6].map(w => (
          <div key={w} className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ background: ROTA_COLOURS[w] }}>{w}</div>
            W{w}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-4 h-4 rounded bg-gray-100 border border-gray-200" /> Holiday
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-4 h-4 rounded bg-red-50 border border-red-100" /> Closure
        </div>
        <div className="text-xs text-gray-400">Click any school day to add a closure</div>
      </div>

      {/* Add closure modal */}
      {addingException && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setAddingException(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-100 p-5 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Add closure</h3>
            <p className="text-xs text-gray-400 mb-4">
              {new Date(addingException + 'T12:00:00').toLocaleDateString('en-GB', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
              })}
            </p>
            <input
              type="text"
              value={exceptionName}
              onChange={e => setExceptionName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addException()}
              placeholder="e.g. INSET day, Forced closure"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 mb-3"
              autoFocus
            />
            <p className="text-xs text-gray-400 mb-4">
              This day will be treated as unavailable for scheduling across all schools.
            </p>
            <div className="flex gap-2">
              <button onClick={addException} disabled={saving || !exceptionName.trim()}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                style={{ background: '#8B3A2A' }}>
                {saving ? 'Saving…' : 'Add closure'}
              </button>
              <button onClick={() => setAddingException(null)}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Override rota week modal */}
      {overrideWeek && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setOverrideWeek(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-100 p-5 w-72" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Override rota week</h3>
            <p className="text-xs text-gray-400 mb-4">
              Week of {new Date(overrideWeek + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <div className="flex gap-2 mb-5">
              {[1,2,3,4,5,6].map(w => (
                <button key={w} onClick={() => setOverrideValue(w)}
                  className="flex-1 h-9 rounded-lg text-sm font-bold text-white transition-opacity"
                  style={{ background: ROTA_COLOURS[w], opacity: overrideValue === w ? 1 : 0.25 }}>
                  {w}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={saveOverride} disabled={saving}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                style={{ background: '#8B3A2A' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setOverrideWeek(null)}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Setup rota modal */}
      {showSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowSetup(false)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-100 p-5 w-96" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Set up rota calendar</h3>
            <p className="text-xs text-gray-400 mb-4">
              Auto-numbers all school weeks in the date range, skipping holidays. You can override individual weeks afterwards.
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">From</label>
                  <input type="date" value={setupStartDate}
                    onChange={e => setSetupStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
                  <input type="date" value={setupEndDate}
                    onChange={e => setSetupEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  First school week in this range is rota week...
                </label>
                <div className="flex gap-2">
                  {[1,2,3,4,5,6].map(w => (
                    <button key={w} onClick={() => setSetupStartRota(w)}
                      className="flex-1 h-9 rounded-lg text-sm font-bold text-white transition-opacity"
                      style={{ background: ROTA_COLOURS[w], opacity: setupStartRota === w ? 1 : 0.25 }}>
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={generateRota} disabled={generating || !setupStartDate || !setupEndDate}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                style={{ background: '#8B3A2A' }}>
                {generating ? 'Generating…' : 'Generate'}
              </button>
              <button onClick={() => setShowSetup(false)}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}