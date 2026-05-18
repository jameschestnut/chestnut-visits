'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

export default function EditContactPage() {
  const router = useRouter()
  const params = useParams()
  const schoolId  = params.id as string
  const contactId = params.contactId as string
  const supabase  = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const [form, setForm] = useState({
    full_name:     '',
    email:         '',
    role_title:    '',
    is_primary:    false,
    notify_visits: false,
    is_active:     true,
  })

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('school_contacts')
        .select('*')
        .eq('id', contactId)
        .single()

      if (data) {
        setForm({
          full_name:     data.full_name ?? '',
          email:         data.email ?? '',
          role_title:    data.role_title ?? '',
          is_primary:    data.is_primary ?? false,
          notify_visits: data.notify_visits ?? false,
          is_active:     data.is_active ?? true,
        })
      }
      setLoading(false)
    }
    load()
  }, [contactId])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value, type, checked } = e.target
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const { error } = await supabase
      .from('school_contacts')
      .update({
        full_name:     form.full_name.trim(),
        email:         form.email.trim(),
        role_title:    form.role_title.trim() || null,
        is_primary:    form.is_primary,
        notify_visits: form.notify_visits,
        is_active:     form.is_active,
      })
      .eq('id', contactId)

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    router.push(`/admin/schools/${schoolId}`)
    router.refresh()
  }

  async function handleDelete() {
    setDeleting(true)
    await supabase
      .from('school_contacts')
      .delete()
      .eq('id', contactId)

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

  return (
    <div className="max-w-lg">

      <div className="flex items-center gap-3 mb-6">
        <Link href={`/admin/schools/${schoolId}`} className="text-gray-400 hover:text-gray-600 text-sm">
          ← School
        </Link>
        <span className="text-gray-200">/</span>
        <h1 className="text-xl font-semibold text-gray-900">Edit contact</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full name <span className="text-red-500">*</span>
            </label>
            <input name="full_name" type="text" required value={form.full_name}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role / title</label>
            <input name="role_title" type="text" value={form.role_title}
              onChange={handleChange}
              placeholder="e.g. IT Lead, Headteacher, School Office"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input name="email" type="email" required value={form.email}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>

        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Settings</h2>

          <label className="flex items-start gap-3 cursor-pointer">
            <input name="notify_visits" type="checkbox" checked={form.notify_visits}
              onChange={handleChange} className="mt-0.5 accent-gray-900" />
            <div>
              <p className="text-sm font-medium text-gray-900">Receive visit notifications</p>
              <p className="text-xs text-gray-400 mt-0.5">This contact will receive reminder and change notification emails</p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input name="is_primary" type="checkbox" checked={form.is_primary}
              onChange={handleChange} className="mt-0.5 accent-gray-900" />
            <div>
              <p className="text-sm font-medium text-gray-900">Primary contact</p>
              <p className="text-xs text-gray-400 mt-0.5">Main point of contact for this school</p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input name="is_active" type="checkbox" checked={form.is_active}
              onChange={handleChange} className="mt-0.5 accent-gray-900" />
            <div>
              <p className="text-sm font-medium text-gray-900">Active</p>
              <p className="text-xs text-gray-400 mt-0.5">Inactive contacts won't receive notifications</p>
            </div>
          </label>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">{error}</p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving || !form.full_name || !form.email}
              className="px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: '#8B3A2A' }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <Link href={`/admin/schools/${schoolId}`}
              className="px-6 py-2.5 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">
              Cancel
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setShowDelete(true)}
            className="text-sm text-red-500 hover:text-red-700"
          >
            Delete contact
          </button>
        </div>

      </form>

      {/* Delete confirmation */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowDelete(false)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-100 p-5 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Delete contact?</h3>
            <p className="text-xs text-gray-500 mb-4">
              This will permanently remove <strong>{form.full_name}</strong> from this school. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button
                onClick={() => setShowDelete(false)}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}