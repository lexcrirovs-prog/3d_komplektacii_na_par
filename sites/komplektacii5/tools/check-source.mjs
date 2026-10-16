// Stop a release if an unrelated update changes the agreed factory baseline.
import {execFileSync} from 'node:child_process'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..')
execFileSync('git',['-C',root,'diff','--quiet','cc919366206eb317e7f21e90247ed1870cb276cd','--','src/assets','src/components/BoilerConfigurator'],{stdio:'inherit'})
console.log('Factory source baseline cc919366 verified')
