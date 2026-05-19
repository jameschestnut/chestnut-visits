'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

const ABSENCE_TYPES: Record<string, { label: string; colour: string }> = {
  annual_leave:  { label: 'Annual leave', colour: 'bg-blue-50 text-blue-700' },
  sickness:      { label: 'Sickness',     colour: 'bg-red-50 text-red-700'   },
  other_absence: { label: 'Other',        colour: 'bg-gray-100 text-gray-600' },
}

function getAcademicYears(): { label: string; start: string; end: string }[] {
  const today = new Date()
  const currentYear = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1
  return Array.from({ length: 3 }, (_, i) => {
    const y = currentYear - i
    return {
      label: `${y}/${String(y + 1).slice(2)}`,
      start: `${y}-09-01`,
      end:   `${y + 1}-08-31`,
    }
  })
}

export default function AbsenceLog({ techId }: { techId: string }) {
  const supabase     = createClient()
  const years        = getAcademicYears()
  const [yearIdx, setYearIdx] = useState(0)
  const [absences, setAbsences] = useState<{
    id: string; visit_date: string; slot: string; visit_type: string; notes: string | null
  }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('visits')
        .select('id, visit_date, slot, visit_type, notes')
        .eq('technician_id', techId)
        .in('visit_type', ['annual_leave', 'sickness', 'other_absence'])
        .gte('visit_date', years[yearIdx].start)
        .lte('visit_date', years[yearIdx].end)
        .order('visit_date', { ascending: false })

      setAbsences(data ?? [])
      setLoading(false)
    }
    load()
  }, [techId, yearIdx])

  // Group consecutive same-type slots into day entries
  const grouped: { date: string; type: string; slots: string[]; notes: string | null }[] = []
  for (const a of absences) {
    const last = grouped[grouped.length - 1]
    if (last && last.date === a.visit_date && last.type === a.visit_type) {
      last.slots.push(a.slot)
      if (a.notes && !last.notes) last.notes = a.notes
    } else {
      grouped.push({ date: a.visit_date, type: a.visit_type, slots: [a.slot], notes: a.notes })
    }
  }

  const totalDays = grouped.reduce((sum, g) => sum + (g.slots.length === 2 ? 1 : 0.5), 0)

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Absence log</h2>
          {!loading && absences.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">{totalDays} day{totalDays !== 1 ? 's' : ''} in {years[yearIdx].label}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {years.map((y, i) => (
            <button key={y.label} onClick={() => setYearIdx(i)}
              className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                yearIdx === i ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}>
              {y.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400 py-4 text-center">Loading...</p>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No absences in {years[yearIdx].label}</p>
      ) : (
        <div className="space-y-2">
          {grouped.map((g, i) => {
            const cfg      = ABSENCE_TYPES[g.type] ?? { label: g.type, colour: 'bg-gray-100 text-gray-600' }
            const isFullDay = g.slots.length === 2
            const slotLabel = isFullDay ? 'Full day' : g.slots[0].toUpperCase()
            return (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 text-sm">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${cfg.colour}`}>
                  {cfg.label}
                </span>
                <span className="text-gray-600">
                  {new Date(g.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-500 text-xs">{slotLabel}</span>
                {g.notes && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-400 text-xs truncate">{g.notes}</span>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}