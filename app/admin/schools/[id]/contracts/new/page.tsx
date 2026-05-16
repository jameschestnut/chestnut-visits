'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

const FREQUENCY_OPTIONS = [
  { value: 'weekly',       label: 'Weekly',        description: '38 visits/year' },
  { value: 'fortnightly',  label: 'Fortnightly',   description: '19 visits/year' },
  { value: 'three_weekly', label: 'Every 3 weeks', description: '~13 visits/year' },
  { value: 'monthly',      label: 'Monthly',       description: '12 visits/year' },
  { value: 'half_termly',  label: 'Half-termly',   description: '6 visits/year' },
  { value: 'termly',       label: 'Termly',        description: '3 visits/year' },
  { value: 'custom',       label: 'Custom',        description: 'Set manually' },
]

const DURATION_OPTIONS = [
  { value: 'half_day', label: 'Half day', description: '3.5hr visit · 4hr blocked' },
  { value: 'full_day', label: 'Full day', description: '7hr visit · 8hr blocked' },
]

export default function NewContractPage() {
  const router = useRouter()
  const params = useParams()
  const schoolId = params.id as string
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState({
    start_date: '2026-09-01',
    end_date: '2027-07-18',
    frequency: 'fortnightly',
    custom_visits_per_year: '',
    visit_duration: 'half_day',
    notes: '',
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target
    setForm(prev => {
      const updated = { ...prev, [name]: value }
      if (name === 'start_date' && value > prev.end_date) {
        updated.end_date = value
      }
      return updated
    })
  }

  // Calculate expected visits based on frequency
  // Uses 38 teaching weeks as the base
  function expectedVisits(): string {
    const weeks = 38
    switch (form.frequency) {
      case 'weekly':       return '38'
      case 'fortnightly':  return '19'
      case 'three_weekly': return '~13'
      case 'monthly':      return '12'
      case 'half_termly':  return '6'
      case 'termly':       return '3'
      case 'custom':       return form.custom_visits_per_year || '—'
      default:             return '—'
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Derive academic year from start date
    const startYear = new Date(form.start_date).getFullYear()
    const endYear   = new Date(form.end_date).getFullYear()
    const academicYear = startYear === endYear
      ? `${startYear}`
      : `${startYear}-${String(endYear).slice(2)}`

    const { error } = await supabase
      .from('contracts')
      .insert({
        school_id:               schoolId,
        academic_year:           academicYear,
        start_date:              form.start_date,
        end_date:                form.end_date,
        frequency:               form.frequency,
        custom_visits_per_year:  form.frequency === 'custom'
                                   ? parseInt(form.custom_visits_per_year) || null
                                   : null,
        visit_duration:          form.visit_duration,
        status:                  'active',
        notes:                   form.notes.trim() || null,
      })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push(`/admin/schools/${schoolId}`)
    router.refresh()
  }

  return (
    <div className="max-w-lg">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/admin/schools/${schoolId}`} className="text-gray-400 hover:text-gray-600 text-sm">
          ← School
        </Link>
        <span className="text-gray-200">/</span>
        <h1 className="text-xl font-semibold text-gray-900">Add contract</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Dates */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Contract period</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start date <span className="text-red-500">*</span>
              </label>
              <input
                name="start_date"
                type="date"
                required
                value={form.start_date}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End date <span className="text-red-500">*</span>
              </label>
              <input
                name="end_date"
                type="date"
                required
                min={form.start_date}
                value={form.end_date}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
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
                <input
                  type="radio"
                  name="frequency"
                  value={opt.value}
                  checked={form.frequency === opt.value}
                  onChange={handleChange}
                  className="sr-only"
                />
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
              <input
                name="custom_visits_per_year"
                type="number"
                min="1"
                max="200"
                required
                value={form.custom_visits_per_year}
                onChange={handleChange}
                placeholder="e.g. 25"
                className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          )}

          {/* Expected visits summary */}
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
                <input
                  type="radio"
                  name="visit_duration"
                  value={opt.value}
                  checked={form.visit_duration === opt.value}
                  onChange={handleChange}
                  className="sr-only"
                />
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
          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            rows={3}
            placeholder="Any notes about this contract..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
            style={{ background: '#8B3A2A' }}
          >
            {loading ? 'Saving…' : 'Save contract'}
          </button>
          <Link
            href={`/admin/schools/${schoolId}`}
            className="px-6 py-2.5 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>

      </form>
    </div>
  )
}