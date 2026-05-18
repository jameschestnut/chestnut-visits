'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'

interface PhotoUploadProps {
  currentUrl:  string | null
  entityType:  'technician' | 'school'
  entityId:    string
  displayName: string
  onUpload:    (url: string) => void
}

export default function PhotoUpload({
  currentUrl,
  entityType,
  entityId,
  displayName,
  onUpload,
}: PhotoUploadProps) {
  const supabase    = createClient()
  const fileRef     = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [preview, setPreview]     = useState<string | null>(currentUrl)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate type and size
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Please upload a JPG, PNG or WebP image')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be under 2MB')
      return
    }

    setUploading(true)
    setError(null)

    const ext      = file.name.split('.').pop()
    const path     = `${entityType}s/${entityId}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setError(uploadError.message)
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    const publicUrl = data.publicUrl

    // Save URL to the database
    const table  = entityType === 'technician' ? 'technicians' : 'schools'
    await supabase.from(table).update({ photo_url: publicUrl }).eq('id', entityId)

    setPreview(publicUrl)
    onUpload(publicUrl)
    setUploading(false)
  }

  async function handleRemove() {
    setUploading(true)
    const table = entityType === 'technician' ? 'technicians' : 'schools'
    await supabase.from(table).update({ photo_url: null }).eq('id', entityId)
    setPreview(null)
    onUpload('')
    setUploading(false)
  }

  // Initials fallback
const initials = (displayName || '')
  .split(' ')
  .filter(Boolean)
  .map(n => n[0])
  .join('')
  .toUpperCase()
  .slice(0, 2) || '?'

  return (
    <div className="flex items-center gap-4">

      {/* Avatar */}
      <div className="relative shrink-0">
        {preview ? (
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-gray-100">
            <img
              src={preview}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-white text-lg font-semibold border-2 border-gray-100"
            style={{ background: '#8B3A2A' }}
          >
            {initials}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="space-y-1.5">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="block text-xs font-medium text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {uploading ? 'Uploading…' : preview ? 'Change photo' : 'Upload photo'}
        </button>
        {preview && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={uploading}
            className="block text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
          >
            Remove photo
          </button>
        )}
        <p className="text-xs text-gray-400">JPG, PNG or WebP · max 2MB</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

    </div>
  )
}