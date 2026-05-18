'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import PhotoUpload from '@/components/PhotoUpload'

export default function EditSchoolPage() {
  const router   = useRouter()
  const params   = useParams()
  const schoolId = params.id as string
  const supabase = createClient()

  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const [form, setForm] = useState({
    name:           '',
    short_name:     '',
    address_line_1: '',
    address_line_2: '',
    town:           '',
    county:         '',
    postcode:       '',
    notes:          '',
    is_active:      true,
    photo_url:      '',
  })

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('schools')
        .select('*')
        .eq('id', schoolId)
        .single()

      if (data) {
        setForm({
          name:           data.name ?? '',
          short_name:     data.short_name ?? '',
          address_line_1: data.address_line_1 ?? '',
          address_line_2: data.address_line_2 ?? '',
          town:           data.town ?? '',
          county:         data.county ?? '',
          postcode:       data.postcode ?? '',
          notes:          data.notes ?? '',
          is_active:      data.is_active ?? true,
          photo_url:      data.photo_url ?? '',
        })
      }
      setLoading(false)
    }
    load()
  }, [schoolId])

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
      .from('schools')
      .update({
        name:           form.name.trim(),
        short_name:     form.short_name.trim() || null,
        address_line_1: form.address_line_1.trim() || null,
        address_line_2: form.address_line_2.trim() || null,
        town:           form.town.trim() || null,
        county:         form.county.trim() || null,
        postcode:       form.postcode.trim().toUpperCase() || null,
        notes:          form.notes.trim() || null,
        is_active:      form.is_active,
      })
      .eq('id', schoolId)

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
    await supabase.from('schools').delete().eq('id', schoolId)
    router.push('/admin/schools')
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
        <h1 className="text-xl font-semibold text-gray-900">Edit school</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Photo */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Photo</h2>
          <PhotoUpload
            currentUrl={form.photo_url || null}
            entityType="school"
            entityId={schoolId}
            displayName={form.name}
            onUpload={url => setForm(p => ({ ...p, photo_url: url }))}
          />
        </div>

        {/* School details */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">School details</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              School name <span className="text-red-500">*</span>
            </label>
            <input name="name" type="text" required value={form.name}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Short name
              <span className="text-gray-400 font-normal ml-1">(used in schedule views)</span>
            </label>
            <input name="short_name" type="text" value={form.short_name}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input name="is_active" type="checkbox" checked={form.is_active}
              onChange={handleChange} className="accent-gray-900" />
            <span className="text-sm font-medium text-gray-700">Active</span>
          </label>
        </div>

        {/* Address */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Address</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address line 1</label>
            <input name="address_line_1" type="text" value={form.address_line_1}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address line 2</label>
            <input name="address_line_2" type="text" value={form.address_line_2}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Town</label>
              <input name="town" type="text" value={form.town}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
              <input name="postcode" type="text" value={form.postcode}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">County</label>
            <input name="county" type="text" value={form.county}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
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
            <button type="submit" disabled={saving || !form.name}
              className="px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: '#8B3A2A' }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <Link href={`/admin/schools/${schoolId}`}
              className="px-6 py-2.5 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">
              Cancel
            </Link>
          </div>
          <button type="button" onClick={() => setShowDelete(true)}
            className="text-sm text-red-500 hover:text-red-700">
            Delete school
          </button>
        </div>

      </form>

      {/* Delete confirmation modal */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowDelete(false)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-100 p-5 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Delete school?</h3>
            <p className="text-xs text-gray-500 mb-4">
              This will permanently remove <strong>{form.name}</strong> and all associated data. This cannot be undone.
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