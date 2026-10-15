import { useCallback, useEffect, useState } from 'react'
import { loadTraining, saveTraining, type TrainingState } from '../training/store'

/** Training progress from IndexedDB, with an updater that saves every change. */
export function useTraining() {
  const [state, setState] = useState<TrainingState | null>(null)
  useEffect(() => {
    void loadTraining().then(setState)
  }, [])
  const update = useCallback((fn: (s: TrainingState) => TrainingState) => {
    setState((s) => {
      if (!s) return s
      const next = fn(s)
      void saveTraining(next)
      return next
    })
  }, [])
  return [state, update] as const
}
