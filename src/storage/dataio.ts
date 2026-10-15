// Reads everything saved in this browser into one backup, and writes an import back.
import { getKv, listGames, loadBadges, loadCurrentGame, loadProfile, loadSettings, replaceGames, saveBadges, saveCurrentGame, saveProfile, saveSettings, setKv } from './db'
import { loadTraining, saveTraining } from '../training/store'
import { makeBackup, mergeBackup, type BackupData, type BackupFile } from './backup'

export async function collectData(): Promise<BackupData> {
  const [games, profile, settings, training, badges, currentGame, onboarded] = await Promise.all([
    listGames(),
    loadProfile(),
    loadSettings(),
    loadTraining(),
    loadBadges(),
    loadCurrentGame(),
    getKv('onboarded', false),
  ])
  return { games, profile, settings, training, badges, currentGame, onboarded }
}

export async function exportFile(): Promise<BackupFile> {
  return makeBackup(await collectData())
}

/** Writes an already-validated import. AI settings always stay this browser's own. */
export async function applyImport(incoming: BackupData, mode: 'merge' | 'replace'): Promise<void> {
  const mine = await collectData()
  const next = mode === 'merge' ? mergeBackup(mine, incoming) : { ...incoming, settings: { ...incoming.settings, ai: mine.settings.ai } }
  await replaceGames(next.games)
  await Promise.all([
    saveProfile(next.profile),
    saveSettings(next.settings),
    saveTraining(next.training),
    saveBadges(next.badges),
    saveCurrentGame(next.currentGame),
    setKv('onboarded', next.onboarded),
  ])
}
