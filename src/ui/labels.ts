export function levelName(rating: number): string {
  if (rating < 800) return 'Beginner'
  if (rating < 1200) return 'Casual'
  if (rating < 1600) return 'Club'
  if (rating < 2000) return 'Strong club'
  return 'Expert'
}
