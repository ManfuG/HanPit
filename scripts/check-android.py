"""Verify that an APK contains every offline runtime asset, byte-for-byte."""
import hashlib
from pathlib import Path
import sys
import zipfile

apk = Path(sys.argv[1])
public = Path(__file__).resolve().parents[1] / "public"
with zipfile.ZipFile(apk) as archive:
    names = set(archive.namelist())
    checked = 0
    for source in public.rglob("*"):
        if not source.is_file():
            continue
        member = f"assets/public/{source.relative_to(public).as_posix()}"
        if member not in names:
            raise SystemExit(f"Missing offline asset: {member}")
        if hashlib.sha256(source.read_bytes()).digest() != hashlib.sha256(archive.read(member)).digest():
            raise SystemExit(f"Changed offline asset: {member}")
        checked += 1
    for member in names:
        if member.startswith("assets/public/") and (member.endswith(".map") or "/.venv" in member):
            raise SystemExit(f"Unexpected development asset: {member}")
    for member in ("assets/public/index.html", "assets/capacitor.config.json"):
        if member not in names:
            raise SystemExit(f"Missing runtime entry: {member}")
print(f"APK offline assets verified: {checked} source files match exactly.")
