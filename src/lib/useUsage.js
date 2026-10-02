import { useEffect, useState } from 'react'
import { listUsage } from './api.js'

// { [toolId]: { total, last30, last_used } }, fetched once per visit.
let cache = null
let inflight = null
const listeners = new Set()

function load() {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = listUsage()
      .then((d) => {
        cache = Object.fromEntries((d?.usage || []).map((u) => [u.tool_id, u]))
        for (const fn of listeners) fn(cache)
        return cache
      })
      .catch(() => {
        cache = cache || {}
        for (const fn of listeners) fn(cache)
        return cache
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

export function useUsage() {
  const [usage, setUsage] = useState(cache || {})
  useEffect(() => {
    const fn = (c) => setUsage({ ...c })
    listeners.add(fn)
    load()
    return () => listeners.delete(fn)
  }, [])
  return usage
}
