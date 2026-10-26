import struct
import zlib

BLUE = (59, 111, 182)
WHITE = (255, 255, 255)


def inside_rounded_square(x, y, n, r):
    cx = min(max(x, r), n - r)
    cy = min(max(y, r), n - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def inside_arrow(x, y, n):
    u, v = x / n, y / n
    if 0.43 <= u <= 0.57 and 0.40 <= v <= 0.72:
        return True
    if 0.20 <= v <= 0.44:
        half = (v - 0.20) / 0.24 * 0.24
        return abs(u - 0.5) <= half
    if 0.78 <= v <= 0.86 and 0.24 <= u <= 0.76:
        return True
    return False


def pixel(x, y, n):
    hits_bg = hits_fg = 0
    for sx in range(4):
        for sy in range(4):
            px, py = x + (sx + 0.5) / 4, y + (sy + 0.5) / 4
            if inside_rounded_square(px, py, n, n * 0.2):
                hits_bg += 1
                if inside_arrow(px, py, n):
                    hits_fg += 1
    a = hits_bg / 16
    if not hits_bg:
        return (0, 0, 0, 0)
    f = hits_fg / hits_bg
    rgb = tuple(round(BLUE[i] * (1 - f) + WHITE[i] * f) for i in range(3))
    return rgb + (round(a * 255),)


def png(n):
    rows = b"".join(b"\0" + b"".join(bytes(pixel(x, y, n)) for x in range(n)) for y in range(n))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))


for size in (16, 32, 48, 128):
    with open(f"icons/icon-{size}.png", "wb") as f:
        f.write(png(size))
