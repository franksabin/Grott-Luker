import { useEffect, useState, useCallback } from 'react'
import { listSignoffs, addSignoff, removeSignoff } from './api.js'
import { groupSignoffs } from './signoffs.js'

// Module-level cache so the dashboard and tool pages share one fetch per visit.
let cache = null
let inflight = null
const listeners = new Set()

function broadcast() {
  for (const fn of listeners) fn(cache)
}

async function load(force = false) {
  if (cache && !force) return cache
  if (!inflight) {
    inflight = listSignoffs()
      .then((d) => {
        cache = groupSignoffs(d?.signoffs || [])
        broadcast()
        return cache
      })
      .catch(() => {
        cache = cache || {}
        broadcast()
        return cache
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

export function useSignoffs() {
  const [signoffs, setSignoffs] = useState(cache || {})
  const [loaded, setLoaded] = useState(Boolean(cache))
  useEffect(() => {
    const fn = (c) => {
      setSignoffs({ ...c })
      setLoaded(true)
    }
    listeners.add(fn)
    load()
    return () => listeners.delete(fn)
  }, [])
  const signOff = useCallback(async (toolId, cpa, note) => {
    await addSignoff(toolId, cpa, note)
    await load(true)
  }, [])
  const withdraw = useCallback(async (toolId, cpa) => {
    await removeSignoff(toolId, cpa)
    await load(true)
  }, [])
  return { signoffs, loaded, signOff, withdraw }
}
