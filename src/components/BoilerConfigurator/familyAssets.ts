import largeData from '../../assets/s4000/web/assembly.json'
import largeOpening from '../../assets/s4000/web/opening.json'
import large0 from '../../assets/s4000/web/s4000-0.glb?url'
import large1 from '../../assets/s4000/web/s4000-1.glb?url'
import large2 from '../../assets/s4000/web/s4000-2.glb?url'
import large3 from '../../assets/s4000/web/s4000-3.glb?url'
import large4 from '../../assets/s4000/web/s4000-4.glb?url'
import large5 from '../../assets/s4000/web/s4000-5.glb?url'
import large6 from '../../assets/s4000/web/s4000-6.glb?url'
import large7 from '../../assets/s4000/web/s4000-7.glb?url'
import smallData from '../../assets/families/small/assembly.json'
import smallOpening from '../../assets/families/small/opening.json'
import small0 from '../../assets/families/small/s4000-0.glb?url'
import small1 from '../../assets/families/small/s4000-1.glb?url'
import small2 from '../../assets/families/small/s4000-2.glb?url'
import small3 from '../../assets/families/small/s4000-3.glb?url'
import small4 from '../../assets/families/small/s4000-4.glb?url'
import small5 from '../../assets/families/small/s4000-5.glb?url'
import small6 from '../../assets/families/small/s4000-6.glb?url'
import small7 from '../../assets/families/small/s4000-7.glb?url'
import mediumData from '../../assets/families/medium/assembly.json'
import mediumOpening from '../../assets/families/medium/opening.json'
import medium0 from '../../assets/families/medium/s4000-0.glb?url'
import medium1 from '../../assets/families/medium/s4000-1.glb?url'
import medium2 from '../../assets/families/medium/s4000-2.glb?url'
import medium3 from '../../assets/families/medium/s4000-3.glb?url'
import medium4 from '../../assets/families/medium/s4000-4.glb?url'
import medium5 from '../../assets/families/medium/s4000-5.glb?url'
import medium6 from '../../assets/families/medium/s4000-6.glb?url'
import medium7 from '../../assets/families/medium/s4000-7.glb?url'
import trim from '../../assets/s4000/web/trim.glb?url'
import type {VisibilityPart} from './assemblyVisibility'
export type FamilyPart=VisibilityPart & {id:string;label:string;category:string;note:string;center:number[]}
export type FamilyAsset={id:string;model:string;range:string;parts:FamilyPart[];opening:{groups:{id:string;pivot:number[];angle_degrees:number;parts:string[]}[]};urls:string[];tubeCount:number|null}
export const familyAssets:Record<string,FamilyAsset>={
large: {id:'large', model:'S-4000', range:'4000–5000', parts:largeData.parts, opening:largeOpening, urls:[large0,large1,large2,large3,large4,large5,large6,large7,trim], tubeCount:96},
small: {id:'small', model:'S-1000', range:'500–1500', parts:smallData.parts, opening:smallOpening, urls:[small0,small1,small2,small3,small4,small5,small6,small7], tubeCount:null},
medium: {id:'medium', model:'S-3000', range:'2000–3000', parts:mediumData.parts, opening:mediumOpening, urls:[medium0,medium1,medium2,medium3,medium4,medium5,medium6,medium7], tubeCount:80},
}
