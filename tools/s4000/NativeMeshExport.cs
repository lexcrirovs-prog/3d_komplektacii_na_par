// Read-only tessellation through the installed AutoCAD 2027 modeler.
// The drawing transaction is never committed and no drawing is saved.
using System;
using System.IO;
using System.Collections.Generic;
using System.Text.Json;
using Autodesk.AutoCAD.Runtime;
using Autodesk.AutoCAD.DatabaseServices;

public class NativeMeshExport
{
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
