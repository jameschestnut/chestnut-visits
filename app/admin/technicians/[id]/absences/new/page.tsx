'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

const ABSENCE_TYPES = [
  { value: 'planned',    label: 'Annual leave' },
  { value: 'unplanned',  label: 'Sickness / unplanned' },
  { value: 'phone_duty', label: 'Phone duty' },
]

const SLOT_OPTIONS = [
  { value: 'full_day', label: 'Full day' },
  { value: 'am',       label: 'AM only' },
  { value: 'pm',       label: 'PM only' },
]

export default function NewAbsencePage() {
  const router = useRouter()
  const params = useParams()
  const techId = params.id as string
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState({
    absence_type: 'planned',
    start_date: today,
    end_date: today,
    slot: 'full_day',
    notes: '',
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target
    setForm(prev => {
      const updated = { ...prev, [name]: value }
      // Keep end_date >= start_date
      if (name === 'start_date' && value > prev.end_date) {
        updated.end_date = value
      }
      return updated
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase
      .from('technician_absences')
      .insert({
        technician_id: techId,
        absence_type: form.absence_type,
        start_date: form.start_date,
        end_date: form.end_date,
        slot: form.slot,
        notes: form.notes.trim() || null,
      })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push(`/admin/technicians/${techId}`)
    router.refresh()
  }

  return (
    <div className="max-w-lg">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/admin/technicians/${techId}`} className="text-gray-400 hover:text-gray-600 text-sm">
          ← Technician
        </Link>
        <span className="text-gray-200">/</span>
        <h1 className="text-xl font-semibold text-gray-900">Add absence</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">

          {/* Absence type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {ABSENCE_TYPES.map(type => (
                <label key={type.value} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="absence_type"
                    value={type.value}
                    checked={form.absence_type === type.value}
                    onChange={handleChange}
                    className="accent-gray-900"
                  />
                  <span className="text-sm text-gray-700">{type.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Date range */}
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

          {/* Slot */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Which part of the day?
            </label>
            <div className="flex gap-3">
              {SLOT_OPTIONS.map(opt => (
                <label key={opt.value}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                    form.slot === opt.value
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  <input
                    type="radio"
                    name="slot"
                    value={opt.value}
                    checked={form.slot === opt.value}
                    onChange={handleChange}
                    className="sr-only"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={2}
              placeholder="Optional notes..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
            />
          </div>

        </div>

        {/* Warning */}
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <p className="text-xs text-amber-700">
            <strong>Note:</strong> Any confirmed visits falling within this absence period will be automatically marked as disrupted and moved to the visit bank for rescheduling.
          </p>
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
            {loading ? 'Saving…' : 'Save absence'}
          </button>
          <Link
            href={`/admin/technicians/${techId}`}
            className="px-6 py-2.5 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>

      </form>
    </div>
  )
}