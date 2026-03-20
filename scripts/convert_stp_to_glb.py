#!/usr/bin/env python3
"""
STP → GLB conversion script using FreeCAD headless mode.

Usage:
    freecadcmd convert_stp_to_glb.py --input ./stp/ --output ./public/models/

Requirements:
    - FreeCAD installed (tested with 0.21+)
    - Run via `freecadcmd` or `FreeCADCmd` (headless mode)

The script reads all .stp/.step files from the input directory,
converts them to .glb format with mesh decimation for web use.
"""

import argparse
import os
import sys

def convert_stp_to_glb(input_dir: str, output_dir: str, max_faces: int = 50000):
    """Convert all STP files in input_dir to GLB files in output_dir."""
    try:
        import FreeCAD
        import Part
        import Mesh
        import MeshPart
    except ImportError:
        print("ERROR: This script must be run with FreeCAD's Python interpreter.")
        print("Usage: freecadcmd convert_stp_to_glb.py --input ./stp/ --output ./public/models/")
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    stp_files = [
        f for f in os.listdir(input_dir)
        if f.lower().endswith(('.stp', '.step'))
    ]

    if not stp_files:
        print(f"No STP/STEP files found in {input_dir}")
        return

    print(f"Found {len(stp_files)} STP file(s) to convert")

    for filename in stp_files:
        input_path = os.path.join(input_dir, filename)
        base_name = os.path.splitext(filename)[0]
        # Clean filename for web use
        clean_name = base_name.replace(' ', '_').replace('(', '').replace(')', '')
        output_path = os.path.join(output_dir, f"{clean_name}.glb")

        print(f"\nConverting: {filename}")
        print(f"  Output: {output_path}")

        try:
            # Load the STEP file
            doc = FreeCAD.newDocument("Conversion")
            Part.insert(input_path, doc.Name)

            # Get all shapes
            shapes = []
            for obj in doc.Objects:
                if hasattr(obj, 'Shape') and obj.Shape:
                    shapes.append(obj.Shape)

            if not shapes:
                print(f"  WARNING: No shapes found in {filename}, skipping")
                FreeCAD.closeDocument(doc.Name)
                continue

            # Merge all shapes
            if len(shapes) == 1:
                merged = shapes[0]
            else:
                merged = shapes[0]
                for s in shapes[1:]:
                    merged = merged.fuse(s)

            # Tessellate with quality settings
            # LinearDeflection controls mesh density (smaller = more faces)
            linear_deflection = 0.5  # Start with medium quality
            mesh = MeshPart.meshFromShape(
                Shape=merged,
                LinearDeflection=linear_deflection,
                AngularDeflection=0.5,
                Relative=False
            )

            face_count = mesh.CountFacets
            print(f"  Initial faces: {face_count}")

            # Decimate if too many faces
            if face_count > max_faces:
                reduction = 1.0 - (max_faces / face_count)
                print(f"  Decimating by {reduction:.1%} to target {max_faces} faces")
                mesh.decimate(max_faces)
                print(f"  Final faces: {mesh.CountFacets}")

            # Export as STL first (intermediate), then we need to convert to GLB
            stl_path = os.path.join(output_dir, f"{clean_name}.stl")
            mesh.write(stl_path)
            print(f"  Exported STL: {stl_path}")

            # For GLB conversion, we can use trimesh if available
            try:
                import trimesh
                tmesh = trimesh.load(stl_path)
                tmesh.export(output_path, file_type='glb')
                os.remove(stl_path)  # Clean up intermediate STL
                print(f"  Exported GLB: {output_path}")
            except ImportError:
                print(f"  NOTE: `trimesh` not installed. STL exported instead.")
                print(f"  Install trimesh for GLB: pip install trimesh[easy]")
                print(f"  Then convert manually: trimesh.load('{stl_path}').export('{output_path}')")

            FreeCAD.closeDocument(doc.Name)
            print(f"  Done!")

        except Exception as e:
            print(f"  ERROR converting {filename}: {e}")
            try:
                FreeCAD.closeDocument(doc.Name)
            except Exception:
                pass

    print(f"\nConversion complete. Output directory: {output_dir}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Convert STP/STEP files to GLB for web 3D viewer'
    )
    parser.add_argument(
        '--input', '-i',
        default='./stp/',
        help='Input directory with STP files (default: ./stp/)'
    )
    parser.add_argument(
        '--output', '-o',
        default='./public/models/',
        help='Output directory for GLB files (default: ./public/models/)'
    )
    parser.add_argument(
        '--max-faces',
        type=int,
        default=50000,
        help='Maximum faces per model after decimation (default: 50000)'
    )

    args = parser.parse_args()
    convert_stp_to_glb(args.input, args.output, args.max_faces)
