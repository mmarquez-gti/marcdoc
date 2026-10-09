"""Generates build/icon.png, the application icon used by the Linux packages.

Run: python3 scripts/assets/build-icon.py   (requires Pillow)
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SIZE = 512
CORNER_RADIUS = 96
ACCENT = (31, 78, 121, 255)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_SIZE = 300

image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((0, 0, SIZE - 1, SIZE - 1), radius=CORNER_RADIUS, fill=ACCENT)
font = ImageFont.truetype(FONT, FONT_SIZE)
draw.text((SIZE / 2, SIZE / 2), "M", font=font, fill="white", anchor="mm")
output = Path(__file__).resolve().parents[2] / "build" / "icon.png"
image.save(output)
print(f"Icon written to {output}")
