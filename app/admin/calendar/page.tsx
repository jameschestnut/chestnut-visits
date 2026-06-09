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
  id: string
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
  tag_weekly: boolean | null
  tag_fortnightly: number | null
  tag_monthly: number | null
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

type Tab = 'calendar' | 'terms' | 'holidays' | 'tags'

export default function CalendarPage() {
  const supabase = createClient()

  const today = new Date()
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [activeTab, setActiveTab] = useState<Tab>('calendar')

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

  // Term editing
  const [editingTerm, setEditingTerm] = useState<{ id?: string; term_name: string; start_date: string; end_date: string } | null>(null)
  const [savingTerm, setSavingTerm]   = useState(false)

  // Bank holiday editing
  const [editingHoliday, setEditingHoliday] = useState<{ id?: string; holiday_date: string; name: string } | null>(null)
  const [savingHoliday, setSavingHoliday]   = useState(false)

  // Year filters
  const currentYear = new Date().getFullYear()
  const [termYear, setTermYear]       = useState(currentYear)
  const [holidayYear, setHolidayYear] = useState(currentYear)
  const [tagsYear, setTagsYear]       = useState(currentYear)

  // Rota tag saving state
  const [savingTagId, setSavingTagId] = useState<string | null>(null)
  const [tagWarning, setTagWarning]   = useState<string | null>(null)

  // Calendar frequency highlight
  const [highlightFreq, setHighlightFreq]   = useState<string>('')
  const [highlightGroup, setHighlightGroup] = useState<string>('')

  // Setup modal
  const [showSetup, setShowSetup]           = useState(false)
  const [setupStartDate, setSetupStartDate] = useState('')
  const [setupEndDate, setSetupEndDate]     = useState('')

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

  async function saveTerm() {
    if (!editingTerm || !editingTerm.term_name.trim() || !editingTerm.start_date || !editingTerm.end_date) return
    setSavingTerm(true)
    if (editingTerm.id) {
      const { error } = await supabase.from('term_dates').update({
        term_name:  editingTerm.term_name.trim(),
        start_date: editingTerm.start_date,
        end_date:   editingTerm.end_date,
      }).eq('id', editingTerm.id)
      if (error) { console.error('update term error:', error); setSavingTerm(false); return }
    } else {
      const { data: region, error: regionErr } = await supabase.from('term_date_regions').select('id').eq('name', 'worcestershire').single()
      if (regionErr) console.warn('region lookup failed:', regionErr)
      const { error } = await supabase.from('term_dates').insert({
        term_name:     editingTerm.term_name.trim(),
        start_date:    editingTerm.start_date,
        end_date:      editingTerm.end_date,
        region_id:     region?.id,
        academic_year: getAcademicYear(editingTerm.start_date),
      })
      if (error) { console.error('insert term error:', error); setSavingTerm(false); return }
    }
    setSavingTerm(false)
    setEditingTerm(null)
    window.location.reload()
  }

  async function deleteTerm(id: string) {
    await supabase.from('term_dates').delete().eq('id', id)
    window.location.reload()
  }

  async function saveHoliday() {
    if (!editingHoliday || !editingHoliday.name.trim() || !editingHoliday.holiday_date) return
    setSavingHoliday(true)
    if (editingHoliday.id) {
      await supabase.from('bank_holidays').update({
        holiday_date: editingHoliday.holiday_date,
        name:         editingHoliday.name.trim(),
      }).eq('id', editingHoliday.id)
    } else {
      const { data: region } = await supabase.from('term_date_regions').select('id').eq('name', 'worcestershire').single()
      await supabase.from('bank_holidays').insert({
        holiday_date: editingHoliday.holiday_date,
        name:         editingHoliday.name.trim(),
        region_id:    region?.id,
      })
    }
    setSavingHoliday(false)
    setEditingHoliday(null)
    window.location.reload()
  }

  async function deleteHoliday(id: string) {
    await supabase.from('bank_holidays').delete().eq('id', id)
    window.location.reload()
  }

  async function generateRota() {
    if (!setupStartDate || !setupEndDate) return
    setGenerating(true)

    const start  = getMonday(new Date(setupStartDate + 'T12:00:00'))
    const end    = new Date(setupEndDate + 'T12:00:00')
    const rows: { week_start: string; academic_year: string }[] = []

    let current = new Date(start)
    while (current <= end) {
      if (isSchoolWeek(current)) {
        const weekStr = toStr(current)
        rows.push({ week_start: weekStr, academic_year: getAcademicYear(weekStr) })
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

  // ── Rota tag helpers ───────────────────────────────────────────────────────

  function validateTags(fortnightly: number | null, monthly: number | null): string | null {
    if (!monthly || monthly === 0) return null
    if (!fortnightly) return 'Set the fortnightly tag before setting a monthly tag.'
    const oddMonthly  = [1, 3, 5]
    const evenMonthly = [2, 4, 6]
    if (oddMonthly.includes(monthly) && fortnightly !== 1) {
      return `Monthly tag ${monthly} must be on a fortnightly-1 week.`
    }
    if (evenMonthly.includes(monthly) && fortnightly !== 2) {
      return `Monthly tag ${monthly} must be on a fortnightly-2 week.`
    }
    return null
  }

  async function saveRotaTag(id: string, field: 'tag_fortnightly' | 'tag_monthly', value: number | null) {
    setSavingTagId(id)
    setTagWarning(null)

    const week = rotaCalendar.find(r => r.id === id)
    if (!week) { setSavingTagId(null); return }

    const newFortnightly = field === 'tag_fortnightly' ? value : week.tag_fortnightly
    const newMonthly     = field === 'tag_monthly'     ? value : week.tag_monthly

    const warning = validateTags(newFortnightly, newMonthly)
    if (warning) {
      setTagWarning(warning)
      setSavingTagId(null)
      return
    }

    await supabase.from('rota_calendar').update({ [field]: value }).eq('id', id)

    setRotaCalendar(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
    setSavingTagId(null)
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

  const TABS: { key: Tab; label: string }[] = [
    { key: 'calendar',  label: 'Calendar' },
    { key: 'terms',     label: 'Term dates' },
    { key: 'holidays',  label: 'Bank holidays' },
    { key: 'tags',      label: 'Schedule weeks' },
  ]

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

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Calendar tab ── */}
      {activeTab === 'calendar' && (
        <>
          {/* Month nav + frequency picker */}
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

          {/* Frequency highlight controls */}
          {(() => {
            const opts: { value: string; group: string; label: string; colour: string }[] = [
              { value: '',            group: '',  label: 'None',            colour: '' },
              { value: 'weekly',      group: '',  label: 'Weekly',          colour: '#46DA26' },
              { value: 'fortnightly', group: '1', label: 'Fortnightly W1',  colour: '#C0392B' },
              { value: 'fortnightly', group: '2', label: 'Fortnightly W2',  colour: '#1A6FA8' },
              { value: 'monthly',     group: '1', label: 'Monthly 1',       colour: '#C0392B' },
              { value: 'monthly',     group: '2', label: 'Monthly 2',       colour: '#1A6FA8' },
              { value: 'monthly',     group: '3', label: 'Monthly 3',       colour: '#3D6B5E' },
              { value: 'monthly',     group: '4', label: 'Monthly 4',       colour: '#7A5C2E' },
              { value: 'monthly',     group: '5', label: 'Monthly 5',       colour: '#6B3A7A' },
              { value: 'monthly',     group: '6', label: 'Monthly 6',       colour: '#2C6E8A' },
            ]
            return (
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-xs text-gray-400 shrink-0">Highlight:</span>
                {opts.map((opt, i) => {
                  const isActive = highlightFreq === opt.value && highlightGroup === opt.group
                  return (
                    <button key={i}
                      onClick={() => { setHighlightFreq(opt.value); setHighlightGroup(opt.group) }}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                        isActive ? 'text-white border-transparent' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                      style={isActive && opt.colour ? { background: opt.colour, borderColor: opt.colour } : {}}>
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            )
          })()}

          {/* Calendar grid */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                <div key={d} className="px-3 py-2 text-xs font-medium text-gray-400 text-center">{d}</div>
              ))}
            </div>

            {grid.map((week, wi) => {
              const isHolidayWeek = !week.slice(0, 5).some(d => d.isInTerm)
              const rota          = rotaCalendar.find(r => r.week_start === week[0].weekStart)

              // Determine highlight colour for this week based on selected freq+group
              let highlightColour: string | null = null
              if (highlightFreq && rota && !isHolidayWeek) {
                const MONTHLY_COLOURS: Record<number, string> = {
                  1: '#C0392B', 2: '#1A6FA8', 3: '#3D6B5E', 4: '#7A5C2E', 5: '#6B3A7A', 6: '#2C6E8A',
                }
                if (highlightFreq === 'weekly' && rota.tag_weekly) {
                  highlightColour = '#46DA26'
                } else if (highlightFreq === 'fortnightly' && rota.tag_fortnightly) {
                  if (!highlightGroup || highlightGroup === String(rota.tag_fortnightly)) {
                    highlightColour = rota.tag_fortnightly === 1 ? '#C0392B' : '#1A6FA8'
                  }
                } else if (highlightFreq === 'monthly' && rota.tag_monthly) {
                  if (!highlightGroup || highlightGroup === String(rota.tag_monthly)) {
                    highlightColour = MONTHLY_COLOURS[rota.tag_monthly] ?? '#6B3A7A'
                  }
                }
              }

              return (
                <div key={wi}
                  className={`grid grid-cols-7 border-b border-gray-50 last:border-b-0 ${isHolidayWeek ? 'bg-gray-50/60' : ''}`}
                  style={highlightColour ? { background: highlightColour + '1a', borderLeft: `4px solid ${highlightColour}` } : {}}>

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

                        {(() => {
                          const termStart = termDates.find(t => t.term_name === day.termName)?.start_date
                          if (day.termName && day.dateStr === termStart) {
                            return (
                              <div className="text-xs font-semibold truncate leading-tight text-gray-500">
                                {day.termName}
                              </div>
                            )
                          }
                          return null
                        })()}

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
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="w-4 h-4 rounded bg-gray-100 border border-gray-200" /> Holiday
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="w-4 h-4 rounded bg-red-50 border border-red-100" /> Closure
            </div>
            <div className="text-xs text-gray-400">Click any school day to add a closure</div>
          </div>
        </>
      )}

      {/* ── Term dates tab ── */}
      {activeTab === 'terms' && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-gray-700">Term dates</h2>
              <div className="flex items-center gap-1">
                <button onClick={() => setTermYear(y => y - 1)} className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 text-xs">‹</button>
                <span className="text-xs font-medium text-gray-600 w-10 text-center">{termYear}</span>
                <button onClick={() => setTermYear(y => y + 1)} className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 text-xs">›</button>
              </div>
            </div>
            <button onClick={() => setEditingTerm({ term_name: '', start_date: '', end_date: '' })}
              className="text-xs text-gray-400 hover:text-gray-700">
              + Add term
            </button>
          </div>
          {(() => {
            const rows = [...termDates]
              .filter(t => parseInt(t.start_date.substring(0, 4)) === termYear)
              .sort((a, b) => a.start_date.localeCompare(b.start_date))
            return rows.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No terms for {termYear}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs font-medium text-gray-500">
                    <th className="text-left pb-2">Term</th>
                    <th className="text-left pb-2">Start</th>
                    <th className="text-left pb-2">End</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(t => (
                    <tr key={t.id} className="border-b border-gray-50 last:border-b-0">
                      <td className="py-2 font-medium text-gray-800">{t.term_name}</td>
                      <td className="py-2 text-gray-500">{new Date(t.start_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td className="py-2 text-gray-500">{new Date(t.end_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td className="py-2 text-right">
                        <button onClick={() => setEditingTerm({ id: t.id, term_name: t.term_name, start_date: t.start_date, end_date: t.end_date })}
                          className="text-xs text-gray-400 hover:text-gray-700 mr-3">Edit</button>
                        <button onClick={() => deleteTerm(t.id)}
                          className="text-xs text-red-400 hover:text-red-600">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          })()}
        </div>
      )}

      {/* ── Bank holidays tab ── */}
      {activeTab === 'holidays' && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-gray-700">Bank holidays &amp; closures</h2>
              <div className="flex items-center gap-1">
                <button onClick={() => setHolidayYear(y => y - 1)} className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 text-xs">‹</button>
                <span className="text-xs font-medium text-gray-600 w-10 text-center">{holidayYear}</span>
                <button onClick={() => setHolidayYear(y => y + 1)} className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 text-xs">›</button>
              </div>
            </div>
            <button onClick={() => setEditingHoliday({ holiday_date: '', name: '' })}
              className="text-xs text-gray-400 hover:text-gray-700">
              + Add
            </button>
          </div>
          {(() => {
            const rows = [...bankHolidays]
              .filter(h => parseInt(h.holiday_date.substring(0, 4)) === holidayYear)
              .sort((a, b) => a.holiday_date.localeCompare(b.holiday_date))
            return rows.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No bank holidays for {holidayYear}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs font-medium text-gray-500">
                    <th className="text-left pb-2">Date</th>
                    <th className="text-left pb-2">Name</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(h => (
                    <tr key={h.id} className="border-b border-gray-50 last:border-b-0">
                      <td className="py-2 text-gray-500 w-40">{new Date(h.holiday_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td className="py-2 text-gray-800">{h.name}</td>
                      <td className="py-2 text-right">
                        <button onClick={() => setEditingHoliday({ id: h.id, holiday_date: h.holiday_date, name: h.name })}
                          className="text-xs text-gray-400 hover:text-gray-700 mr-3">Edit</button>
                        <button onClick={() => deleteHoliday(h.id)}
                          className="text-xs text-red-400 hover:text-red-600">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          })()}
        </div>
      )}

      {/* ── Rota tags tab ── */}
      {activeTab === 'tags' && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-gray-700">Rota week tags</h2>
              <div className="flex items-center gap-1">
                <button onClick={() => setTagsYear(y => y - 1)} className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 text-xs">‹</button>
                <span className="text-xs font-medium text-gray-600 w-10 text-center">{tagsYear}</span>
                <button onClick={() => setTagsYear(y => y + 1)} className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 text-xs">›</button>
              </div>
            </div>
            <p className="text-xs text-gray-400">Changes auto-save</p>
          </div>

          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-4 space-y-0.5">
            <p>Monthly tags 1, 3, 5 must be on fortnightly-1 weeks · Monthly tags 2, 4, 6 must be on fortnightly-2 weeks · Tag 0 = not a monthly week</p>
          </div>

          {tagWarning && (
            <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4 text-xs text-amber-700">
              ⚠ {tagWarning}
              <button onClick={() => setTagWarning(null)} className="ml-2 underline">Dismiss</button>
            </div>
          )}

          {(() => {
            // Build a list of ALL Mondays in tagsYear
            const allWeeks: string[] = []
            const jan1 = new Date(tagsYear, 0, 1)
            // Find first Monday of or before Jan 1
            let cur = new Date(jan1)
            const dow = cur.getDay()
            cur.setDate(cur.getDate() - (dow === 0 ? 6 : dow - 1))
            const dec31 = new Date(tagsYear, 11, 31)
            while (cur <= dec31) {
              if (cur.getFullYear() >= tagsYear || cur >= jan1) {
                const ws = toStr(cur)
                // include if any day of the week falls in this year
                const fri = new Date(cur); fri.setDate(fri.getDate() + 4)
                if (cur.getFullYear() === tagsYear || fri.getFullYear() === tagsYear) {
                  allWeeks.push(ws)
                }
              }
              cur = addDays(cur, 7)
            }

            if (allWeeks.length === 0) {
              return <p className="text-sm text-gray-400 text-center py-4">No weeks for {tagsYear}</p>
            }

            return (
              <div className="overflow-auto max-h-[600px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-gray-100 text-xs font-medium text-gray-500">
                      <th className="text-left pb-2 pr-4">Week commencing</th>
                      <th className="text-left pb-2 pr-4">Term</th>
                      <th className="text-left pb-2 pr-4">Weekly</th>
                      <th className="text-left pb-2 pr-4">Fortnightly</th>
                      <th className="text-left pb-2">Monthly</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allWeeks.map((ws, i) => {
                      const rota = rotaCalendar.find(r => r.week_start === ws)
                      const termName = getTermName(ws)
                      // check if any weekday (Mon–Fri) is in term
                      const isTermWeek = Array.from({ length: 5 }, (_, d) => {
                        const dd = new Date(ws + 'T12:00:00'); dd.setDate(dd.getDate() + d); return toStr(dd)
                      }).some(ds => termDates.some(t => ds >= t.start_date && ds <= t.end_date))

                      const isSaving = rota ? savingTagId === rota.id : false
                      const bg = !isTermWeek ? '#f8fafc' : (i % 2 === 0 ? '#ffffff' : '#f0fdf8')

                      return (
                        <tr key={ws} style={{ background: bg }} className={!isTermWeek ? 'opacity-60' : ''}>
                          <td className="py-1.5 pr-4 text-gray-700">
                            {new Date(ws + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="py-1.5 pr-4">
                            {isTermWeek ? (
                              <span className="text-xs text-green-700 font-medium">{termName ?? 'Term'}</span>
                            ) : (
                              <span className="text-xs text-gray-400">Holiday</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-4">
                            {isTermWeek ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-700">
                                <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ background: '#46DA26' }}>
                                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                </span>
                                Always
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-4">
                            {rota && isTermWeek ? (
                              <select
                                value={rota.tag_fortnightly ?? ''}
                                disabled={isSaving}
                                onChange={e => saveRotaTag(rota.id, 'tag_fortnightly', e.target.value ? parseInt(e.target.value) : null)}
                                className="px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50 bg-white"
                              >
                                <option value="">—</option>
                                <option value="1">1</option>
                                <option value="2">2</option>
                              </select>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="py-1.5">
                            {rota && isTermWeek ? (
                              <>
                                <select
                                  value={rota.tag_monthly ?? 0}
                                  disabled={isSaving}
                                  onChange={e => saveRotaTag(rota.id, 'tag_monthly', parseInt(e.target.value))}
                                  className="px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50 bg-white"
                                >
                                  <option value="0">0 (none)</option>
                                  {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                                {isSaving && <span className="ml-2 text-xs text-gray-400">Saving…</span>}
                              </>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })()}
        </div>
      )}

      {/* ── Modals ── */}

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
                style={{ background: '#46DA26' }}>
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
                style={{ background: '#46DA26' }}>
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

      {editingHoliday && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setEditingHoliday(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-100 p-5 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">{editingHoliday.id ? 'Edit bank holiday' : 'Add bank holiday'}</h3>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                <input type="date" value={editingHoliday.holiday_date}
                  onChange={e => setEditingHoliday(h => h && ({ ...h, holiday_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                <input type="text" value={editingHoliday.name}
                  onChange={e => setEditingHoliday(h => h && ({ ...h, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && saveHoliday()}
                  placeholder="e.g. Christmas Day, INSET day"
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveHoliday} disabled={savingHoliday || !editingHoliday.name.trim() || !editingHoliday.holiday_date}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                style={{ background: '#46DA26' }}>
                {savingHoliday ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditingHoliday(null)}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {editingTerm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setEditingTerm(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-100 p-5 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">{editingTerm.id ? 'Edit term' : 'Add term'}</h3>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Term name</label>
                <input type="text" value={editingTerm.term_name}
                  onChange={e => setEditingTerm(t => t && ({ ...t, term_name: e.target.value }))}
                  placeholder="e.g. 2026 Autumn 1"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Start date</label>
                  <input type="date" value={editingTerm.start_date}
                    onChange={e => setEditingTerm(t => t && ({ ...t, start_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">End date</label>
                  <input type="date" value={editingTerm.end_date} min={editingTerm.start_date}
                    onChange={e => setEditingTerm(t => t && ({ ...t, end_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveTerm} disabled={savingTerm || !editingTerm.term_name.trim() || !editingTerm.start_date || !editingTerm.end_date}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                style={{ background: '#46DA26' }}>
                {savingTerm ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditingTerm(null)}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={generateRota} disabled={generating || !setupStartDate || !setupEndDate}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                style={{ background: '#46DA26' }}>
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
