'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

export default function NewContactPage() {
  const router = useRouter()
  const params = useParams()
  const schoolId = params.id as string
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    role_title: '',
    is_primary: false,
    notify_visits: false,
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value, type, checked } = e.target
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase
      .from('school_contacts')
      .insert({
        school_id: schoolId,
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        role_title: form.role_title.trim() || null,
        is_primary: form.is_primary,
        notify_visits: form.notify_visits,
        is_active: true,
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
        <h1 className="text-xl font-semibold text-gray-900">Add contact</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              name="full_name"
              type="text"
              required
              value={form.full_name}
              onChange={handleChange}
              placeholder="e.g. Sarah Mitchell"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role / title
            </label>
            <input
              name="role_title"
              type="text"
              value={form.role_title}
              onChange={handleChange}
              placeholder="e.g. IT Lead, Headteacher, School Office"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              name="email"
              type="email"
              required
              value={form.email}
              onChange={handleChange}
              placeholder="sarah@school.co.uk"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone
            </label>
            <input
              name="phone"
              type="tel"
              value={form.phone}
              onChange={handleChange}
              placeholder="01234 567890"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

        </div>

        {/* Flags */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Settings</h2>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              name="notify_visits"
              type="checkbox"
              checked={form.notify_visits}
              onChange={handleChange}
              className="mt-0.5 accent-gray-900"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">Receive visit notifications</p>
              <p className="text-xs text-gray-400 mt-0.5">This contact will receive reminder and change notification emails</p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              name="is_primary"
              type="checkbox"
              checked={form.is_primary}
              onChange={handleChange}
              className="mt-0.5 accent-gray-900"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">Primary contact</p>
              <p className="text-xs text-gray-400 mt-0.5">Mark as the main point of contact for this school</p>
            </div>
          </label>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || !form.full_name || !form.email}
            className="px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
            style={{ background: '#8B3A2A' }}
          >
            {loading ? 'Saving…' : 'Save contact'}
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