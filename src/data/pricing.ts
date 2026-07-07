/**
 * Ориентировочные цены для блока «стоимость сборки» в конфигураторе.
 * Источник базовых цен: boilersConfig.js калькулятора kotelpremium.ru/calc.
 * Наценки комплектаций: Комфорт +2,5% (лендинг: «+2–3%»), Комфорт+ +8% — ориентир.
 * ⚠ При изменении цен на заводе обновить и здесь, и в reconstruction_site/shared/data.js.
 */
import type { ConfigKey, AddonKey } from '../hooks/useConfigurator'

export interface SteamModel {
  id: string
  name: string
  maxSteam: number
  price: number
  economizerPrice?: number
}

export const STEAM_MODELS: SteamModel[] = [
  { id: 's500', name: 'PREMIUM S-500', maxSteam: 500, price: 1864570 },
  { id: 's1000', name: 'PREMIUM S-1000', maxSteam: 1000, price: 2833410 },
  { id: 's1500', name: 'PREMIUM S-1500', maxSteam: 1500, price: 3100600, economizerPrice: 1000000 },
  { id: 's2000', name: 'PREMIUM S-2000', maxSteam: 2000, price: 3455323, economizerPrice: 1245000 },
  { id: 's2500', name: 'PREMIUM S-2500', maxSteam: 2500, price: 3629127, economizerPrice: 1450000 },
  { id: 's3000', name: 'PREMIUM S-3000', maxSteam: 3000, price: 4217792, economizerPrice: 1600000 },
  { id: 's3500', name: 'PREMIUM S-3500', maxSteam: 3500, price: 5079409, economizerPrice: 1800000 },
  { id: 's4000', name: 'PREMIUM S-4000', maxSteam: 4000, price: 5760302, economizerPrice: 1951000 },
  { id: 's5000', name: 'PREMIUM S-5000', maxSteam: 5000, price: 6739180, economizerPrice: 2250000 },
]

/** Типовой размер для прямых заходов без ?model= */
export const DEFAULT_MODEL_ID = 's2000'

export const KIT_MULTIPLIERS: Record<ConfigKey, number> = {
  standard: 1.0,
  comfort: 1.025,
  comfort_plus: 1.08,
}

export const DAYS_TO_LAUNCH = 60

export function getModel(id: string | null | undefined): SteamModel {
  return STEAM_MODELS.find((m) => m.id === id) ?? STEAM_MODELS.find((m) => m.id === DEFAULT_MODEL_ID)!
}

export interface PriceEstimate {
  model: SteamModel
  /** Котёл в выбранной комплектации, ₽ */
  boilerWithKit: number
  /** Сумма с опциями, у которых известна цена, ₽ */
  total: number
  /** Опции без прайса — подбираются индивидуально */
  onRequest: string[]
}

export function estimate(modelId: string | null, config: ConfigKey, addons: Set<AddonKey>): PriceEstimate {
  const model = getModel(modelId)
  const boilerWithKit = Math.round(model.price * KIT_MULTIPLIERS[config])
  let total = boilerWithKit
  const onRequest: string[] = []

  if (addons.has('economizer')) {
    if (model.economizerPrice) total += model.economizerPrice
    else onRequest.push('экономайзер')
  }
  if (addons.has('deaerator')) onRequest.push('деаэратор')
  if (addons.has('burner')) onRequest.push('горелка')

  return { model, boilerWithKit, total, onRequest }
}

export function fmtMln(rub: number): string {
  const mln = Math.round(rub / 1e4) / 100
  return mln.toLocaleString('ru-RU') + ' млн ₽'
}
