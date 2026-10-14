"""
Builds the app icons (iOS asset catalog + Android launcher icons) from the Malinvosky logo.

The mark is the gold circle with the "m" from assets/images/malinovsky-logo.svg (its embedded
1600x1200 picture). It is re-rendered from an upscaled mask, so the 1024 px store icon stays sharp,
centred on a white square. iOS icons carry no alpha channel (App Store requirement).

Run from app/:  python scripts/build-app-icons.py
"""
import base64
import io
import json
import os
import re

from PIL import Image, ImageDraw, ImageFilter

GOLD = (149, 132, 71)
BACKGROUND = (255, 255, 255)
MARK_SHARE = 0.72  # share of the icon width taken by the circle
SUPER = 4  # mask upscale factor before re-rendering

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SVG = os.path.join(ROOT, 'assets', 'images', 'malinovsky-logo.svg')
IOS_SET = os.path.join(ROOT, 'ios', 'MalinvoskyApp', 'Images.xcassets', 'AppIcon.appiconset')
ANDROID_RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')


def embedded_logo() -> Image.Image:
    svg = open(SVG, encoding='utf-8').read()
    data = re.search(r'data:image/png;base64,([A-Za-z0-9+/=]+)', svg).group(1)
    return Image.open(io.BytesIO(base64.b64decode(data))).convert('RGBA')


def gold_mask(logo: Image.Image) -> Image.Image:
    """Mask of the gold circle (the white "m" inside it stays out), cropped to the circle."""
    px = logo.load()
    mask = Image.new('L', logo.size, 0)
    mp = mask.load()
    for y in range(0, 640):
        for x in range(500, 1100):
            r, g, b, a = px[x, y]
            # Distance from the gold colour, softened so anti-aliased edges keep partial coverage.
            d = abs(r - GOLD[0]) + abs(g - GOLD[1]) + abs(b - GOLD[2])
            coverage = max(0.0, 1.0 - d / 220.0) * (a / 255.0)
            mp[x, y] = int(round(255 * coverage))
    # The circle's extent: strongly gold pixels only (anti-aliased grey edges of the wordmark
    # below it are partly "gold-ish" and must not widen the crop).
    box = mask.point(lambda v: 255 if v > 200 else 0).getbbox()
    side = max(box[2] - box[0], box[3] - box[1])
    cx, cy = (box[0] + box[2]) // 2, (box[1] + box[3]) // 2
    return mask.crop((cx - side // 2 - 2, cy - side // 2 - 2, cx + side // 2 + 2, cy + side // 2 + 2))


def master_icon(size: int = 1024) -> Image.Image:
    mask = gold_mask(embedded_logo())
    big = mask.resize((mask.width * SUPER, mask.height * SUPER), Image.BICUBIC)
    # Re-threshold the upscaled mask into crisp shapes, then a light blur for anti-aliasing.
    big = big.point(lambda v: 255 if v > 110 else 0).filter(ImageFilter.GaussianBlur(SUPER * 0.6))
    mark_side = int(size * MARK_SHARE)
    big = big.resize((mark_side, mark_side), Image.LANCZOS)
    icon = Image.new('RGB', (size, size), BACKGROUND)
    gold = Image.new('RGB', (mark_side, mark_side), GOLD)
    offset = ((size - mark_side) // 2, (size - mark_side) // 2)
    icon.paste(gold, offset, big)
    return icon


IOS_ICONS = [
    # (idiom, size in points, scale)
    ('iphone', 20, 2), ('iphone', 20, 3), ('iphone', 29, 2), ('iphone', 29, 3),
    ('iphone', 40, 2), ('iphone', 40, 3), ('iphone', 60, 2), ('iphone', 60, 3),
    ('ipad', 20, 1), ('ipad', 20, 2), ('ipad', 29, 1), ('ipad', 29, 2),
    ('ipad', 40, 1), ('ipad', 40, 2), ('ipad', 76, 1), ('ipad', 76, 2), ('ipad', 83.5, 2),
    ('ios-marketing', 1024, 1),
]

ANDROID_DENSITIES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}


def write_ios(master: Image.Image) -> None:
    images = []
    for idiom, points, scale in IOS_ICONS:
        pixels = int(round(points * scale))
        name = f'icon-{idiom}-{points:g}@{scale}x.png'
        master.resize((pixels, pixels), Image.LANCZOS).convert('RGB').save(os.path.join(IOS_SET, name))
        images.append({'filename': name, 'idiom': idiom, 'scale': f'{scale}x', 'size': f'{points:g}x{points:g}'})
    with open(os.path.join(IOS_SET, 'Contents.json'), 'w', encoding='utf-8') as f:
        json.dump({'images': images, 'info': {'author': 'xcode', 'version': 1}}, f, indent=2)
        f.write('\n')


def write_android(master: Image.Image) -> None:
    for density, pixels in ANDROID_DENSITIES.items():
        folder = os.path.join(ANDROID_RES, f'mipmap-{density}')
        square = master.resize((pixels, pixels), Image.LANCZOS)
        square.save(os.path.join(folder, 'ic_launcher.png'))
        round_mask = Image.new('L', (pixels * 4, pixels * 4), 0)
        ImageDraw.Draw(round_mask).ellipse((0, 0, pixels * 4 - 1, pixels * 4 - 1), fill=255)
        round_mask = round_mask.resize((pixels, pixels), Image.LANCZOS)
        rounded = Image.new('RGBA', (pixels, pixels), (0, 0, 0, 0))
        rounded.paste(square, (0, 0), round_mask)
        rounded.save(os.path.join(folder, 'ic_launcher_round.png'))


if __name__ == '__main__':
    icon = master_icon()
    write_ios(icon)
    write_android(icon)
    print('icons written:', len(IOS_ICONS), 'iOS,', len(ANDROID_DENSITIES) * 2, 'Android')
