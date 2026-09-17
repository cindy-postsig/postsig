#!/usr/bin/env python3
"""
Fix Px Grotesk font metrics for better vertical centering.
This adjusts the ascender/descender values to center the cap height
in the em square, which fixes alignment issues with icons in flexbox.
"""

from fontTools.ttLib import TTFont
import os
import shutil

fonts_to_fix = [
    "public/fonts/Px-Grotesk-Light.ttf",
    "public/fonts/Px-Grotesk-Regular.ttf",
    "public/fonts/Px-Grotesk-Bold.ttf",
]

# Get the project root
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)

# Backup directory
backup_dir = os.path.join(project_root, "public/fonts/backup")
os.makedirs(backup_dir, exist_ok=True)

print("Fixing Px Grotesk font metrics for better vertical centering...")
print("=" * 70)

for relative_path in fonts_to_fix:
    font_path = os.path.join(project_root, relative_path)
    filename = os.path.basename(font_path)

    # Create backup
    backup_path = os.path.join(backup_dir, filename)
    shutil.copy2(font_path, backup_path)
    print(f"\n📁 Backed up: {filename}")

    # Load font
    font = TTFont(font_path)
    os2 = font['OS/2']
    hhea = font['hhea']
    head = font['head']

    upm = head.unitsPerEm  # 2048
    cap_height = os2.sCapHeight  # 1393

    # Calculate metrics that center the cap height
    # We want the cap height to be visually centered
    ideal_ascender = 1720  # Slightly above cap height (1393) for accents
    ideal_descender = -328  # Smaller descender, centers the caps better

    print(f"\n🔧 Fixing: {filename}")
    print(f"   Before: hhea.ascender={hhea.ascender}, hhea.descender={hhea.descender}")
    print(f"   Before: OS/2.sTypoAscender={os2.sTypoAscender}, OS/2.sTypoDescender={os2.sTypoDescender}")

    # Update HHEA table (Mac metrics)
    hhea.ascender = ideal_ascender
    hhea.descender = ideal_descender
    hhea.lineGap = 0

    # Update OS/2 table (Windows metrics) - keep them consistent
    os2.sTypoAscender = ideal_ascender
    os2.sTypoDescender = ideal_descender
    os2.sTypoLineGap = 0
    os2.usWinAscent = ideal_ascender
    os2.usWinDescent = abs(ideal_descender)

    # Enable USE_TYPO_METRICS flag (bit 7) for consistent cross-platform behavior
    os2.fsSelection |= (1 << 7)

    print(f"   After:  hhea.ascender={hhea.ascender}, hhea.descender={hhea.descender}")
    print(f"   After:  OS/2.sTypoAscender={os2.sTypoAscender}, OS/2.sTypoDescender={os2.sTypoDescender}")

    # Save the font
    font.save(font_path)
    font.close()
    print(f"   ✅ Saved!")

print("\n" + "=" * 70)
print("✅ All fonts fixed! Backups saved in: public/fonts/backup/")
print("\nRestart your dev server to see the changes.")
