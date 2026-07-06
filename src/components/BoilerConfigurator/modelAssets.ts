// Единый источник URL всех GLB-моделей + русские подписи для экрана загрузки.
// Модели оптимизированы (meshopt), см. npm run models:optimize.
import boilerGlb from '../../assets/boiler.glb?url'
import deaeratorGlb from '../../assets/deaerator.glb?url'
import elbowPcF20Glb from '../../assets/elbow_pc_f20.glb?url'
import bcv7250Glb from '../../assets/bcv_7250.glb?url'
import bcv925Glb from '../../assets/bcv_925.glb?url'
import cp930Glb from '../../assets/cp_930.glb?url'
import dn32h50Glb from '../../assets/dn32h50.glb?url'

export const BOILER_URL = boilerGlb

/** Все GLB (ключ — имя модели в modelRegistry) для фонового префетча */
export const MODEL_URLS: Record<string, string> = {
  boiler: boilerGlb,
  deaerator: deaeratorGlb,
  elbow_pc_f20: elbowPcF20Glb,
  bcv_7250: bcv7250Glb,
  bcv_925: bcv925Glb,
  cp_930: cp930Glb,
  dn32h50: dn32h50Glb,
}

/** Подписи для экрана загрузки (ключ — URL ассета, как его отдаёт useProgress) */
export const MODEL_LABELS_RU: Record<string, string> = {
  [boilerGlb]: 'корпус котла',
  [deaeratorGlb]: 'деаэратор',
  [elbowPcF20Glb]: 'колено продувки',
  [bcv7250Glb]: 'продувочный клапан',
  [bcv925Glb]: 'клапан BCV 925',
  [cp930Glb]: 'охладитель проб',
  [dn32h50Glb]: 'переход DN32',
}
