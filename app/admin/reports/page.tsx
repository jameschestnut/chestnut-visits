'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}

function getDefaultRange() {
  const today = new Date()
  const month = today.getMonth()
  const year  = month >= 8 ? today.getFullYear() : today.getFullYear() - 1
  return { start: `${year}-09-01`, end: toDateStr(today) }
}

function csvDownload(filename: string, rows: string[][]) {
  const content = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob    = new Blob([content], { type: 'text/csv' })
  const url     = URL.createObjectURL(blob)
  const a       = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function addWorkingDays(date: Date, days: number): Date {
  const d = new Date(date); let added = 0
  while (added < days) { d.setDate(d.getDate()+1); if (d.getDay()!==0&&d.getDay()!==6) added++ }
  return d
}

function visitsPerCycle(frequency: string, customPerYear: number | null): number {
  // How many visits per 6-week rota cycle
  switch (frequency) {
    case 'weekly':       return 6
    case 'fortnightly':  return 3
    case 'three_weekly': return 2
    case 'monthly':      return 1.5
    case 'half_termly':  return 1
    case 'termly':       return 0.5
    case 'custom':       return customPerYear ? customPerYear / 6 : 0
    default:             return 0
  }
}

// ── Delivery Report ────────────────────────────────────────────────────────────

interface DeliveryRow {
  school_id: string
  school_name: string
  frequency: string
  expected: number
  scheduled: number
  completed: number
  banked: number
  pct: number
}

function DeliveryReport({ start, end }: { start: string; end: string }) {
  const supabase = createClient()
  const [rows, setRows] = useState<DeliveryRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [
        { data: contracts },
        { data: visits },
        { data: rotaWeeks },
        { data: termDates },
      ] = await Promise.all([
        supabase.from('contracts')
          .select('id, school_id, frequency, custom_visits_per_year, start_date, end_date, schools (id, name, short_name)')
          .eq('status', 'active'),
        supabase.from('visits')
          .select('school_id, status')
          .eq('visit_type', 'technology_partner')
          .gte('visit_date', start)
          .lte('visit_date', end),
        supabase.from('rota_calendar')
          .select('week_start')
          .gte('week_start', start)
          .lte('week_start', end),
        supabase.from('term_dates')
          .select('start_date, end_date')
          .order('start_date'),
      ])

      const result: DeliveryRow[] = (contracts ?? []).map((c: {
        id: string; school_id: string; frequency: string; custom_visits_per_year: number | null
        start_date: string; end_date: string
        schools: { id: string; name: string; short_name: string | null } | null
      }) => {
        const schoolVisits = (visits ?? []).filter((v: { school_id: string }) => v.school_id === c.school_id)
        const completed    = schoolVisits.filter((v: { status: string }) => v.status === 'completed').length
        const banked       = schoolVisits.filter((v: { status: string }) => v.status === 'banked').length
        const scheduled    = schoolVisits.length

        // Overlap between contract period and selected date range
        const contractStart = c.start_date > start ? c.start_date : start
        const contractEnd   = c.end_date   < end   ? c.end_date   : end

        // Count rota weeks in overlap for cycle-based frequencies
        const overlapWeeks  = (rotaWeeks ?? []).filter((r: { week_start: string }) =>
          r.week_start >= contractStart && r.week_start <= contractEnd
        ).length
        const overlapCycles = overlapWeeks / 6

        // Count half-terms in overlap for term-based frequencies
        const overlapTerms  = (termDates ?? []).filter((t: { start_date: string; end_date: string }) =>
          t.start_date >= contractStart && t.end_date <= contractEnd
        ).length

        let expected: number
        if (c.frequency === 'half_termly') {
          expected = overlapTerms
        } else if (c.frequency === 'termly') {
          expected = Math.round(overlapTerms / 2)
        } else {
          expected = Math.round(visitsPerCycle(c.frequency, c.custom_visits_per_year) * overlapCycles)
        }

        const pct = expected > 0 ? Math.round((completed / expected) * 100) : 0

        return {
          school_id:   c.school_id,
          school_name: c.schools?.name ?? 'Unknown',
          frequency:   c.frequency.replace('_', ' '),
          expected,
          scheduled,
          completed,
          banked,
          pct,
        }
      }).sort((a, b) => a.school_name.localeCompare(b.school_name))

      setRows(result)
      setLoading(false)
    }
    load()
  }, [start, end])

  function exportCsv() {
    csvDownload('delivery-report.csv', [
      ['School', 'Frequency', 'Expected', 'Scheduled', 'Completed', 'Banked', '% Complete'],
      ...rows.map(r => [r.school_name, r.frequency, r.expected, r.scheduled, r.completed, r.banked, `${r.pct}%`].map(String))
    ])
  }

  if (loading) return <p className="text-sm text-gray-400 py-8 text-center">Loading...</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">{rows.length} active contracts</p>
        <button onClick={exportCsv} className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">↓ Export CSV</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500">
              <th className="text-left px-4 py-3">School</th>
              <th className="text-left px-4 py-3">Frequency</th>
              <th className="text-right px-4 py-3">Expected</th>
              <th className="text-right px-4 py-3">Scheduled</th>
              <th className="text-right px-4 py-3">Completed</th>
              <th className="text-right px-4 py-3">Banked</th>
              <th className="px-4 py-3 w-32">Progress</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.school_id} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/schools/${r.school_id}`} className="font-medium text-gray-900 hover:text-gray-600">{r.school_name}</Link>
                </td>
                <td className="px-4 py-2.5 text-gray-500 capitalize">{r.frequency}</td>
                <td className="px-4 py-2.5 text-right text-gray-700">{r.expected}</td>
                <td className="px-4 py-2.5 text-right text-gray-500">{r.scheduled}</td>
                <td className="px-4 py-2.5 text-right text-green-700 font-medium">{r.completed}</td>
                <td className="px-4 py-2.5 text-right text-purple-700">{r.banked}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: `${r.pct}%`, background: r.pct >= 80 ? '#46DA26' : r.pct >= 50 ? '#f59e0b' : '#ef4444' }} />
                    </div>
                    <span className="text-xs text-gray-500 w-8 text-right">{r.pct}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Utilisation Report ─────────────────────────────────────────────────────────

interface UtilRow {
  tech_id: string
  tech_name: string
  total_slots: number
  filled_slots: number
  absence_slots: number
  pct: number
}

function UtilisationReport({ start, end }: { start: string; end: string }) {
  const supabase = createClient()
  const [rows, setRows] = useState<UtilRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)

      // Count working days in range
      let workingDays = 0
      let d = new Date(start + 'T12:00:00')
      const endDate = new Date(end + 'T12:00:00')
      while (d <= endDate) { if (d.getDay()!==0&&d.getDay()!==6) workingDays++; d.setDate(d.getDate()+1) }
      const totalSlots = workingDays * 2 // AM + PM

      const [{ data: techs }, { data: visits }] = await Promise.all([
        supabase.from('technicians').select('id, full_name').eq('is_active', true).order('full_name'),
        supabase.from('visits').select('technician_id, visit_type, status')
          .gte('visit_date', start).lte('visit_date', end)
          .not('status', 'in', '("banked")'),
      ])

      const ABSENCE_TYPES = new Set(['annual_leave', 'sickness', 'other_absence'])

      const result: UtilRow[] = (techs ?? []).map((t: { id: string; full_name: string }) => {
        const techVisits    = (visits ?? []).filter((v: { technician_id: string }) => v.technician_id === t.id)
        const absenceSlots  = techVisits.filter((v: { visit_type: string }) => ABSENCE_TYPES.has(v.visit_type)).length
        const workSlots     = techVisits.filter((v: { visit_type: string }) => !ABSENCE_TYPES.has(v.visit_type)).length
        const availableSlots = totalSlots - absenceSlots
        const pct           = availableSlots > 0 ? Math.round((workSlots / availableSlots) * 100) : 0
        return { tech_id: t.id, tech_name: t.full_name, total_slots: totalSlots, filled_slots: workSlots, absence_slots: absenceSlots, pct }
      })

      setRows(result)
      setLoading(false)
    }
    load()
  }, [start, end])

  function exportCsv() {
    csvDownload('utilisation-report.csv', [
      ['Technician', 'Total Slots', 'Absence Slots', 'Available Slots', 'Filled Slots', '% Utilisation'],
      ...rows.map(r => [r.tech_name, r.total_slots, r.absence_slots, r.total_slots - r.absence_slots, r.filled_slots, `${r.pct}%`].map(String))
    ])
  }

  if (loading) return <p className="text-sm text-gray-400 py-8 text-center">Loading...</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">{rows.length} active technicians</p>
        <button onClick={exportCsv} className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">↓ Export CSV</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500">
              <th className="text-left px-4 py-3">Technician</th>
              <th className="text-right px-4 py-3">Total slots</th>
              <th className="text-right px-4 py-3">Absence</th>
              <th className="text-right px-4 py-3">Available</th>
              <th className="text-right px-4 py-3">Filled</th>
              <th className="px-4 py-3 w-32">Utilisation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.tech_id} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/technicians/${r.tech_id}`} className="font-medium text-gray-900 hover:text-gray-600">{r.tech_name}</Link>
                </td>
                <td className="px-4 py-2.5 text-right text-gray-500">{r.total_slots}</td>
                <td className="px-4 py-2.5 text-right text-amber-600">{r.absence_slots}</td>
                <td className="px-4 py-2.5 text-right text-gray-700">{r.total_slots - r.absence_slots}</td>
                <td className="px-4 py-2.5 text-right font-medium text-gray-900">{r.filled_slots}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: `${Math.min(r.pct,100)}%`, background: r.pct >= 80 ? '#46DA26' : r.pct >= 50 ? '#f59e0b' : '#ef4444' }} />
                    </div>
                    <span className="text-xs text-gray-500 w-8 text-right">{r.pct}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Absence Summary ────────────────────────────────────────────────────────────

interface AbsenceRow {
  tech_id: string
  tech_name: string
  annual_leave: number
  sickness: number
  other: number
  total: number
}

function AbsenceReport({ start, end }: { start: string; end: string }) {
  const supabase = createClient()
  const [rows, setRows] = useState<AbsenceRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: techs }, { data: visits }] = await Promise.all([
        supabase.from('technicians').select('id, full_name').eq('is_active', true).order('full_name'),
        supabase.from('visits').select('technician_id, visit_type')
          .in('visit_type', ['annual_leave', 'sickness', 'other_absence'])
          .gte('visit_date', start).lte('visit_date', end),
      ])

      const result: AbsenceRow[] = (techs ?? []).map((t: { id: string; full_name: string }) => {
        const tv = (visits ?? []).filter((v: { technician_id: string }) => v.technician_id === t.id)
        const al = tv.filter((v: { visit_type: string }) => v.visit_type === 'annual_leave').length / 2
        const si = tv.filter((v: { visit_type: string }) => v.visit_type === 'sickness').length / 2
        const ot = tv.filter((v: { visit_type: string }) => v.visit_type === 'other_absence').length / 2
        return { tech_id: t.id, tech_name: t.full_name, annual_leave: al, sickness: si, other: ot, total: al + si + ot }
      }).filter(r => r.total > 0)

      setRows(result.sort((a, b) => b.total - a.total))
      setLoading(false)
    }
    load()
  }, [start, end])

  function exportCsv() {
    csvDownload('absence-report.csv', [
      ['Technician', 'Annual Leave (days)', 'Sickness (days)', 'Other (days)', 'Total (days)'],
      ...rows.map(r => [r.tech_name, r.annual_leave, r.sickness, r.other, r.total].map(String))
    ])
  }

  if (loading) return <p className="text-sm text-gray-400 py-8 text-center">Loading...</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">{rows.length} technician{rows.length !== 1 ? 's' : ''} with absences</p>
        <button onClick={exportCsv} className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">↓ Export CSV</button>
      </div>
      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-400">No absences in this period</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500">
                <th className="text-left px-4 py-3">Technician</th>
                <th className="text-right px-4 py-3">Annual leave</th>
                <th className="text-right px-4 py-3">Sickness</th>
                <th className="text-right px-4 py-3">Other</th>
                <th className="text-right px-4 py-3">Total days</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.tech_id} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/technicians/${r.tech_id}`} className="font-medium text-gray-900 hover:text-gray-600">{r.tech_name}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-right text-blue-700">{r.annual_leave > 0 ? `${r.annual_leave}d` : '—'}</td>
                  <td className="px-4 py-2.5 text-right text-red-700">{r.sickness > 0 ? `${r.sickness}d` : '—'}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{r.other > 0 ? `${r.other}d` : '—'}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{r.total}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Visit Bank Report ──────────────────────────────────────────────────────────

interface BankRow {
  id: string
  school_name: string
  school_id: string
  tech_name: string
  original_date: string
  banked_at: string
  days_banked: number
  overdue: boolean
}

function BankReport() {
  const supabase = createClient()
  const [rows, setRows] = useState<BankRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('visits')
        .select('id, visit_date, banked_at, schools (id, name, short_name), technicians (id, full_name)')
        .eq('status', 'banked')
        .order('banked_at')

      const today = new Date()
      const result: BankRow[] = (data ?? []).map((v: {
        id: string; visit_date: string; banked_at: string | null
        schools: { id: string; name: string; short_name: string | null } | null
        technicians: { id: string; full_name: string } | null
      }) => {
        const bankedAt  = v.banked_at ? new Date(v.banked_at) : new Date(v.visit_date + 'T12:00:00')
        const daysOld   = Math.floor((today.getTime() - bankedAt.getTime()) / (1000*60*60*24))
        const overdue   = today >= addWorkingDays(bankedAt, 5)
        return {
          id:            v.id,
          school_name:   v.schools?.short_name || v.schools?.name || 'Unknown',
          school_id:     v.schools?.id ?? '',
          tech_name:     v.technicians?.full_name ?? '—',
          original_date: v.visit_date,
          banked_at:     v.banked_at ?? v.visit_date,
          days_banked:   daysOld,
          overdue,
        }
      })

      setRows(result)
      setLoading(false)
    }
    load()
  }, [])

  function exportCsv() {
    csvDownload('visit-bank-report.csv', [
      ['School', 'Technician', 'Original Date', 'Banked Date', 'Days in Bank', 'Overdue'],
      ...rows.map(r => [r.school_name, r.tech_name, r.original_date, r.banked_at, r.days_banked, r.overdue ? 'Yes' : 'No'].map(String))
    ])
  }

  if (loading) return <p className="text-sm text-gray-400 py-8 text-center">Loading...</p>

  const overdueCount = rows.filter(r => r.overdue).length

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-500">{rows.length} banked visit{rows.length !== 1 ? 's' : ''}</p>
          {overdueCount > 0 && (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
              {overdueCount} overdue (&gt;5 working days)
            </span>
          )}
        </div>
        <button onClick={exportCsv} className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">↓ Export CSV</button>
      </div>
      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-400">No visits in the bank</p>
          <p className="text-xs text-gray-300 mt-1" style={{ color: '#46DA26' }}>All clear ✓</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500">
                <th className="text-left px-4 py-3">School</th>
                <th className="text-left px-4 py-3">Technician</th>
                <th className="text-left px-4 py-3">Original date</th>
                <th className="text-left px-4 py-3">Banked</th>
                <th className="text-right px-4 py-3">Days in bank</th>
                <th className="text-left px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className={`border-b border-gray-50 last:border-b-0 ${r.overdue ? 'bg-amber-50/40' : 'hover:bg-gray-50'}`}>
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/schools/${r.school_id}`} className="font-medium text-gray-900 hover:text-gray-600">{r.school_name}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{r.tech_name}</td>
                  <td className="px-4 py-2.5 text-gray-500">{new Date(r.original_date+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</td>
                  <td className="px-4 py-2.5 text-gray-500">{new Date(r.banked_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-900">{r.days_banked}</td>
                  <td className="px-4 py-2.5">
                    {r.overdue && <span className="text-xs text-amber-600 font-medium">⚠ Overdue</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── School Visit History ───────────────────────────────────────────────────────

const VISIT_TYPE_LABELS: Record<string, string> = {
  technology_partner: 'TP Visit',
  handover:           'Handover',
  shadow:             'Shadow',
  installation:       'Installation',
  phone_duty:         'Phone duty',
  annual_leave:       'Annual leave',
  sickness:           'Sickness',
  other_absence:      'Other absence',
}

const STATUS_STYLES: Record<string, string> = {
  confirmed:  'bg-blue-50 text-blue-700',
  completed:  'bg-green-50 text-green-700',
  banked:     'bg-purple-50 text-purple-700',
  disrupted:  'bg-red-50 text-red-700',
}

interface VisitHistoryRow {
  id: string
  visit_date: string
  slot: string
  visit_type: string
  status: string
  notes: string | null
  tech_name: string
}

function SchoolVisitHistory({ start, end }: { start: string; end: string }) {
  const supabase = createClient()
  const [schools, setSchools]     = useState<{ id: string; name: string }[]>([])
  const [schoolId, setSchoolId]   = useState('')
  const [schoolSearch, setSchoolSearch] = useState('')
  const [rows, setRows]           = useState<VisitHistoryRow[]>([])
  const [loading, setLoading]     = useState(false)
  const [searched, setSearched]   = useState(false)

  useEffect(() => {
    supabase.from('schools').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setSchools(data ?? []))
  }, [])

  async function load(sid: string) {
    if (!sid) return
    setLoading(true)
    setSearched(true)
    const { data } = await supabase
      .from('visits')
      .select('id, visit_date, slot, visit_type, status, notes, technicians (full_name)')
      .eq('school_id', sid)
      .gte('visit_date', start)
      .lte('visit_date', end)
      .order('visit_date', { ascending: false })

    setRows((data ?? []).map((v: {
      id: string; visit_date: string; slot: string; visit_type: string; status: string; notes: string | null
      technicians: { full_name: string } | null
    }) => ({
      id:         v.id,
      visit_date: v.visit_date,
      slot:       v.slot,
      visit_type: v.visit_type,
      status:     v.status,
      notes:      v.notes,
      tech_name:  v.technicians?.full_name ?? '—',
    })))
    setLoading(false)
  }

  function exportCsv() {
    const school = schools.find(s => s.id === schoolId)
    csvDownload(`${school?.name ?? 'school'}-visits.csv`, [
      ['Date', 'Slot', 'Type', 'Technician', 'Status', 'Notes'],
      ...rows.map(r => [
        new Date(r.visit_date + 'T12:00:00').toLocaleDateString('en-GB'),
        r.slot.toUpperCase(),
        VISIT_TYPE_LABELS[r.visit_type] ?? r.visit_type,
        r.tech_name,
        r.status,
        r.notes ?? '',
      ])
    ])
  }

  const filteredSchools = schools.filter(s =>
    !schoolSearch || s.name.toLowerCase().includes(schoolSearch.toLowerCase())
  )

  return (
    <div>
      {/* School picker */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
        <p className="text-xs font-medium text-gray-700 mb-2">Select school</p>
        <div className="flex gap-3">
          <div className="flex-1 max-w-xs">
            <input type="text" value={schoolSearch}
              onChange={e => setSchoolSearch(e.target.value)}
              placeholder="Search schools..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 mb-1" />
            {schoolSearch && (
              <div className="border border-gray-100 rounded-lg overflow-hidden max-h-40 overflow-auto">
                {filteredSchools.slice(0, 6).map(s => (
                  <button key={s.id}
                    onClick={() => { setSchoolId(s.id); setSchoolSearch(s.name); load(s.id) }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${schoolId === s.id ? 'bg-gray-100 font-medium' : ''}`}>
                    {s.name}
                  </button>
                ))}
                {filteredSchools.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">No schools found</p>}
              </div>
            )}
          </div>
          {schoolId && (
            <button onClick={() => load(schoolId)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white h-fit"
              style={{ background: '#46DA26' }}>
              Load visits
            </button>
          )}
        </div>
      </div>

      {loading && <p className="text-sm text-gray-400 py-8 text-center">Loading...</p>}

      {!loading && searched && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500">{rows.length} visit{rows.length !== 1 ? 's' : ''} in period</p>
            {rows.length > 0 && (
              <button onClick={exportCsv} className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">↓ Export CSV</button>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
              <p className="text-sm text-gray-400">No visits found for this school in the selected period</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500">
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Slot</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-left px-4 py-3">Technician</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {new Date(r.visit_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.slot === 'am' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}`}>
                          {r.slot.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700">{VISIT_TYPE_LABELS[r.visit_type] ?? r.visit_type}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r.tech_name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLES[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{r.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

type Tab = 'delivery' | 'utilisation' | 'absence' | 'bank' | 'school'

export default function ReportsPage() {
  const [tab, setTab]     = useState<Tab>('delivery')
  const defaults          = getDefaultRange()
  const [start, setStart] = useState(defaults.start)
  const [end, setEnd]     = useState(defaults.end)
  const [terms, setTerms] = useState<{ term_name: string; start_date: string; end_date: string }[]>([])

  useEffect(() => {
    createClient().from('term_dates').select('term_name, start_date, end_date').order('start_date')
      .then(({ data }) => setTerms(data ?? []))
  }, [])

  function applyPreset(preset: string) {
    const today = new Date()
    const todayStr = toDateStr(today)

    if (preset === 'academy_year') {
      const y = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1
      setStart(`${y}-09-01`); setEnd(`${y+1}-07-31`); return
    }
    if (preset === 'la_year') {
      const y = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
      setStart(`${y}-04-01`); setEnd(`${y+1}-03-31`); return
    }
    if (preset === 'calendar_year') {
      setStart(`${today.getFullYear()}-01-01`); setEnd(`${today.getFullYear()}-12-31`); return
    }

    // Half-term presets — need term_dates
    if (terms.length === 0) return

    // Find which term today falls in, or the nearest upcoming one
    const currentTerm = terms.find(t => todayStr >= t.start_date && todayStr <= t.end_date)
    const currentIdx  = currentTerm ? terms.indexOf(currentTerm) : terms.findIndex(t => t.start_date > todayStr)

    if (preset === 'current_halfterm') {
      const t = currentTerm ?? terms[currentIdx]
      if (t) { setStart(t.start_date); setEnd(t.end_date) }
    }
    if (preset === 'last_halfterm') {
      const idx = currentTerm ? terms.indexOf(currentTerm) - 1 : currentIdx - 1
      const t   = terms[idx]
      if (t) { setStart(t.start_date); setEnd(t.end_date) }
    }
    if (preset === 'next_halfterm') {
      const idx = currentTerm ? terms.indexOf(currentTerm) + 1 : currentIdx
      const t   = terms[idx]
      if (t) { setStart(t.start_date); setEnd(t.end_date) }
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'delivery',     label: 'Visits delivered' },
    { key: 'utilisation',  label: 'Technician utilisation' },
    { key: 'absence',      label: 'Absence summary' },
    { key: 'bank',         label: 'Visit bank' },
    { key: 'school',       label: 'School visit history' },
  ]

  const hideDateRange = tab === 'bank'

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Analyse visits, utilisation and absences</p>
        </div>

        {/* Date range */}
        {!hideDateRange && (
          <div className="flex items-center gap-2">
            <div>
              <p className="text-xs text-gray-500 mb-1">From</p>
              <input type="date" value={start} onChange={e => setStart(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div className="pt-4 text-gray-400">—</div>
            <div>
              <p className="text-xs text-gray-500 mb-1">To</p>
              <input type="date" value={end} min={start} onChange={e => setEnd(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
          </div>
        )}
      </div>

      {/* Presets */}
      {!hideDateRange && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          <span className="text-xs text-gray-400 mr-1">Quick:</span>
          {[
            { key: 'current_halfterm', label: 'This half term' },
            { key: 'last_halfterm',    label: 'Last half term' },
            { key: 'next_halfterm',    label: 'Next half term' },
            { key: 'academy_year',     label: 'Academy year' },
            { key: 'la_year',          label: 'LA year' },
          ].map(p => (
            <button key={p.key} onClick={() => applyPreset(p.key)}
              className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors">
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Report content */}
      {tab === 'delivery'    && <DeliveryReport    start={start} end={end} />}
      {tab === 'utilisation' && <UtilisationReport start={start} end={end} />}
      {tab === 'absence'     && <AbsenceReport     start={start} end={end} />}
      {tab === 'bank'        && <BankReport />}
      {tab === 'school'      && <SchoolVisitHistory start={start} end={end} />}
    </div>
  )
}