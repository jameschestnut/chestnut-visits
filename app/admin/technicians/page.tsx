'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

interface Technician {
  id: string
  full_name: string
  initials: string
  email: string
  is_active: boolean
  photo_url: string | null
  job_title: string | null
}

export default function TechniciansPage() {
  const supabase = createClient()
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [loading, setLoading]         = useState(true)
  const [hideInactive, setHideInactive] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('technicians')
        .select('id, full_name, initials, email, is_active, photo_url, job_title')
        .order('full_name')
      setTechnicians(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = hideInactive
    ? technicians.filter(t => t.is_active)
    : technicians

  const activeCount   = technicians.filter(t => t.is_active).length
  const inactiveCount = technicians.filter(t => !t.is_active).length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Technicians</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeCount} active
            {inactiveCount > 0 && ` · ${inactiveCount} inactive`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {inactiveCount > 0 && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hideInactive}
                onChange={e => setHideInactive(e.target.checked)}
                className="accent-gray-900"
              />
              <span className="text-sm text-gray-600">Hide inactive</span>
            </label>
          )}
          <Link
            href="/admin/technicians/new"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: '#46DA26' }}
          >
            <span>+</span> Add technician
          </Link>
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Role</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(tech => (
                <tr key={tech.id}
                  className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {tech.photo_url ? (
                        <img src={tech.photo_url} alt={tech.full_name}
                          className="w-8 h-8 rounded-full object-cover shrink-0 border border-gray-100" />
                      ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                          style={{ background: tech.is_active ? '#46DA26' : '#94a3b8' }}>
                          {tech.initials || tech.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span className={`font-medium ${tech.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                        {tech.full_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{tech.job_title ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{tech.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      tech.is_active
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {tech.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/technicians/${tech.id}`}
                      className="text-xs text-gray-400 hover:text-gray-700">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 border-dashed p-12 text-center">
          <p className="text-gray-500 text-sm mb-4">
            {hideInactive && inactiveCount > 0 ? 'No active technicians' : 'No technicians added yet'}
          </p>
          <Link href="/admin/technicians/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: '#46DA26' }}>
            Add your first technician
          </Link>
        </div>
      )}
    </div>
  )
}