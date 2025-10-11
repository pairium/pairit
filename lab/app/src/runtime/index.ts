import type { CompiledConfig } from './config'

import { getConfig, registerConfig } from './config'
import { normalizeConfig } from './normalizer'

export async function loadConfig(configId: string): Promise<CompiledConfig | null> {
  const cached = getConfig(configId)
  if (cached) return cached

  try {
    const response = await fetch(`/configs/${configId}.json`)
    if (!response.ok) return null
    const raw = (await response.json()) as unknown
    const normalized = normalizeConfig(raw)
    if (!normalized) return null
    registerConfig(configId, normalized)
    return normalized
  } catch (error) {
    console.error('Failed to load config', error)
    return null
  }
}

