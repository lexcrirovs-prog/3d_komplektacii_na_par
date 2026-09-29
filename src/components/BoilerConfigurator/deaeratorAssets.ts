import da3 from '../../assets/deaerators/da3.glb?url'
import da15_4 from '../../assets/deaerators/da15_4.glb?url'
import da15_8 from '../../assets/deaerators/da15_8.glb?url'
import da25_15 from '../../assets/deaerators/da25_15.glb?url'
import da25_25 from '../../assets/deaerators/da25_25.glb?url'
import type {DeaeratorKind} from './deaeratorSelection'

// Only the selected vessel is fetched. Geometry is shared by repeated boilers.
export const deaeratorAssets:Record<DeaeratorKind,string>={da3,da15_4,da15_8,da25_15,da25_25}
