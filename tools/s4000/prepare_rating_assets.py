"""Publish only the selected general drawings, preserving original bytes."""
from pathlib import Path
import json,shutil,hashlib
ROOT=Path(r'E:\CodexArtifacts\Boiler-Family-v2026.09.13.2')
models=json.loads((ROOT/'registration.json').read_text('utf8'))['models']
lines=[];rows=[];drawings=[]
for m in models:
 p=m['power'];out=Path(f'src/assets/ratings/{p}');out.mkdir(parents=True,exist_ok=True)
 src=Path(m['boiler_source']);dest=out/f'S-{p}.stp';shutil.copyfile(src,dest)
 assert hashlib.sha256(dest.read_bytes()).hexdigest()==m['boiler_sha256']
 drawings.append(dict(power=p,file=str(dest),sha256=m['boiler_sha256']))
 lines += [f"import d{p} from '../../assets/ratings/{p}/assembly.json'",f"import o{p} from '../../assets/ratings/{p}/opening.json'",f"import step{p} from '../../assets/ratings/{p}/S-{p}.stp?url'"]
 for i in range(8):lines.append(f"import a{p}_{i} from '../../assets/ratings/{p}/s4000-{i}.glb?url'")
 pdf='undefined'
 if p>=1500:
  files=sorted((ROOT/'sources/economizers').rglob(f'PR.{p}.03.001ГЧ*.pdf'));assert files,p
  dest=out/f'EQS2-{p}.pdf';shutil.copyfile(files[0],dest)
  drawings.append(dict(power=p,file=str(dest),sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),source=str(files[0])))
  lines.append(f"import pdf{p} from '../../assets/ratings/{p}/EQS2-{p}.pdf?url'");pdf=f'pdf{p}'
 rows.append(f"{p}: {{id:'{p}',model:'S-{p}',range:'{p}',parts:d{p}.parts,opening:o{p},urls:["+','.join(f'a{p}_{i}' for i in range(8))+f"],tubeCount:{96 if p==4000 else 'null'},boilerDrawing:step{p},economizerDrawing:{pdf}}}")
lines += ["import type {VisibilityPart} from './assemblyVisibility'","export type FamilyPart=VisibilityPart & {id:string;label:string;category:string;note:string;center:number[]}","export type FamilyAsset={id:string;model:string;range:string;parts:FamilyPart[];opening:{groups:{id:string;pivot:number[];angle_degrees:number;parts:string[]}[]};urls:string[];tubeCount:number|null;boilerDrawing:string;economizerDrawing?:string}","export const familyAssets:Record<number,FamilyAsset>={",',\n'.join(rows),'}']
Path('src/components/BoilerConfigurator/familyAssets.ts').write_text('\n'.join(lines)+'\n',encoding='utf8')
(ROOT/'drawings.json').write_text(json.dumps(drawings,ensure_ascii=False,indent=2),encoding='utf8')
