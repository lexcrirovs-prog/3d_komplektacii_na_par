// AutoCAD 2027 / .NET 10. Read-only export of the supplied A31 SURFACE.
// Load only in a private read-only DWG copy, then run S4SURFACEMESH.
// Coordinates remain in drawing units. The caller validates physical units.
using System;
using System.IO;
using System.Collections.Generic;
using System.Text.Json;
using Autodesk.AutoCAD.Runtime;
using Autodesk.AutoCAD.DatabaseServices;

public class SurfaceMeshExport
{
    [CommandMethod("S4SURFACEMESH")]
    public static void Export()
    {
        var db = HostApplicationServices.WorkingDatabase;
        var output = Path.Combine(Path.GetDirectoryName(db.Filename), "flat-mesh.json");
        if (File.Exists(output)) throw new InvalidOperationException("Use a fresh output folder");
        var rows = new List<object>();
        using (var tr = db.TransactionManager.StartTransaction())
        {
            var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
            var ms = (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForRead);
            foreach (ObjectId id in ms)
            {
                var entity = tr.GetObject(id, OpenMode.ForRead) as Entity;
                if (!(entity is Surface))
                    throw new InvalidOperationException("This exporter expects flat ModelSpace SURFACEs");
                var settings = new MeshFaceterData();
                settings.FaceterDevSurface = .1;
                settings.FaceterDevNormal = 6.0;
                settings.FaceterMeshType = 2;
                var data = SubDMesh.GetObjectMesh(entity, settings);
                var vertices = new List<double[]>();
                foreach (Autodesk.AutoCAD.Geometry.Point3d v in data.VertexArray)
                    vertices.Add(new double[] { v.X, v.Y, v.Z });
                var triangles = new List<int[]>();
                var f = data.FaceArray;
                for (int i = 0; i < f.Count;)
                {
                    int n = f[i++];
                    for (int j = 1; j < n - 1; j++)
                        triangles.Add(new int[] { f[i], f[i+j], f[i+j+1] });
                    i += n;
                }
                rows.Add(new { id = rows.Count, vertices, triangles });
            }
        }
        File.WriteAllText(output, JsonSerializer.Serialize(new { solids = rows, units = "raw_drawing_units" }));
    }
}
