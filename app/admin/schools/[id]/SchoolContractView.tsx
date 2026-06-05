'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

const VISIT_TYPE_LABELS: Record<string, string> = {
  technology_partner: 'TP Visit',
  handover:           'Handover',
  shadow:             'Shadow',
  installation:       'Installation',
  phone_duty:         'Phone duty',
  other_visit:        'Other visit',
}

interface Contract {
  id: string
  start_date: string
  end_date: string
  frequency: string
  visit_duration: string
  status: string
}

interface Visit {
  id: string
  visit_date: string
  slot: string
  visit_type: string
  status: string
  notes: string | null
  technicians: unknown
}

interface Contact {
  id: string
  full_name: string
  role_title: string | null
  email: string
  notify_visits: boolean
  is_primary: boolean
}

interface Props {
  schoolId: string
  contracts: Contract[]
  allVisits: Visit[]
  contacts: Contact[]
}

function displayStatus(c: Contract, today: string) {
  if (c.status === 'cancelled') return 'cancelled'
  if (c.end_date < today)       return 'expired'
  if (c.start_date > today)     return 'future'
  return 'active'
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function SchoolContractView({ schoolId, contracts, allVisits, contacts }: Props) {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  const sorted = [...contracts].sort(
    (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  )

  const defaultContract =
    sorted.find(c => c.status === 'active' && c.start_date <= today && c.end_date >= today) ??
    sorted[0]

  const [selectedId, setSelectedId] = useState<string>(defaultContract?.id ?? '')
  const [visits, setVisits] = useState<Visit[]>(allVisits)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const selected = sorted.find(c => c.id === selectedId) ?? null

  const contractVisits = selected
    ? visits.filter(v => v.visit_date >= selected.start_date && v.visit_date <= selected.end_date)
    : []

  async function deleteVisit(visitId: string) {
    if (!confirm('Delete this visit? This cannot be undone.')) return
    setDeletingId(visitId)
    await supabase.from('visits').delete().eq('id', visitId)
    setVisits(prev => prev.filter(v => v.id !== visitId))
    setDeletingId(null)
  }

  const completed  = contractVisits.filter(v => v.status === 'completed').length
  const banked     = contractVisits.filter(v => v.status === 'banked').length
  const total      = contractVisits.length
  const remaining  = total - completed - banked

  const isActiveContract = selected
    ? selected.status === 'active' && selected.start_date <= today && selected.end_date >= today
    : false

  return (
    <div className="grid grid-cols-3 gap-4">

      {/* Left column */}
      <div className="col-span-2 space-y-4">

        {/* Contracts */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Contracts</h2>
            <div className="flex items-center gap-3">
              {isActiveContract && (
                <Link href={`/admin/schools/${schoolId}/schedule/generate`}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg text-white"
                  style={{ background: '#46DA26' }}>
                  Generate schedule
                </Link>
              )}
              <Link href={`/admin/schools/${schoolId}/contracts/new`}
                className="text-xs text-gray-400 hover:text-gray-700">
                + Add contract
              </Link>
            </div>
          </div>

          {sorted.length > 0 ? (
            <div className="space-y-2">
              {sorted.map(contract => {
                const status     = displayStatus(contract, today)
                const isSelected = contract.id === selectedId
                return (
                  <button key={contract.id}
                    onClick={() => setSelectedId(contract.id)}
                    className={`w-full text-left p-3 rounded-lg border text-sm transition-colors ${
                      isSelected
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
                    }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {fmtDate(contract.start_date)} – {fmtDate(contract.end_date)}
                      </span>
                      <div className="flex items-center gap-2">
                        <Link href={`/admin/schools/${schoolId}/contracts/${contract.id}/edit`}
                          onClick={e => e.stopPropagation()}
                          className={`text-xs ${isSelected ? 'text-gray-300 hover:text-white' : 'text-gray-400 hover:text-gray-700'}`}>
                          Edit
                        </Link>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          isSelected        ? 'bg-white/20 text-white' :
                          status === 'active'    ? 'bg-green-50 text-green-700' :
                          status === 'future'    ? 'bg-blue-50 text-blue-700' :
                          status === 'cancelled' ? 'bg-amber-50 text-amber-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>{status}</span>
                      </div>
                    </div>
                    <div className={`text-xs mt-1 ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>
                      <span className="capitalize">{contract.frequency.replace(/_/g, ' ')}</span>
                      <span className="mx-1">·</span>
                      <span>{contract.visit_duration === 'half_day' ? 'Half day' : 'Full day'}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400 mb-3">No contracts yet</p>
              <Link href={`/admin/schools/${schoolId}/contracts/new`}
                className="inline-flex px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: '#46DA26' }}>
                Add contract
              </Link>
            </div>
          )}
        </div>

        {/* Visits */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">
              Visits
              {selected && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {fmtDate(selected.start_date)} – {fmtDate(selected.end_date)}
                </span>
              )}
            </h2>
            <Link href="/admin/reports" className="text-xs text-gray-400 hover:text-gray-700">
              Full report →
            </Link>
          </div>

          {!selected ? (
            <p className="text-sm text-gray-400 text-center py-4">No contract selected</p>
          ) : contractVisits.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {contractVisits.map(v => {
                const dayName = DAY_NAMES[new Date(v.visit_date + 'T12:00:00').getDay()]
                return (
                  <div key={v.id} className="flex items-center gap-2 py-2 text-xs group">
                    <span className="text-gray-400 w-6 shrink-0">{dayName}</span>
                    <span className="text-gray-500 w-20 shrink-0">{fmtDate(v.visit_date)}</span>
                    <span className={`px-1.5 py-0.5 rounded font-medium shrink-0 ${
                      v.slot === 'am'       ? 'bg-blue-50 text-blue-700' :
                      v.slot === 'pm'       ? 'bg-orange-50 text-orange-700' :
                      v.slot === 'full_day' ? 'bg-gray-100 text-gray-600' :
                                              'bg-gray-50 text-gray-500'
                    }`}>
                      {v.slot === 'full_day' ? 'Full' : v.slot.toUpperCase()}
                    </span>
                    <span className="text-gray-600 flex-1 truncate">
                      {VISIT_TYPE_LABELS[v.visit_type] ?? v.visit_type}
                      {(v.technicians as { full_name: string } | null)?.full_name && ` · ${(v.technicians as { full_name: string }).full_name.split(' ')[0]}`}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full font-medium shrink-0 capitalize ${
                      v.status === 'completed' ? 'bg-green-50 text-green-700' :
                      v.status === 'confirmed' ? 'bg-blue-50 text-blue-700' :
                      v.status === 'banked'    ? 'bg-purple-50 text-purple-700' :
                      v.status === 'disrupted' ? 'bg-red-50 text-red-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {v.status}
                    </span>
                    <button
                      onClick={() => deleteVisit(v.id)}
                      disabled={deletingId === v.id}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all shrink-0 disabled:opacity-30"
                      title="Delete visit"
                    >×</button>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No visits scheduled yet</p>
          )}
        </div>

      </div>

      {/* Right column */}
      <div className="space-y-4">

        {/* Contacts */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Contacts</h2>
            <Link href={`/admin/schools/${schoolId}/contacts/new`}
              className="text-xs text-gray-400 hover:text-gray-700">
              + Add
            </Link>
          </div>
          {contacts.length > 0 ? (
            <div className="space-y-3">
              {contacts.map(contact => (
                <div key={contact.id} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{contact.full_name}</span>
                      {contact.is_primary && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Primary</span>
                      )}
                    </div>
                    <Link href={`/admin/schools/${schoolId}/contacts/${contact.id}/edit`}
                      className="text-xs text-gray-400 hover:text-gray-700 shrink-0">
                      Edit
                    </Link>
                  </div>
                  {contact.role_title && (
                    <p className="text-gray-400 text-xs mt-0.5">{contact.role_title}</p>
                  )}
                  <p className="text-gray-500 mt-0.5">{contact.email}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${contact.notify_visits ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="text-xs text-gray-400">
                      {contact.notify_visits ? 'Receives notifications' : 'No notifications'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-3">No contacts yet</p>
          )}
        </div>

        {/* Visit stats */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Visit summary</h2>
          {selected && total > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Completed</span>
                <span className="font-semibold text-gray-900">{completed}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Remaining</span>
                <span className="font-semibold text-gray-900">{remaining}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Banked</span>
                <span className="font-semibold text-gray-900">{banked}</span>
              </div>
              <div className="flex items-center justify-between text-sm border-t border-gray-50 pt-3">
                <span className="text-gray-500">Total scheduled</span>
                <span className="font-semibold text-gray-900">{total}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400">
              {selected ? 'No visits scheduled yet' : 'Select a contract'}
            </p>
          )}
        </div>

      </div>
    </div>
  )
}
