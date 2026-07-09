'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
  leaving_date: string | null
  support_tiers: string[] | null
}

export default function TechniciansPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [technicians, setTechnicians]   = useState<Technician[]>([])
  const [loading, setLoading]           = useState(true)
  const [hideInactive, setHideInactive] = useState(true)
  const [search, setSearch]             = useState('')
  const [sortCol, setSortCol]           = useState<'full_name' | 'job_title'>('full_name')
  const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const today = new Date().toISOString().split('T')[0]
      const { data } = await supabase
        .from('technicians')
        .select('id, full_name, initials, email, is_active, photo_url, job_title, leaving_date, support_tiers')
        .order('full_name')
      // Include active techs + anyone with a future leaving date (still current employees)
      setTechnicians((data ?? []).filter((t: Technician) =>
        t.is_active || (t.leaving_date && t.leaving_date >= today)
      ))
      setLoading(false)
    }
    load()
  }, [])

  const activeCount   = technicians.filter(t => t.is_active).length
  const leaverCount   = technicians.filter(t => !t.is_active && t.leaving_date).length
  const inactiveCount = technicians.filter(t => !t.is_active).length

  function toggleSort(col: 'full_name' | 'job_title') {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const today = new Date().toISOString().split('T')[0]
  const filtered = technicians
    .filter(t => (hideInactive && !search) ? (t.is_active || (t.leaving_date && t.leaving_date >= today)) : true)
    .filter(t => !search || t.full_name.toLowerCase().includes(search.toLowerCase()) || t.email.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const av = (a[sortCol] ?? '').toLowerCase()
      const bv = (b[sortCol] ?? '').toLowerCase()
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Technicians</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeCount} active
            {leaverCount > 0 && ` · ${leaverCount} leaving`}
            {inactiveCount > 0 && ` · ${inactiveCount} inactive`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-48" />
          <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!hideInactive}
                onChange={e => setHideInactive(!e.target.checked)}
                className="accent-gray-900"
              />
              <span className="text-sm text-gray-600">Show inactive ({inactiveCount})</span>
            </label>
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
                <th className="text-left px-4 py-3 font-medium text-gray-500 cursor-pointer select-none hover:text-gray-800" onClick={() => toggleSort('full_name')}>
                  Name {sortCol === 'full_name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 cursor-pointer select-none hover:text-gray-800" onClick={() => toggleSort('job_title')}>
                  Role {sortCol === 'job_title' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(tech => (
                <tr
                  key={tech.id}
                  onClick={() => router.push(`/admin/technicians/${tech.id}`)}
                  className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors cursor-pointer"
                >
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
                  <td className="px-4 py-3">
                    <span className="text-gray-500">{tech.job_title ?? '—'}</span>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {(tech.support_tiers ?? []).includes('first_line') && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-blue-50 text-blue-700 border border-blue-100">1st Line</span>
                      )}
                      {(tech.support_tiers ?? []).includes('second_line') && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-amber-50 text-amber-700 border border-amber-100">2nd Line</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{tech.email}</td>
                  <td className="px-4 py-3">
                    {tech.leaving_date ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700">
                        Leaving {new Date(tech.leaving_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        tech.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {tech.is_active ? 'Active' : 'Inactive'}
                      </span>
                    )}
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