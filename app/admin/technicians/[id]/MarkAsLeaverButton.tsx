'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function MarkAsLeaverButton({
  techId,
  techName,
}: {
  techId: string
  techName: string
}) {
  const router   = useRouter()
  const supabase = createClient()

  const [open, setOpen]           = useState(false)
  const [leavingDate, setLeavingDate] = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]

  async function handleConfirm() {
    if (!leavingDate) return
    setLoading(true)
    setError(null)

    // Set leaving date and mark inactive
    const { error: techError } = await supabase
      .from('technicians')
      .update({
        leaving_date: leavingDate,
        is_active:    false,
      })
      .eq('id', techId)

    if (techError) {
      setError(techError.message)
      setLoading(false)
      return
    }

    // Bank all confirmed visits from the leaving date onwards
    const { error: visitError } = await supabase
      .from('visits')
      .update({
        status:    'banked',
        banked_at: new Date().toISOString(),
      })
      .eq('technician_id', techId)
      .eq('status', 'confirmed')
      .gte('visit_date', leavingDate)

    if (visitError) {
      setError(visitError.message)
      setLoading(false)
      return
    }

    router.refresh()
    setOpen(false)
    setLoading(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-lg text-sm font-medium text-orange-700 border border-orange-200 bg-orange-50 hover:bg-orange-100 transition-colors"
      >
        Mark as leaver
      </button>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-orange-50 border border-orange-100 rounded-lg p-4">
        <p className="text-sm font-medium text-orange-800 mb-3">
          Mark {techName} as a leaver
        </p>
        <p className="text-xs text-orange-600 mb-4">
          The technician will be marked as inactive and all confirmed visits from the leaving date onwards will be automatically banked for reassignment.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-orange-800 mb-1">Leaving date</label>
          <input
            type="date"
            min={today}
            value={leavingDate}
            onChange={e => setLeavingDate(e.target.value)}
            className="px-3 py-2 border border-orange-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>

        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={loading || !leavingDate}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Saving…' : 'Confirm'}
          </button>
          <button
            onClick={() => { setOpen(false); setError(null) }}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}