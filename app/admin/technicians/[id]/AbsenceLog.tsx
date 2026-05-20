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

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function isWeekend(date: Date): boolean {
  return date.getDay() === 0 || date.getDay() === 6
}

interface AbsenceVisit {
  id: string
  visit_date: string
  slot: string
  visit_type: string
  notes: string | null
}

interface GroupedAbsence {
  date: string
  type: string
  slots: string[]
  notes: string | null
  ids: string[]
}

interface ClashingVisit {
  id: string
  visit_date: string
  slot: string
  school_name: string
}

export default function AbsenceLog({ techId }: { techId: string }) {
  const supabase = createClient()
  const years    = getAcademicYears()

  const [yearIdx, setYearIdx]             = useState(0)
  const [absences, setAbsences]           = useState<AbsenceVisit[]>([])
  const [loading, setLoading]             = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null)
  const [deleting, setDeleting]           = useState(false)

  // Add absence modal
  const [showAdd, setShowAdd]         = useState(false)
  const [addType, setAddType]         = useState('annual_leave')
  const [addSlot, setAddSlot]         = useState<'am' | 'pm' | 'full_day'>('full_day')
  const [addStart, setAddStart]       = useState('')
  const [addEnd, setAddEnd]           = useState('')
  const [addNotes, setAddNotes]       = useState('')
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState<string | null>(null)

  // Clash warning
  const [clashes, setClashes]         = useState<ClashingVisit[]>([])
  const [pendingRows, setPendingRows] = useState<{ technician_id: string; visit_date: string; slot: string; visit_type: string; status: string; notes: string | null }[]>([])
  const [showClash, setShowClash]     = useState(false)
  const [confirming, setConfirming]   = useState(false)

  useEffect(() => { load() }, [techId, yearIdx])

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

  // Group consecutive same-type slots into day entries
  const grouped: GroupedAbsence[] = []
  for (const a of absences) {
    const last = grouped[grouped.length - 1]
    if (last && last.date === a.visit_date && last.type === a.visit_type) {
      last.slots.push(a.slot)
      last.ids.push(a.id)
      if (a.notes && !last.notes) last.notes = a.notes
    } else {
      grouped.push({ date: a.visit_date, type: a.visit_type, slots: [a.slot], notes: a.notes, ids: [a.id] })
    }
  }

  const totalDays = grouped.reduce((sum, g) => sum + (g.slots.length === 2 ? 1 : 0.5), 0)

  // Build rows for a date range
  function buildRows() {
    const start  = new Date(addStart + 'T12:00:00')
    const end    = new Date(addEnd   + 'T12:00:00')
    const slots: ('am' | 'pm')[] = addSlot === 'full_day' ? ['am', 'pm'] : [addSlot]
    const rows: { technician_id: string; visit_date: string; slot: string; visit_type: string; status: string; notes: string | null }[] = []
    let current = new Date(start)
    while (current <= end) {
      if (!isWeekend(current)) {
        for (const slot of slots) {
          rows.push({ technician_id: techId, visit_date: toDateStr(current), slot, visit_type: addType, status: 'confirmed', notes: addNotes.trim() || null })
        }
      }
      current = addDays(current, 1)
    }
    return rows
  }

  async function handleAdd() {
    if (!addStart || !addEnd || !addType) return
    setSaving(true)
    setSaveError(null)

    const rows = buildRows()
    if (rows.length === 0) {
      setSaveError('No working days in the selected range.')
      setSaving(false)
      return
    }

    // Check for clashing visits in those slots
    const dates = [...new Set(rows.map(r => r.visit_date))]
    const slots = [...new Set(rows.map(r => r.slot))]

    const { data: existing } = await supabase
      .from('visits')
      .select('id, visit_date, slot, visit_type, schools (name, short_name)')
      .eq('technician_id', techId)
      .in('visit_date', dates)
      .in('slot', slots)
      .not('visit_type', 'in', '("annual_leave","sickness","other_absence")')
      .not('status', 'in', '("banked","completed")')

    if (existing && existing.length > 0) {
      // Show clash warning
      const clashList: ClashingVisit[] = existing.map((v: {
        id: string; visit_date: string; slot: string
        schools: { name: string; short_name: string | null } | null
      }) => ({
        id:          v.id,
        visit_date:  v.visit_date,
        slot:        v.slot,
        school_name: v.schools?.short_name || v.schools?.name || 'Unknown',
      }))
      setClashes(clashList)
      setPendingRows(rows)
      setSaving(false)
      setShowClash(true)
      return
    }

    // No clashes — save directly
    const { error } = await supabase.from('visits').insert(rows)
    if (error) { setSaveError(error.message); setSaving(false); return }
    setSaving(false)
    closeAdd()
    load()
  }

  async function handleConfirmWithClash() {
    setConfirming(true)

    // Bank all clashing visits
    for (const clash of clashes) {
      await supabase.from('visits').update({ status: 'banked', banked_at: new Date().toISOString() }).eq('id', clash.id)
    }

    // Insert absence rows
    const { error } = await supabase.from('visits').insert(pendingRows)
    if (error) { setSaveError(error.message); setConfirming(false); return }

    setConfirming(false)
    setShowClash(false)
    closeAdd()
    load()
  }

  function closeAdd() {
    setShowAdd(false)
    setAddStart(''); setAddEnd(''); setAddNotes('')
    setAddType('annual_leave'); setAddSlot('full_day')
    setSaveError(null)
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    await supabase.from('visits').delete().in('id', confirmDelete)
    setAbsences(prev => prev.filter(a => !confirmDelete.includes(a.id)))
    setDeleting(false)
    setConfirmDelete(null)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Absence log</h2>
          {!loading && absences.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">{totalDays} day{totalDays !== 1 ? 's' : ''} in {years[yearIdx].label}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {years.map((y, i) => (
              <button key={y.label} onClick={() => setYearIdx(i)}
                className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${yearIdx === i ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                {y.label}
              </button>
            ))}
          </div>
          <button onClick={() => { setShowAdd(true); setSaveError(null) }}
            className="text-xs font-medium px-3 py-1.5 rounded-lg text-white"
            style={{ background: '#46DA26' }}>
            + Add
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400 py-4 text-center">Loading...</p>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No absences in {years[yearIdx].label}</p>
      ) : (
        <div className="space-y-2">
          {grouped.map((g, i) => {
            const cfg       = ABSENCE_TYPES[g.type] ?? { label: g.type, colour: 'bg-gray-100 text-gray-600' }
            const isFullDay = g.slots.length === 2
            const slotLabel = isFullDay ? 'Full day' : g.slots[0].toUpperCase()
            return (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 text-sm group">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${cfg.colour}`}>{cfg.label}</span>
                <span className="text-gray-600">{new Date(g.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-500 text-xs">{slotLabel}</span>
                {g.notes && (<><span className="text-gray-300">·</span><span className="text-gray-400 text-xs truncate">{g.notes}</span></>)}
                <button onClick={() => setConfirmDelete(g.ids)}
                  className="ml-auto opacity-0 group-hover:opacity-40 hover:!opacity-100 text-gray-400 hover:text-red-500 text-xs shrink-0 transition-opacity"
                  title="Remove">✕</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Add absence modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={closeAdd}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-100 p-5 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Add absence</h3>

            <div className="mb-4">
              <p className="text-xs font-medium text-gray-700 mb-2">Type</p>
              <div className="space-y-1.5">
                {Object.entries(ABSENCE_TYPES).map(([value, { label }]) => (
                  <label key={value} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="addtype" value={value} checked={addType === value} onChange={() => setAddType(value)} className="accent-gray-800" />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <p className="text-xs font-medium text-gray-700 mb-2">Which part of the day?</p>
              <div className="flex gap-2">
                {[{ value: 'full_day', label: 'Full day' }, { value: 'am', label: 'AM only' }, { value: 'pm', label: 'PM only' }].map(opt => (
                  <label key={opt.value} className={`flex-1 flex items-center justify-center px-2 py-1.5 rounded-lg border cursor-pointer text-xs transition-colors ${addSlot === opt.value ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    <input type="radio" name="addslot" value={opt.value} checked={addSlot === opt.value} onChange={() => setAddSlot(opt.value as 'am' | 'pm' | 'full_day')} className="sr-only" />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <p className="text-xs font-medium text-gray-700 mb-1">From <span className="text-red-500">*</span></p>
                <input type="date" value={addStart}
                  onChange={e => { setAddStart(e.target.value); if (!addEnd || e.target.value > addEnd) setAddEnd(e.target.value) }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700 mb-1">To <span className="text-red-500">*</span></p>
                <input type="date" value={addEnd} min={addStart}
                  onChange={e => setAddEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>

            <div className="mb-4">
              <p className="text-xs font-medium text-gray-700 mb-1">Notes <span className="text-gray-400">(optional)</span></p>
              <input type="text" value={addNotes} onChange={e => setAddNotes(e.target.value)}
                placeholder="e.g. Hospital appointment"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>

            {saveError && <p className="text-xs text-red-600 mb-3">{saveError}</p>}

            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={saving || !addStart || !addEnd}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                style={{ background: '#46DA26' }}>
                {saving ? 'Checking…' : 'Save absence'}
              </button>
              <button onClick={closeAdd} className="flex-1 py-2 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Clash warning modal */}
      {showClash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-100 p-5 w-80">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Visits will be affected</h3>
            <p className="text-xs text-gray-500 mb-3">
              The following confirmed visits clash with this absence. They will be moved to the visit bank.
            </p>
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 mb-4 space-y-1.5 max-h-40 overflow-auto">
              {clashes.map((c, i) => (
                <div key={i} className="text-xs">
                  <span className="font-medium text-amber-900">{c.school_name}</span>
                  <span className="text-amber-600 ml-2">
                    {new Date(c.visit_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {c.slot.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={handleConfirmWithClash} disabled={confirming}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                style={{ background: '#46DA26' }}>
                {confirming ? 'Saving…' : 'Confirm & bank visits'}
              </button>
              <button onClick={() => setShowClash(false)}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setConfirmDelete(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-100 p-5 w-72" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Remove absence?</h3>
            <p className="text-xs text-gray-500 mb-4">
              This will permanently remove {confirmDelete.length === 2 ? 'the full day absence' : 'this absence slot'}. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">
                {deleting ? 'Removing…' : 'Remove'}
              </button>
              <button onClick={() => setConfirmDelete(null)}
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