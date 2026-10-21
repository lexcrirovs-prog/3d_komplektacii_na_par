"""Extract relief-valve mounting faces from verified CAD conversion metadata.

20.10.2026, Codex / GPT-6. Reads CAD derivatives and writes an evidence JSON.
Does not change source CAD, GLB files, or the application catalog.

C/CLA nozzle roles are supported by the C manual's longitudinal section,
position 5, and checked against the general drawing and unique assembly code.
Legacy E general drawings explicitly label the two relief nozzles.
New E and E Long STEP assembly names explicitly identify the relief nozzles.
"""
import argparse
import hashlib
import json
import math
import re
import struct
from pathlib import Path


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def documented_nozzle(model):
    """Use individually documented assembly codes, never smallest-DN guessing."""
    family, power = model["family"], model["powerKw"]
    if family == "cla":
        codes = {250: "007", 500: "004", 750: "004", 1000: "002", 1250: "002",
                 1500: "002", 1750: "002", 2000: "002", 2500: "002", 3000: "002",
                 3500: "002", 4000: "002", 5000: "038", 6000: "038"}
        code = "031" if model["id"] == "cla-3000-51-dn150" else codes[power]
        return rf"^PR\.400\.01\.{code}СБ Штуцер:\d+$", 1
    if family == "e":
        code = {2500: "034", 3500: "034", 4000: "034", 5000: "025", 6000: "025", 7000: "029"}[power]
        return rf"^PR\.400\.01\.{code}СБ Штуцер:\d+$", 2
    if family == "e-single":
        code = {1000: "002", 1500: "002", 2000: "012", 2500: "012", 3000: "012",
                3500: "012", 4000: "014", 5000: "014"}[power]
        return rf"^PR\.400\.01\.01\.{code} СБ Штуцер предохранительного клапана:\d+$", 2
    if family == "e-long" and model["id"] == "e-long-3500-20260609-06":
        return r"^PR\.400\.01\.01\.005 СБ Штуцер предохранительного клапана:\d+$", 2
    raise ValueError("Unsupported model family: " + family)


def node_paths(gltf):
    parents = {}
    for index, node in enumerate(gltf["nodes"]):
        for child in node.get("children", []):
            if child in parents:
                raise ValueError("Shared node has ambiguous assembly path")
            parents[child] = index
    result = {}
    for index, node in enumerate(gltf["nodes"]):
        path = [node.get("name", "")]
        current = index
        while current in parents:
            current = parents[current]
            path.append(gltf["nodes"][current].get("name", ""))
        result.setdefault(tuple(reversed(path)), []).append(index)
    return result


def source_evidence(model):
    family = model["family"]
    if family == "cla":
        return {
            "identification": "manual-position-5-and-CAD-nozzle-code",
            "documents": [{
                "relativePath": "6. котлы Premium CLA/2. Котлы CLA на шовной трубе 51/11. PREMIUM-CLA-3500/PR.3500.01.001 РЭ Руководство по монтажу и эксплуатации.pdf",
                "pages": [6, 7],
                "proof": "Upper single relief-valve nozzle; longitudinal section position 5 lies between inlet and outlet nozzles.",
            }],
            "scope": "Family manual role plus exact per-model assembly code, native flange name and geometry; not a valve capacity selection.",
        }
    if family == "e":
        power = model["powerKw"]
        folder = "Чнртежи PDF" if power == 3500 else "Чертежи PDF"
        return {
            "identification": "general-drawing-relief-nozzle-label-and-CAD-code",
            "documents": [{
                "relativePath": f"3. котлы водогрейные трехходовые Premium E (Long)/PREMIUM-E-{power}/PREMIUM-E-{power} (от 10.07.2025)/{folder}/PR.{power}.01.001(Е)СБ Общий вид.pdf",
                "pages": [1],
                "proof": "General drawing labels two upper nozzles 'Предохранительные клапана', with DN and PN matching the source flange names.",
            }],
        }
    return {
        "identification": "explicit-source-assembly-name",
        "proof": "Two STEP assemblies explicitly named 'Штуцер предохранительного клапана', each containing its pipe and native flange.",
    }


def inspect(model, metadata, gltf):
    if metadata["sourceSha256"] != model["sourceSha256"]:
        raise ValueError("Source SHA mismatch: " + model["id"])
    if metadata["sourceUpAxis"] != "y" or metadata["units"] != "metres":
        raise ValueError("Unexpected coordinate convention: " + model["id"])
    pattern, expected = documented_nozzle(model)
    groups = {}
    for part in metadata["parts"]:
        for index, name in enumerate(part["path"]):
            if re.fullmatch(pattern, name):
                groups.setdefault(tuple(part["path"][:index+1]), []).append(part)
                break
    if len(groups) != expected:
        raise ValueError(f"{model['id']}: expected {expected} documented relief nozzles, found {len(groups)}")
    paths = node_paths(gltf)
    mounts = []
    for path, parts in groups.items():
        solids = [p for p in parts if p["name"] == "SOLID" and
                  any(re.match(r"^Фланец 1 ГОСТ 12820-80 ", name) for name in p["path"])]
        if len(solids) != 1:
            raise ValueError(f"{model['id']}: ambiguous native flange solid in {path[-1]}")
        solid = solids[0]
        matrix, bounds = solid["matrixWorld"], solid["localBounds"]
        # Native standard flange is modelled from local X=0 into +X.
        # Its world local-X axis points downward, so X=0 is its upper mating face.
        if abs(bounds[0]) > 1e-6 or not 0.005 < bounds[3] < 0.1:
            raise ValueError(f"{model['id']}: native flange face convention changed")
        axis = [-matrix[i] for i in (0, 1, 2)]
        if math.dist(axis, [0, 1, 0]) > 1e-6:
            raise ValueError(f"{model['id']}: relief flange is not vertical/upward")
        position = matrix[12:15]
        if abs(position[1] - solid["bounds"][4]) > 1e-6:
            raise ValueError(f"{model['id']}: flange origin is not its upper face")
        indices = paths.get(path, [])
        if len(indices) != 1:
            raise ValueError(f"{model['id']}: compressed GLB lost unique source nozzle path")
        node = gltf["nodes"][indices[0]]
        occurrence = node.get("extras", {}).get("occurrenceLabel")
        if not occurrence:
            raise ValueError(f"{model['id']}: missing stable occurrence label")
        flange = next(name for name in solid["path"] if name.startswith("Фланец 1 ГОСТ 12820-80 "))
        connection = re.search(r"12820-80 (\d+)(?:\([^)]+\))?-(\d+)", flange)
        if not connection:
            raise ValueError(f"{model['id']}: cannot read source flange DN/PN")
        mounts.append({
            "position": [round(v, 8) for v in position],
            "axis": [0, 1, 0],
            "outletDirection": [-1, 0, 0],
            "outletDirectionBasis": "Display choice only; boiler source does not specify downstream relief-pipe routing.",
            "sourceNode": "occurrence:" + occurrence,
            "label": "Патрубок предохранительного клапана",
            "sourceName": path[-1],
            "sourcePath": list(path),
            "sourceFlangeName": flange,
            "connectionType": "flange",
            "sourceFlangeDN": int(connection[1]),
            "sourceFlangePN": int(connection[2]),
            "positionBasis": "Native flange local X=0 mating plane transformed by original CAD matrixWorld; not triangulated bbox centre.",
        })
    mounts.sort(key=lambda point: point["position"][2])
    for index, mount in enumerate(mounts):
        mount["label"] += f" {index+1}" if len(mounts) > 1 else ""
    return {
        "id": model["id"], "family": model["family"], "sourceSha256": model["sourceSha256"],
        "assetSha256": model["assetSha256"], "mountCount": len(mounts), "mounts": mounts,
        "evidence": source_evidence(model),
    }


def main():
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=root/"src/assets/hotwater/catalog.json")
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    catalog = read_json(args.catalog)
    records = []
    for model in catalog["models"]:
        asset = args.catalog.parent/model["asset"]
        if digest(asset) != model["assetSha256"]:
            raise ValueError("Catalog asset SHA mismatch: " + model["id"])
        blob = asset.read_bytes()
        size, kind = struct.unpack_from("<II", blob, 12)
        if kind != 0x4e4f534a:
            raise ValueError("First GLB chunk is not JSON")
        gltf = json.loads(blob[20:20+size])
        metadata = read_json(args.metadata/(model["id"]+".metadata.json"))
        record = inspect(model, metadata, gltf)
        records.append(record)
        print(model["id"], record["mountCount"], "verified", flush=True)
    report = {
        "version": "2026.10.20", "executor": "Codex / GPT-6",
        "status": "SOURCE_MOUNTING_FACES_VERIFIED",
        "coordinates": "Original model GLB coordinates, metres, Y-up; apply the viewer's model-root translation afterward.",
        "models": records, "modelCount": len(records), "mountCount": sum(r["mountCount"] for r in records),
        "limits": [
            "Mount counts are existing CAD attachment nozzles, not an independent safety-valve capacity or quantity calculation.",
            "Flange DN/PN are copied from native source part names; they do not establish compatibility of the illustrative valve.",
            "Existing illustrative valve has a DN40-size inlet. Other source flange sizes require separately selected geometry or explicit visual-fit treatment.",
            "Outlet direction is an explicit display choice, not a source-documented discharge route.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(json.dumps({"models": report["modelCount"], "mounts": report["mountCount"], "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
