"""Project-local Blender MCP. No network listener, telemetry, or asset services.

Run: uv run --with mcp==1.26.0 scripts/art/blender_mcp.py
Only the checked-in builder can be executed; open Blender sessions are untouched.
"""
import json
import shutil
import subprocess
from pathlib import Path
from mcp.server.fastmcp import FastMCP

ROOT = Path(__file__).resolve().parents[2]
mcp = FastMCP("Pongapp Blender tiny-world studio")

@mcp.tool()
def inspect_tiny_world_assets() -> dict:
    """Inspect installed Blender and the generated tiny-world asset manifest."""
    blender = shutil.which("blender") or "/opt/homebrew/bin/blender"
    version = subprocess.run([blender, "--version"], capture_output=True, text=True, timeout=20)
    manifest = ROOT / "art" / "asset-manifest.json"
    return {"blender": version.stdout.splitlines()[0], "project": str(ROOT),
            "manifest": json.loads(manifest.read_text()) if manifest.exists() else None}

@mcp.tool()
def build_tiny_world_assets() -> dict:
    """Rebuild this project's original GLB and Blender source from its fixed builder."""
    blender = shutil.which("blender") or "/opt/homebrew/bin/blender"
    result = subprocess.run([blender, "--background", "--factory-startup", "--python-exit-code", "1",
                             "--python", str(ROOT / "scripts/art/build_worlds.py")],
                            cwd=ROOT, capture_output=True, text=True, timeout=180)
    if result.returncode:
        raise RuntimeError(result.stdout[-4000:] + result.stderr[-2000:])
    return {"status": "built", "manifest": json.loads((ROOT / "art/asset-manifest.json").read_text())}

if __name__ == "__main__":
    mcp.run(transport="stdio")
