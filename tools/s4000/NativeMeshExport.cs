// Native AutoCAD 2027 tessellation and explicitly scoped in-place amendments.
// S4000EXPORTMESH is read-only. S4000APPLYVIDEO changes reviewed blocks;
// the caller saves through the document command after this command returns.
using System;
using System.IO;
using System.Collections.Generic;
using System.Text.Json;
using Autodesk.AutoCAD.Runtime;
using Autodesk.AutoCAD.DatabaseServices;

public class NativeMeshExport
{
    // Explicit owner-authorized in-place review. No replacement drawing is opened.
    // Clone only reviewed block contents; retain every existing block reference,
    // pose, option state, user-added object and named view in the active drawing.
    [CommandMethod("S4000APPLYVIDEO")]
    public static void ApplyVideoReview()
    {
        var db=HostApplicationServices.WorkingDatabase;
        const string folder=@"E:\CodexArtifacts\S4000-AutoCAD-v2026.09.11.1";
        var current=Path.GetFullPath(db.Filename);
        var allowedClosed=Path.Combine(folder,"AutoCAD","S4000_COMFORT_8-12bar_v2026.09.11.1.dwg");
        var allowedOpen=Path.Combine(folder,"AutoCAD","S4000_COMFORT_8-12bar_OPEN_v2026.09.11.1.dwg");
        if(!current.Equals(allowedClosed,StringComparison.OrdinalIgnoreCase)&&!current.Equals(allowedOpen,StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Only the two existing owner-selected S4000 drawings can be amended.");
        using var spec=JsonDocument.Parse(File.ReadAllText(Path.Combine(folder,"assembly.json")));
        var keys=new HashSet<string>();
        foreach(var p in spec.RootElement.GetProperty("video_review").GetProperty("changed_parts").EnumerateArray())keys.Add("S4000_"+p.GetString());
        var existing=new Dictionary<string,ObjectId>();
        var poses=new Dictionary<ObjectId,Autodesk.AutoCAD.Geometry.Matrix3d>();
        using(var tr=db.TransactionManager.StartTransaction()) {
            var bt=(BlockTable)tr.GetObject(db.BlockTableId,OpenMode.ForRead);
            foreach(var key in keys) { if(!bt.Has(key))throw new InvalidOperationException("Missing reviewed block "+key);existing[key]=bt[key]; }
            var ms=(BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace],OpenMode.ForRead);
            foreach(ObjectId id in ms)if(tr.GetObject(id,OpenMode.ForRead) is BlockReference br)poses[id]=br.BlockTransform;
        }
        using var src=new Database(false,true);
        src.DxfIn(Path.Combine(folder,"AutoCAD","S4000_COMFORT_8-12bar_v2026.09.11.1.dxf"),null);
        var proof=new List<object>();
        using(var sourceTx=src.TransactionManager.StartTransaction())
        using(var tx=db.TransactionManager.StartTransaction()) {
            var sourceTable=(BlockTable)sourceTx.GetObject(src.BlockTableId,OpenMode.ForRead);
            // Preflight every incoming definition before the first mutation.
            foreach(var key in keys)if(key!="S4000_flash_return_marker"&&!sourceTable.Has(key))throw new InvalidOperationException("Missing incoming block "+key);
            foreach(var key in keys) {
                var dest=(BlockTableRecord)tx.GetObject(existing[key],OpenMode.ForWrite);
                foreach(ObjectId id in dest)((Entity)tx.GetObject(id,OpenMode.ForWrite)).Erase();
                if(key=="S4000_flash_return_marker") {
                    foreach(ObjectId id in dest.GetBlockReferenceIds(true,false))((Entity)tx.GetObject(id,OpenMode.ForWrite)).Erase();
                    proof.Add(new {part=key,removed=true});continue;
                }
                var sourceBlock=(BlockTableRecord)sourceTx.GetObject(sourceTable[key],OpenMode.ForRead);
                var ids=new ObjectIdCollection();foreach(ObjectId id in sourceBlock)ids.Add(id);
                var map=new IdMapping();src.WblockCloneObjects(ids,dest.ObjectId,map,DuplicateRecordCloning.Ignore,false);
                int n=0,vertices=0,faces=0;
                foreach(ObjectId id in dest)if(!id.IsErased&&tx.GetObject(id,OpenMode.ForRead)is SubDMesh mesh){n++;vertices+=mesh.Vertices.Count;faces+=mesh.NumberOfFaces;}
                if(n==0)throw new InvalidOperationException("Empty replacement "+key);
                proof.Add(new {part=key,meshes=n,vertices=vertices,faces=faces});
            }
            var layers=(LayerTable)tx.GetObject(db.LayerTableId,OpenMode.ForRead);
            var sharedInlet=(LayerTableRecord)tx.GetObject(layers["S4000_direct_inlet"],OpenMode.ForWrite);
            sharedInlet.IsFrozen=false;sharedInlet.IsOff=false;
            foreach(var item in poses) {
                if(item.Key.IsErased)continue;
                var br=(BlockReference)tx.GetObject(item.Key,OpenMode.ForWrite);
                if(!br.BlockTransform.IsEqualTo(item.Value))throw new InvalidOperationException("Existing block pose changed");
                br.RecordGraphicsModified(true);
            }
            tx.Commit();
        }
        var receipt=Path.ChangeExtension(current,".verification.json");
        if(!File.Exists(receipt)&&current==allowedOpen)receipt=Path.Combine(folder,"AutoCAD","doors-verification.json");
        if(!File.Exists(receipt))throw new InvalidOperationException("Existing receipt required");
        File.WriteAllText(receipt,JsonSerializer.Serialize(new {status="UPDATED_IN_PLACE_PENDING_SAVE",date="2026-09-11",author="Codex / GPT-6 Astra",file=Path.GetFileName(current),reviewed=proof,existing_block_poses_preserved=poses.Count,units="mm",pending_independent_reopen=true}));
    }
    // Independent saved-DWG check. Compare all delivered mesh definitions with
    // the retained Blender export; door poses are tested by the native controls.
    [CommandMethod("S4000VERIFYVIDEO")]
    public static void VerifyVideoReview()
    {
        var db=HostApplicationServices.WorkingDatabase;
        var current=Path.GetFullPath(db.Filename);
        const string folder=@"E:\CodexArtifacts\S4000-AutoCAD-v2026.09.11.1";
        if(!Path.GetDirectoryName(current).Equals(Path.Combine(folder,"AutoCAD"),StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Unexpected drawing folder");
        using var spec=JsonDocument.Parse(File.ReadAllText(Path.Combine(folder,"assembly.json")));
        using var src=new Database(false,true);
        src.DxfIn(Path.Combine(folder,"AutoCAD","S4000_COMFORT_8-12bar_v2026.09.11.1.dxf"),null);
        using var actualTx=db.TransactionManager.StartTransaction();
        using var sourceTx=src.TransactionManager.StartTransaction();
        var at=(BlockTable)actualTx.GetObject(db.BlockTableId,OpenMode.ForRead);
        var st=(BlockTable)sourceTx.GetObject(src.BlockTableId,OpenMode.ForRead);
        int blocks=0,meshes=0,vertices=0,faces=0,reversals=0,references=0;
        double maximumError=0;
        foreach(var p in spec.RootElement.GetProperty("parts").EnumerateArray()) {
            var name="S4000_"+p.GetProperty("id").GetString();
            var a=(BlockTableRecord)actualTx.GetObject(at[name],OpenMode.ForRead);
            var s=(BlockTableRecord)sourceTx.GetObject(st[name],OpenMode.ForRead);
            var am=new List<SubDMesh>();var sm=new List<SubDMesh>();
            foreach(ObjectId id in a)if(!id.IsErased)am.Add((SubDMesh)actualTx.GetObject(id,OpenMode.ForRead));
            foreach(ObjectId id in s)sm.Add((SubDMesh)sourceTx.GetObject(id,OpenMode.ForRead));
            if(am.Count!=sm.Count)throw new InvalidOperationException(name+" mesh count");
            for(int n=0;n<am.Count;n++) {
                var av=am[n].Vertices;var sv=sm[n].Vertices;
                if(av.Count!=sv.Count)throw new InvalidOperationException(name+" vertex count");
                for(int i=0;i<av.Count;i++)maximumError=Math.Max(maximumError,av[i].DistanceTo(sv[i]));
                if(maximumError>0.001)throw new InvalidOperationException(name+" coordinates");
                var af=am[n].FaceArray;var sf=sm[n].FaceArray;
                if(af.Count!=sf.Count)throw new InvalidOperationException(name+" topology length");
                bool direct=true,reverse=true;
                for(int i=0;i<sf.Count;) {
                    int count=sf[i];if(af[i]!=count)throw new InvalidOperationException(name+" face arity");i++;
                    for(int j=0;j<count;j++){direct&=af[i+j]==sf[i+j];reverse&=af[i+j]==sf[i+count-1-j];}i+=count;
                }
                if(!direct&&!reverse)throw new InvalidOperationException(name+" topology");
                if(!direct)reversals++;
                var ac=am[n].Color;var sc=sm[n].Color;
                if(ac.Red!=sc.Red||ac.Green!=sc.Green||ac.Blue!=sc.Blue)throw new InvalidOperationException(name+" color");
                meshes++;vertices+=av.Count;faces+=am[n].NumberOfFaces;
            }
            blocks++;
        }
        var model=(BlockTableRecord)actualTx.GetObject(at[BlockTableRecord.ModelSpace],OpenMode.ForRead);
        foreach(ObjectId id in model)if(actualTx.GetObject(id,OpenMode.ForRead)is BlockReference b){
            if(b.Name=="S4000_flash_return_marker")throw new InvalidOperationException("Removed FV line marker still referenced");references++;
        }
        if(references!=blocks||db.Insunits!=UnitsValue.Millimeters)throw new InvalidOperationException("References or units");
        var receipt=Path.ChangeExtension(current,".verification.json");
        if(!File.Exists(receipt))receipt=Path.Combine(folder,"AutoCAD","doors-verification.json");
        File.WriteAllText(receipt,JsonSerializer.Serialize(new {status="PASSED_NATIVE_INDEPENDENT_REOPEN",version="2026.09.11.1",date="2026-09-11",author="Codex / GPT-6 Astra",file=Path.GetFileName(current),blocks,meshes,vertices,faces,whole_mesh_reversals=reversals,maximum_coordinate_error_mm=maximumError,colours_preserved=true,topology_preserved=true,units="mm",fv_safety_dn=25,read_only_verification=true}));
    }
    [CommandMethod("S4000EXPORTMESH")]
    public static void Export()
    {
        var db = HostApplicationServices.WorkingDatabase;
        var rows = new List<object>();
        using (var transaction = db.TransactionManager.StartTransaction())
        {
            var table = (BlockTable)transaction.GetObject(db.BlockTableId, OpenMode.ForRead);
            var model = (BlockTableRecord)transaction.GetObject(table[BlockTableRecord.ModelSpace], OpenMode.ForRead);
            foreach (ObjectId id in model)
            {
                var entity = transaction.GetObject(id, OpenMode.ForRead) as Entity;
                if (entity is not Solid3d) continue;
                var settings = new MeshFaceterData();
                settings.FaceterDevSurface = 0.1;
                settings.FaceterDevNormal = 6.0;
                settings.FaceterMeshType = 2;
                var data = SubDMesh.GetObjectMesh(entity, settings);
                var vertices = new List<double[]>();
                foreach (Autodesk.AutoCAD.Geometry.Point3d v in data.VertexArray)
                    vertices.Add(new double[] { v.X, v.Y, v.Z });
                var triangles = new List<int[]>();
                var faces = data.FaceArray;
                for (int i = 0; i < faces.Count;)
                {
                    int count = faces[i++];
                    for (int j = 1; j < count - 1; j++)
                        triangles.Add(new int[] { faces[i], faces[i+j], faces[i+j+1] });
                    i += count;
                }
                var ext = entity.GeometricExtents;
                rows.Add(new { id=rows.Count, vertices, triangles,
                    bounds=new double[] { ext.MinPoint.X, ext.MinPoint.Y, ext.MinPoint.Z,
                                          ext.MaxPoint.X, ext.MaxPoint.Y, ext.MaxPoint.Z } });
            }
        }
        if (rows.Count != 1) throw new InvalidOperationException("Expected one supplied valve solid");
        File.WriteAllText(Path.Combine(Path.GetDirectoryName(db.Filename), "native-mesh.json"),
            JsonSerializer.Serialize(new { source=Path.GetFileName(db.Filename), units="mm", solids=rows }));
    }
}
