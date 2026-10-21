// Local derivative for Blender 3.3, which cannot import EXT_meshopt_compression.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const require=createRequire(resolve(process.env.S3000_GLTF_RUNTIME,'package.json'));
const from=async n=>import(pathToFileURL(require.resolve(n)).href);
const {NodeIO}=await from('@gltf-transform/core');
const {ALL_EXTENSIONS}=await from('@gltf-transform/extensions');
const {MeshoptDecoder}=await from('meshoptimizer');
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const [source,target]=process.argv.slice(2);
const doc=await io.read(source);
for(const extension of doc.getRoot().listExtensionsUsed())if(extension.extensionName==='EXT_meshopt_compression')extension.dispose();
await io.write(target,doc);
console.log(target);
