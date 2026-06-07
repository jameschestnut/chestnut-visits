'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

const FREQUENCY_OPTIONS = [
  { value: 'weekly',                label: 'Weekly',        description: '38 visits/year' },
  { value: 'one_point_five_weekly', label: '1.5x Weekly',   description: '57 visits/year' },
  { value: 'twice_weekly',          label: '2x Weekly',     description: '76 visits/year' },
  { value: 'three_times_weekly',    label: '3x Weekly',     description: '114 visits/year' },
  { value: 'fortnightly',           label: 'Fortnightly',   description: '19 visits/year' },
  { value: 'monthly',               label: 'Monthly',       description: '12 visits/year' },
  { value: 'half_termly',           label: 'Half-termly',   description: '6 visits/year' },
  { value: 'termly',                label: 'Termly',        description: '3 visits/year' },
  { value: 'custom',                label: 'Custom',        description: 'Set manually' },
]

const DURATION_OPTIONS = [
  { value: 'half_day', label: 'Half day', description: '3.5hr visit' },
  { value: 'full_day', label: 'Full day', description: '7hr visit' },
]

function getDatePresets() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const laStart   = m >= 4 ? y : y - 1
  const acadStart = m >= 9 ? y : y - 1
  return [
    { label: `LA ${laStart}-${String(laStart + 1).slice(2)}`,     start: `${laStart}-04-01`,     end: `${laStart + 1}-03-31` },
    { label: `LA ${laStart + 1}-${String(laStart + 2).slice(2)}`, start: `${laStart + 1}-04-01`, end: `${laStart + 2}-03-31` },
    { label: `Acad ${acadStart}-${String(acadStart + 1).slice(2)}`,     start: `${acadStart}-09-01`,     end: `${acadStart + 1}-07-18` },
    { label: `Acad ${acadStart + 1}-${String(acadStart + 2).slice(2)}`, start: `${acadStart + 1}-09-01`, end: `${acadStart + 2}-07-18` },
  ]
}

export default function EditContractPage() {
  const router = useRouter()
  const params = useParams()
  const schoolId   = params.id as string
  const contractId = params.contractId as string
  const supabase   = createClient()

  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const [form, setForm] = useState({
    start_date:             '',
    end_date:               '',
    frequency:              'fortnightly',
    custom_visits_per_year: '',
    visit_duration:         'half_day',
    notes:                  '',
  })

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('contracts')
        .select('*')
        .eq('id', contractId)
        .single()

      if (data) {
        setForm({
          start_date:             data.start_date ?? '',
          end_date:               data.end_date ?? '',
          frequency:              data.frequency ?? 'fortnightly',
          custom_visits_per_year: data.custom_visits_per_year?.toString() ?? '',
          visit_duration:         data.visit_duration ?? 'half_day',
          notes:                  data.notes ?? '',
        })
      }
      setLoading(false)
    }
    load()
  }, [contractId])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target
    setForm(prev => {
      const updated = { ...prev, [name]: value }
      if (name === 'start_date' && value > prev.end_date) updated.end_date = value
      return updated
    })
  }

  function expectedVisits(): string {
    switch (form.frequency) {
      case 'weekly':                return '38'
      case 'one_point_five_weekly': return '57'
      case 'twice_weekly':          return '76'
      case 'three_times_weekly':    return '114'
      case 'fortnightly':           return '19'
      case 'monthly':               return '12'
      case 'half_termly':           return '6'
      case 'termly':                return '3'
      case 'custom':                return form.custom_visits_per_year || '—'
      default:                      return '—'
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const { data: existing } = await supabase
      .from('contracts')
      .select('id, start_date, end_date')
      .eq('school_id', schoolId)
      .neq('status', 'cancelled')
      .neq('id', contractId)
    const overlap = (existing ?? []).find(
      (c: { start_date: string; end_date: string }) =>
        form.start_date <= c.end_date && c.start_date <= form.end_date
    )
    if (overlap) {
      setError(`This period overlaps with an existing contract (${overlap.start_date} – ${overlap.end_date}).`)
      setSaving(false)
      return
    }

    const startYear = new Date(form.start_date).getFullYear()
    const endYear   = new Date(form.end_date).getFullYear()
    const academicYear = startYear === endYear
      ? `${startYear}`
      : `${startYear}-${String(endYear).slice(2)}`

    const today = new Date().toISOString().split('T')[0]
    const status = form.end_date < today ? 'expired' : 'active'

    const { error } = await supabase
      .from('contracts')
      .update({
        start_date:             form.start_date,
        end_date:               form.end_date,
        academic_year:          academicYear,
        frequency:              form.frequency,
        custom_visits_per_year: form.frequency === 'custom' ? parseInt(form.custom_visits_per_year) || null : null,
        visit_duration:         form.visit_duration,
        status,
        notes:                  form.notes.trim() || null,
      })
      .eq('id', contractId)

    if (error) { setError(error.message); setSaving(false); return }
    router.push(`/admin/schools/${schoolId}`)
    router.refresh()
  }

  async function handleCancel() {
    setCancelling(true)
    const { error } = await supabase
      .from('contracts')
      .update({ status: 'cancelled' })
      .eq('id', contractId)
    if (error) { setError(error.message); setCancelling(false); return }
    router.push(`/admin/schools/${schoolId}`)
    router.refresh()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    )
  }

  const presets = getDatePresets()

  return (
    <div className="max-w-lg">

      <div className="flex items-center gap-3 mb-6">
        <Link href={`/admin/schools/${schoolId}`} className="text-gray-400 hover:text-gray-600 text-sm">
          ← School
        </Link>
        <span className="text-gray-200">/</span>
        <h1 className="text-xl font-semibold text-gray-900">Edit contract</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Dates */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Contract period</h2>

          <div className="flex flex-wrap gap-2">
            {presets.map(p => (
              <button key={p.label} type="button"
                onClick={() => setForm(prev => ({ ...prev, start_date: p.start, end_date: p.end }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  form.start_date === p.start && form.end_date === p.end
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start date <span className="text-red-500">*</span>
              </label>
              <input name="start_date" type="date" required value={form.start_date}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End date <span className="text-red-500">*</span>
              </label>
              <input name="end_date" type="date" required min={form.start_date} value={form.end_date}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
          </div>
        </div>

        {/* Frequency */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Visit frequency</h2>
          <div className="grid grid-cols-2 gap-2">
            {FREQUENCY_OPTIONS.map(opt => (
              <label key={opt.value}
                className={`flex flex-col px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                  form.frequency === opt.value
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}>
                <input type="radio" name="frequency" value={opt.value}
                  checked={form.frequency === opt.value}
                  onChange={handleChange} className="sr-only" />
                <span className="text-sm font-medium">{opt.label}</span>
                <span className={`text-xs mt-0.5 ${form.frequency === opt.value ? 'text-gray-300' : 'text-gray-400'}`}>
                  {opt.description}
                </span>
              </label>
            ))}
          </div>

          {form.frequency === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Visits per year <span className="text-red-500">*</span>
              </label>
              <input name="custom_visits_per_year" type="number" min="1" max="200"
                required value={form.custom_visits_per_year} onChange={handleChange}
                placeholder="e.g. 25"
                className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
          )}

          <div className="bg-gray-50 rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-gray-500">Expected visits this contract</span>
            <span className="text-sm font-semibold text-gray-900">{expectedVisits()}</span>
          </div>
        </div>

        {/* Visit duration */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Visit duration</h2>
          <div className="grid grid-cols-2 gap-3">
            {DURATION_OPTIONS.map(opt => (
              <label key={opt.value}
                className={`flex flex-col px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                  form.visit_duration === opt.value
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}>
                <input type="radio" name="visit_duration" value={opt.value}
                  checked={form.visit_duration === opt.value}
                  onChange={handleChange} className="sr-only" />
                <span className="text-sm font-medium">{opt.label}</span>
                <span className={`text-xs mt-0.5 ${form.visit_duration === opt.value ? 'text-gray-300' : 'text-gray-400'}`}>
                  {opt.description}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Notes</h2>
          <textarea name="notes" value={form.notes} onChange={handleChange} rows={3}
            placeholder="Any notes about this contract..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: '#46DA26' }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <Link href={`/admin/schools/${schoolId}`}
            className="px-6 py-2.5 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">
            Cancel
          </Link>
        </div>

      </form>

      {/* Cancel contract */}
      <div className="mt-8 pt-6 border-t border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Cancel contract</h2>
        <p className="text-xs text-gray-400 mb-3">
          Mark this contract as cancelled. This cannot be undone automatically.
        </p>
        {!confirmCancel ? (
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50">
            Cancel this contract
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">
              {cancelling ? 'Cancelling…' : 'Yes, cancel it'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">
              Keep contract
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
