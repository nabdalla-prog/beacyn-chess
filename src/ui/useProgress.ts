// Streak and badges from saved data. Newly earned badges are saved with their date,
// so they stay even if a score dips later.
import { useEffect, useState } from 'react'
import { listGames, loadBadges, saveBadges } from '../storage/db'
import { loadTraining } from '../training/store'
import { activeDaysFrom, computeBadges, computeStreak, newlyEarned, type BadgeState, type Streak } from '../training/progress'
import { eventsFromGame, eventsFromPuzzles, scoreSkills } from '../coach/skills'

export interface ProgressData {
  streak: Streak
  badges: BadgeState[]
  /** Earned since the last time progress was looked at. */
  fresh: BadgeState[]
}

/** `withSkills` also scores skills (a bit more work) so the skill badges can be checked. */
export function useProgress(withSkills: boolean): ProgressData | null {
  const [data, setData] = useState<ProgressData | null>(null)
  useEffect(() => {
    let alive = true
    void (async () => {
      const [games, training, earned] = await Promise.all([listGames(), loadTraining(), loadBadges()])
      const now = Date.now()
      const scores = withSkills ? scoreSkills([...games.flatMap(eventsFromGame), ...eventsFromPuzzles(training.results)]) : {}
      const badges = computeBadges({ games, training, scores, earned, now })
      const fresh = newlyEarned(badges, earned)
      if (fresh.length) await saveBadges({ ...earned, ...Object.fromEntries(fresh.map((b) => [b.id, b.at ?? now])) })
      if (alive) setData({ streak: computeStreak(activeDaysFrom(games, training), now), badges, fresh })
    })()
    return () => {
      alive = false
    }
  }, [withSkills])
  return data
}
