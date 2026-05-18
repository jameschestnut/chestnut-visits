'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import PhotoUpload from '@/components/PhotoUpload'

export default function EditTechnicianPage() {
  const router  = useRouter()
  const params  = useParams()
  const techId  = params.id as string
  const supabase = createClient()

  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const [form, setForm] = useState({
    full_name:       '',
    initials:        '',
    email:           '',
    home_postcode:   '',
    start_date:      '',
    dbs_number:      '',
    dbs_type:        '',
    dbs_issue_date:  '',
    dbs_expiry_date: '',
    notes:           '',
    is_active:       true,
    photo_url:       '',
  })

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('technicians')
        .select('*')
        .eq('id', techId)
        .single()

      if (data) {
        setForm({
          full_name:       data.full_name ?? '',
          initials:        data.initials ?? '',
          email:           data.email ?? '',
          home_postcode:   data.home_postcode ?? '',
          start_date:      data.start_date ?? '',
          dbs_number:      data.dbs_number ?? '',
          dbs_type:        data.dbs_type ?? '',
          dbs_issue_date:  data.dbs_issue_date ?? '',
          dbs_expiry_date: data.dbs_expiry_date ?? '',
          notes:           data.notes ?? '',
          is_active:       data.is_active ?? true,
          photo_url:       data.photo_url ?? '',
        })
      }
      setLoading(false)
    }
    load()
  }, [techId])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const { error } = await supabase
      .from('technicians')
      .update({
        full_name:       form.full_name.trim(),
        initials:        form.initials.trim().toUpperCase() || null,
        email:           form.email.trim(),
        home_postcode:   form.home_postcode.trim().toUpperCase() || null,
        start_date:      form.start_date || null,
        dbs_number:      form.dbs_number.trim() || null,
        dbs_type:        form.dbs_type || null,
        dbs_issue_date:  form.dbs_issue_date || null,
        dbs_expiry_date: form.dbs_expiry_date || null,
        notes:           form.notes.trim() || null,
        is_active:       form.is_active,
      })
      .eq('id', techId)

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    router.push(`/admin/technicians/${techId}`)
    router.refresh()
  }

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('technicians').delete().eq('id', techId)
    router.push('/admin/technicians')
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
        <Link href={`/admin/technicians/${techId}`} className="text-gray-400 hover:text-gray-600 text-sm">
          ← Technician
        </Link>
        <span className="text-gray-200">/</span>
        <h1 className="text-xl font-semibold text-gray-900">Edit technician</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Photo */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Photo</h2>
          <PhotoUpload
            currentUrl={form.photo_url || null}
            entityType="technician"
            entityId={techId}
            displayName={form.full_name}
            onUpload={url => setForm(p => ({ ...p, photo_url: url }))}
          />
        </div>

        {/* Basic details */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Details</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full name <span className="text-red-500">*</span>
            </label>
            <input name="full_name" type="text" required value={form.full_name}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Initials</label>
            <input name="initials" type="text" maxLength={3} value={form.initials}
              onChange={handleChange}
              className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 uppercase" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input name="email" type="email" required value={form.email}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Home postcode</label>
            <input name="home_postcode" type="text" value={form.home_postcode}
              onChange={handleChange}
              className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 uppercase" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
            <input name="start_date" type="date" value={form.start_date}
              onChange={handleChange}
              className="w-48 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input name="is_active" type="checkbox" checked={form.is_active}
              onChange={handleChange} className="accent-gray-900" />
            <span className="text-sm font-medium text-gray-700">Active</span>
          </label>
        </div>

        {/* DBS */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">DBS information</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">DBS number</label>
            <input name="dbs_number" type="text" value={form.dbs_number}
              onChange={handleChange}
              placeholder="e.g. 001234567890"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Certificate type</label>
            <div className="flex gap-2">
              {['basic', 'standard', 'enhanced'].map(type => (
                <label key={type}
                  className={`flex-1 flex items-center justify-center px-3 py-2 rounded-lg border cursor-pointer transition-colors capitalize text-sm ${
                    form.dbs_type === type
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  <input type="radio" name="dbs_type" value={type}
                    checked={form.dbs_type === type}
                    onChange={handleChange}
                    className="sr-only" />
                  {type}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Issue date</label>
              <input name="dbs_issue_date" type="date" value={form.dbs_issue_date}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry date</label>
              <input name="dbs_expiry_date" type="date" value={form.dbs_expiry_date}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Notes</h2>
          <textarea name="notes" value={form.notes} onChange={handleChange} rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">{error}</p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving || !form.full_name || !form.email}
              className="px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: '#8B3A2A' }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <Link href={`/admin/technicians/${techId}`}
              className="px-6 py-2.5 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">
              Cancel
            </Link>
          </div>
          <button type="button" onClick={() => setShowDelete(true)}
            className="text-sm text-red-500 hover:text-red-700">
            Delete technician
          </button>
        </div>

      </form>

      {/* Delete confirmation modal */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowDelete(false)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-100 p-5 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Delete technician?</h3>
            <p className="text-xs text-gray-500 mb-4">
              This will permanently remove <strong>{form.full_name}</strong>. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button onClick={() => setShowDelete(false)}
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