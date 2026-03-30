#!/usr/bin/env -S uv run --quiet python3
# /// script
# requires-python = ">=3.9"
# dependencies = ["Pillow"]
# ///
"""Convert a Pokémon PNG sprite to ▀▄ half-block ANSI 256-color terminal art."""

import argparse
import sys
import os

def ansi_256(r, g, b):
    """Convert RGB to nearest ANSI 256 color code."""
    # Grayscale range
    if r == g == b:
        if r < 8:
            return 16
        if r > 248:
            return 231
        return round((r - 8) / 247 * 24) + 232
    # 6x6x6 color cube
    ri = round(r / 255 * 5)
    gi = round(g / 255 * 5)
    bi = round(b / 255 * 5)
    return 16 + 36 * ri + 6 * gi + bi

def fg(r, g, b):
    return f"\x1b[38;5;{ansi_256(r,g,b)}m"

def bg(r, g, b):
    return f"\x1b[48;5;{ansi_256(r,g,b)}m"

RESET = "\x1b[0m"

def convert_image(img, width):
    """Convert PIL image to half-block ANSI art string."""
    # Resize maintaining aspect ratio (half-block: each char = 2 pixel rows)
    orig_w, orig_h = img.size
    height = int(orig_h * width / orig_w)
    if height % 2 != 0:
        height += 1
    img = img.resize((width, height), resample=1)  # LANCZOS=1

    lines = []
    for y in range(0, height, 2):
        line = ""
        for x in range(width):
            top_px = img.getpixel((x, y))
            bot_y = y + 1
            bot_px = img.getpixel((x, bot_y)) if bot_y < height else (0, 0, 0, 0)

            # Handle RGBA transparency
            if img.mode == "RGBA":
                tr, tg, tb, ta = top_px
                br, bg_, bb, ba = bot_px
                top_transparent = ta < 128
                bot_transparent = ba < 128
            else:
                tr, tg, tb = top_px[:3]
                br, bg_, bb = bot_px[:3]
                top_transparent = False
                bot_transparent = False

            if top_transparent and bot_transparent:
                line += " "
            elif top_transparent:
                line += f"{fg(br, bg_, bb)}▄{RESET}"
            elif bot_transparent:
                line += f"{fg(tr, tg, tb)}▀{RESET}"
            else:
                line += f"{fg(tr, tg, tb)}{bg(br, bg_, bb)}▀{RESET}"
        lines.append(line)
    return "\n".join(lines)

def text_fallback(name, width):
    """Generate a simple text placeholder."""
    label = f"[{name}]"
    return label.center(width)

def main():
    parser = argparse.ArgumentParser(description="Convert Pokémon sprite PNG to terminal ANSI art")
    parser.add_argument("--id", type=int, required=True, help="Pokédex ID")
    parser.add_argument("--width", type=int, default=20, help="Output width in characters")
    parser.add_argument("--input", type=str, help="Input PNG file path (overrides --id lookup)")
    parser.add_argument("--output", type=str, help="Output text file path (default: stdout)")
    parser.add_argument("--name", type=str, default="", help="Pokémon name for text fallback")
    args = parser.parse_args()

    # Determine input file
    if args.input:
        input_path = args.input
    else:
        # Look for sprite in standard locations relative to this script
        script_dir = os.path.dirname(os.path.abspath(__file__))
        input_path = os.path.join(script_dir, "raw", f"{args.id}.png")

    # Try Pillow conversion
    result = None
    try:
        from PIL import Image
        if not os.path.exists(input_path):
            raise FileNotFoundError(f"Sprite not found: {input_path}")
        img = Image.open(input_path)
        result = convert_image(img, args.width)
    except ImportError:
        # Pillow not available
        name = args.name or str(args.id)
        result = text_fallback(name, args.width)
    except FileNotFoundError:
        name = args.name or str(args.id)
        result = text_fallback(name, args.width)
    except Exception as e:
        name = args.name or str(args.id)
        result = text_fallback(name, args.width)

    # Output
    if args.output:
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(result + "\n")
    else:
        print(result)

if __name__ == "__main__":
    main()
