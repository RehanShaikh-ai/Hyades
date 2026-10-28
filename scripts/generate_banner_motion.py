#!/usr/bin/env python3
"""
generate_banner_motion.py
High-craft kinetic GitHub banner generator for Hyades.
Combines 3D wireframe armillary sphere mathematics, technical blueprint cartography,
and precision Swiss/Editorial typography (Google Fonts Newsreader) into seamless looping animated GIFs.

Editions produced:
1. Archival Ivory (Light Mode) - Tailored for GitHub light theme and scholarly documentation.
2. Obsidian Dark (Dark Mode) - Companion edition for dark themes.
"""

import math
import os
import subprocess
import tempfile
import time


def project_3d_point(x, y, z, rot_y, rot_x, cam_dist=420.0, center_x=920.0, center_y=200.0):
    """Rotate point around Y then X axis, and apply perspective projection."""
    cos_y = math.cos(rot_y)
    sin_y = math.sin(rot_y)
    x1 = x * cos_y + z * sin_y
    y1 = y
    z1 = -x * sin_y + z * cos_y

    cos_x = math.cos(rot_x)
    sin_x = math.sin(rot_x)
    x2 = x1
    y2 = y1 * cos_x - z1 * sin_x
    z2 = y1 * sin_x + z1 * cos_x

    scale = cam_dist / (cam_dist + z2)
    px = center_x + x2 * scale
    py = center_y + y2 * scale
    return px, py, z2, scale


def generate_ring_segments(
    radius, rot_axis, tilt_angle, base_rot_y, cam_tilt_x, cx=920.0, cy=200.0, num_points=72
):
    """Generate 3D ring segments with depth sorting for volumetric occlusion."""
    points = []
    cos_tilt = math.cos(tilt_angle)
    sin_tilt = math.sin(tilt_angle)

    for i in range(num_points + 1):
        u = 2.0 * math.pi * (i / num_points)
        if rot_axis == "equator":
            bx = radius * math.cos(u)
            by = 0.0
            bz = radius * math.sin(u)
        elif rot_axis == "meridian":
            bx = 0.0
            by = radius * math.cos(u)
            bz = radius * math.sin(u)
        elif rot_axis == "ecliptic":
            lx = radius * math.cos(u)
            lz = radius * math.sin(u)
            bx = lx
            by = lz * sin_tilt
            bz = lz * cos_tilt
        elif rot_axis == "colure":
            bx = radius * math.cos(u)
            by = radius * math.sin(u)
            bz = 0.0

        curr_rot_y = 0.0 if rot_axis == "colure" else base_rot_y
        px, py, pz, pscale = project_3d_point(
            bx, by, bz, curr_rot_y, cam_tilt_x, cam_dist=420.0, center_x=cx, center_y=cy
        )
        points.append((px, py, pz, pscale))

    return points


def build_svg_frame(t, dark_mode=False):
    """
    Build a single SVG frame at normalized loop time t in [0.0, 1.0).
    Width: 1200, Height: 400.
    """
    rot_y = 2.0 * math.pi * t
    cam_tilt_x = 0.38  # ~22 deg perspective down-angle
    arm_cx = 920.0
    arm_cy = 200.0

    if dark_mode:
        # Obsidian Dark Theme
        bg_0 = "#06090E"
        bg_main = "#0D1117"
        bg_1 = "#161B22"
        card_bg = "#161B22"
        card_border = "#30363D"
        grid_line = "#21262D"
        grid_fine = "#161B22"
        text_primary = "#F0F6FC"
        text_secondary = "#8B949E"
        text_muted = "#6E7681"
        accent_terracotta = "#FF7B54"
        accent_gold = "#F2CC60"
        ring_colure = "#FF7B54"
        ring_equator = "#58A6FF"
        ring_ecliptic = "#F2CC60"
        ring_meridian = "#8B949E"
        ring_inner = "#D29922"
        reticle_stroke = "#30363D"
        border_ruler = "#30363D"
    else:
        # Refined Archival Ivory & Scholarly Stoa Theme
        bg_0 = "#FCFAF6"
        bg_main = "#FAF7F2"
        bg_1 = "#F3ECE0"
        card_bg = "#FFFFFF"
        card_border = "#D8D1C4"
        grid_line = "#EFE9DD"
        grid_fine = "#E5DEC0"
        text_primary = "#181614"
        text_secondary = "#4A453E"
        text_muted = "#8C8476"
        accent_terracotta = "#BD532B"
        accent_gold = "#C48E2E"
        ring_colure = "#BD532B"
        ring_equator = "#1E3A5F"
        ring_ecliptic = "#C48E2E"
        ring_meridian = "#2D2A26"
        ring_inner = "#8C7355"
        reticle_stroke = "#EAE4D9"
        border_ruler = "#D4CCBE"

    # Harmonic stellar breathing
    pulse = 0.5 + 0.5 * math.sin(2.0 * math.pi * t)
    star_scale = 1.0 + 0.15 * pulse
    star_opacity = 0.88 + 0.12 * pulse

    # 3D Ring Geometry
    r_sphere = 114.0
    pts_equator = generate_ring_segments(
        r_sphere * 0.98, "equator", 0.0, rot_y, cam_tilt_x, arm_cx, arm_cy
    )
    pts_ecliptic = generate_ring_segments(
        r_sphere * 0.96, "ecliptic", math.radians(23.44), rot_y, cam_tilt_x, arm_cx, arm_cy
    )
    pts_meridian = generate_ring_segments(
        r_sphere * 0.94, "meridian", 0.0, rot_y, cam_tilt_x, arm_cx, arm_cy
    )
    pts_inner = generate_ring_segments(
        r_sphere * 0.62, "equator", 0.0, rot_y * 1.5, cam_tilt_x, arm_cx, arm_cy
    )

    def points_to_path(pts):
        d = []
        for i, (px, py, _pz, _) in enumerate(pts):
            cmd = "M" if i == 0 else "L"
            d.append(f"{cmd} {px:.2f} {py:.2f}")
        return " ".join(d)

    d_equator = points_to_path(pts_equator)
    d_ecliptic = points_to_path(pts_ecliptic)
    d_meridian = points_to_path(pts_meridian)
    d_inner = points_to_path(pts_inner)

    # 3D Hyades Cluster Stars rotating inside
    cluster_stars = [
        (-42.0, -28.0, -14.0, 2.8),
        (-18.0, 10.0, -22.0, 2.5),
        (0.0, 32.0, -8.0, 2.2),
        (20.0, 10.0, 14.0, 2.5),
        (44.0, -28.0, 22.0, 2.8),
    ]

    cluster_projected = []
    for sx, sy, sz, s_r in cluster_stars:
        px, py, pz, pscale = project_3d_point(
            sx, sy, sz, rot_y, cam_tilt_x, cam_dist=420.0, center_x=arm_cx, center_y=arm_cy
        )
        cluster_projected.append((px, py, pz, pscale * s_r))

    svg = []
    svg.append(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" width="1200" height="400">'
    )
    svg.append("<defs>")

    # Gradients
    svg.append(f'''
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{bg_0}" />
      <stop offset="50%" stop-color="{bg_main}" />
      <stop offset="100%" stop-color="{bg_1}" />
    </linearGradient>
    <radialGradient id="armGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="{accent_gold}" stop-opacity="0.22" />
      <stop offset="45%" stop-color="{accent_terracotta}" stop-opacity="0.08" />
      <stop offset="100%" stop-color="{bg_main}" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="starFlare" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="1" />
      <stop offset="35%" stop-color="{accent_gold}" stop-opacity="0.8" />
      <stop offset="70%" stop-color="{accent_terracotta}" stop-opacity="0.25" />
      <stop offset="100%" stop-color="{accent_terracotta}" stop-opacity="0" />
    </radialGradient>
    <g id="gh-icon">
      <path fill="{text_primary}" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
    </g>
    ''')
    svg.append("</defs>")

    # 1. Background Fill
    svg.append('<rect width="1200" height="400" fill="url(#bgGrad)" />')

    # 2. Subtle Blueprint Grid Lines
    svg.append(f'''
    <g stroke="{grid_line}" stroke-width="0.75" opacity="0.8">
      <line x1="60" y1="0" x2="60" y2="400" />
      <line x1="600" y1="0" x2="600" y2="400" stroke="{grid_fine}" stroke-dasharray="4,6" />
      <line x1="0" y1="60" x2="1200" y2="60" />
      <line x1="0" y1="340" x2="1200" y2="340" />
    </g>
    ''')

    # Outer Framing Rulers & Crosshairs
    svg.append(f'''
    <g stroke="{border_ruler}" stroke-width="1" opacity="0.85">
      <rect x="32" y="32" width="1136" height="336" fill="none" />
      <path d="M 24,32 L 40,32 M 32,24 L 32,40" />
      <path d="M 1160,32 L 1176,32 M 1168,24 L 1168,40" />
      <path d="M 24,368 L 40,368 M 32,360 L 32,376" />
      <path d="M 1160,368 L 1176,368 M 1168,360 L 1168,376" />
    </g>
    ''')

    # Clean Astronomical Margins Metadata
    svg.append(f'''
    <g font-family="'JetBrains Mono', monospace" font-size="9" fill="{text_muted}" letter-spacing="1.5">
      <text x="48" y="24">HYADES · KNOWLEDGE OBSERVATORY</text>
      <text x="1152" y="24" text-anchor="end">RA 04ʰ 28ᵐ · DEC +15° 52′</text>
      <text x="48" y="384">v0.5.1 · OPEN SOURCE</text>
      <text x="1152" y="384" text-anchor="end">JOHANNES HEVELIUS (1690)</text>
    </g>
    ''')

    # 3. LEFT SECTION: HUMANIZED EDITORIAL TYPOGRAPHY (OPTION A)
    svg.append(f'''
    <g id="hero-left-content" transform="translate(68, 0)">
      <!-- Terracotta Accent Indicator -->
      <line x1="0" y1="92" x2="64" y2="92" stroke="{accent_terracotta}" stroke-width="2.5" />

      <!-- Monumental Brand Title: Hyades -->
      <text x="0" y="160" 
            font-family="'Newsreader', 'Playfair Display', 'DejaVu Serif', 'Georgia', serif" 
            font-size="76" 
            font-weight="700" 
            letter-spacing="1" 
            fill="{text_primary}">Hyades</text>

      <!-- Subtitle -->
      <text x="4" y="202" 
            font-family="'Newsreader', 'Playfair Display', 'DejaVu Serif', 'Georgia', serif" 
            font-style="italic" 
            font-size="28" 
            font-weight="400" 
            letter-spacing="0.3" 
            fill="{accent_terracotta}">a celestial observatory for your thoughts.</text>

      <!-- Description -->
      <text x="4" y="238" 
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" 
            font-size="14" 
            font-weight="400" 
            fill="{text_secondary}" 
            letter-spacing="0.1">A personal knowledge graph that maps connections as constellations</text>
      <text x="4" y="258" 
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" 
            font-size="14" 
            font-weight="400" 
            fill="{text_secondary}" 
            letter-spacing="0.1">and grounds research in verified source provenance.</text>

      <!-- Understated Footer Pills: Tech Stack & GitHub Link -->
      <g transform="translate(4, 290)">
        <!-- GitHub Repo Pill -->
        <g>
          <rect x="0" y="0" width="220" height="32" rx="6" 
                fill="{card_bg}" stroke="{card_border}" stroke-width="1" />
          <g transform="translate(12, 8)">
            <use href="#gh-icon" width="16" height="16" />
          </g>
          <text x="36" y="20.5" 
                font-family="'JetBrains Mono', monospace" 
                font-size="11.5" 
                font-weight="500" 
                fill="{text_primary}">RehanShaikh-ai / Hyades</text>
        </g>

        <!-- Tech Stack Pill (Honest, Concrete Facts) -->
        <g transform="translate(230, 0)">
          <rect x="0" y="0" width="270" height="32" rx="6" 
                fill="{card_bg}" stroke="{card_border}" stroke-width="1" />
          <text x="135" y="20.5" 
                font-family="'JetBrains Mono', monospace" 
                font-size="11" 
                font-weight="500" 
                text-anchor="middle" 
                fill="{text_secondary}">Python · FastAPI · React · Qdrant</text>
        </g>
      </g>
    </g>
    ''')

    # 4. RIGHT SECTION: SIGNATURE KINETIC 3D ARMILLARY INSTRUMENT
    svg.append(f'''
    <g id="instrument-right">
      <circle cx="{arm_cx}" cy="{arm_cy}" r="160" fill="url(#armGlow)" />

      <!-- Reticle Rings -->
      <g stroke="{reticle_stroke}" stroke-width="0.8" fill="none">
        <circle cx="{arm_cx}" cy="{arm_cy}" r="150" stroke-dasharray="3,4" />
        <circle cx="{arm_cx}" cy="{arm_cy}" r="130" stroke-dasharray="2,3" />
      </g>

      <!-- Fixed Colure Ring -->
      <circle cx="{arm_cx}" cy="{arm_cy}" r="114" fill="none" stroke="{ring_colure}" stroke-width="2.4" opacity="0.95" />
      <circle cx="{arm_cx}" cy="{arm_cy}" r="108" fill="none" stroke="{ring_colure}" stroke-width="0.8" opacity="0.6" stroke-dasharray="2,3" />

      <!-- Outer Calibration Ticks -->
      <g stroke="{ring_colure}" stroke-width="1.2" opacity="0.85">
        <line x1="{arm_cx}" y1="86" x2="{arm_cx}" y2="92" />
        <line x1="{arm_cx}" y1="308" x2="{arm_cx}" y2="314" />
        <line x1="{arm_cx - 114}" y1="200" x2="{arm_cx - 108}" y2="200" />
        <line x1="{arm_cx + 108}" y1="200" x2="{arm_cx + 114}" y2="200" />
      </g>

      <!-- 3D Rotating Rings -->
      <path d="{d_equator}" fill="none" stroke="{ring_equator}" stroke-width="1.8" stroke-dasharray="6,3" opacity="0.9" />
      <path d="{d_ecliptic}" fill="none" stroke="{ring_ecliptic}" stroke-width="2.5" opacity="0.95" />
      <path d="{d_meridian}" fill="none" stroke="{ring_meridian}" stroke-width="1.3" stroke-dasharray="4,3" opacity="0.8" />
      <path d="{d_inner}" fill="none" stroke="{ring_inner}" stroke-width="1.1" stroke-dasharray="3,3" opacity="0.65" />

      <!-- Internal Constellation Vectors -->
      <g stroke="{text_secondary}" stroke-width="1.1" opacity="0.75" stroke-dasharray="3,2">
    ''')
    for i in range(len(cluster_projected) - 1):
        x_a, y_a, _, _ = cluster_projected[i]
        x_b, y_b, _, _ = cluster_projected[i + 1]
        svg.append(f'<line x1="{x_a:.2f}" y1="{y_a:.2f}" x2="{x_b:.2f}" y2="{y_b:.2f}" />')
    svg.append("</g>")

    # Internal Star Nodes
    for kx, ky, _kz, kr in cluster_projected:
        svg.append(
            f'<circle cx="{kx:.2f}" cy="{ky:.2f}" r="{kr:.2f}" fill="{accent_gold}" opacity="0.9" />'
        )

    # Polar Meridian Axis
    svg.append(f'''
      <line x1="{arm_cx}" y1="92" x2="{arm_cx}" y2="308" stroke="{ring_meridian}" stroke-width="1.2" stroke-dasharray="4,3" opacity="0.75" />

      <!-- Focal Aldebaran Beacon (Pulsing Starburst) -->
      <g transform="translate({arm_cx}, {arm_cy}) scale({star_scale:.3f})">
        <circle cx="0" cy="0" r="32" fill="url(#starFlare)" opacity="{star_opacity:.2f}" />
        
        <!-- 8-Point Diamond Starburst -->
        <path fill="{accent_terracotta}" d="
          M 0,-22 
          L 4.5,-6 
          L 22,0 
          L 4.5,6 
          L 0,22 
          L -4.5,6 
          L -22,0 
          L -4.5,-6 Z
        " />
        
        <!-- Secondary Starlight Gold Rays -->
        <path fill="{accent_gold}" d="
          M -11,-11 L 0,-3.5 L 11,-11 L 3.5,0 L 11,11 L 0,3.5 L -11,11 L -3.5,0 Z
        " />
        
        <!-- Radiant Star Core -->
        <circle cx="0" cy="0" r="4.5" fill="#FFFFFF" stroke="{accent_terracotta}" stroke-width="1.8" />
        <circle cx="0" cy="0" r="1.8" fill="{accent_gold}" />

        <text x="18" y="-12" font-family="'Newsreader', serif" font-style="italic" font-size="13" font-weight="600" fill="{accent_terracotta}">α</text>
        <text x="18" y="2" font-family="'JetBrains Mono', monospace" font-size="8.5" font-weight="600" fill="{accent_gold}">ALDEBARAN</text>
      </g>

      <!-- Classical Instrument Latin Legend -->
      <g font-family="'JetBrains Mono', monospace" font-size="8" fill="{text_muted}">
        <text x="{arm_cx}" y="68" text-anchor="middle" letter-spacing="2">SPHAERA ARMILLARIS</text>
        <text x="{arm_cx}" y="336" text-anchor="middle" letter-spacing="2">AXIS 23° 27′ · POLUS BOREALIS</text>
      </g>
    </g>
    ''')

    svg.append("</svg>")
    return "".join(svg)


def render_animation_edition(dark_mode=False, total_frames=50, fps=25, scale=1.5):
    """
    Renders high-DPI animated GIF using spatial palette quantization with zero dithering
    to preserve razor-sharp typography and silky 3D armillary motion.
    Scale 1.5 renders at 1800×600 (ideal balance of Retina crispness & small file size).
    """
    out_dir = "/home/hamza/Documents/Hyades-main/branding/banner"
    artifact_dir = "/home/hamza/.gemini/antigravity/brain/df8e3a5d-313a-4b9e-a4e8-0e679d11889a"
    prefix = "dark" if dark_mode else "light"
    mode_name = "OBSIDIAN DARK" if dark_mode else "ARCHIVAL LIGHT"

    render_w = int(1200 * scale)
    render_h = int(400 * scale)

    print(
        f"\n>>> RENDERING [{mode_name}] KINETIC EDITION ({render_w}×{render_h}, {fps} FPS, {total_frames} frames)..."
    )
    temp_dir = tempfile.mkdtemp(prefix=f"hyades_{prefix}_frames_")

    try:
        # 1. Render all SVG frames to high-DPI PNGs
        for i in range(total_frames):
            t = i / total_frames
            svg_content = build_svg_frame(t, dark_mode=dark_mode)
            svg_frame_path = os.path.join(temp_dir, f"frame_{i:04d}.svg")
            png_frame_path = os.path.join(temp_dir, f"frame_{i:04d}.png")

            with open(svg_frame_path, "w", encoding="utf-8") as f:
                f.write(svg_content)

            subprocess.run(
                [
                    "rsvg-convert",
                    "-w",
                    str(render_w),
                    "-h",
                    str(render_h),
                    svg_frame_path,
                    "-o",
                    png_frame_path,
                ],
                check=True,
            )

            if (i + 1) % 15 == 0 or i == total_frames - 1:
                print(
                    f"  → Rendered {i + 1}/{total_frames} frames ({(i + 1) / total_frames * 100:.0f}%)"
                )

        # 2. Compile High-Quality Zero-Dither GIF
        gif_name = (
            f"hyades-banner-motion-{prefix}.gif" if not dark_mode else "hyades-banner-motion.gif"
        )
        gif_out = os.path.join(out_dir, gif_name)
        palette_path = os.path.join(temp_dir, "palette.png")

        # Optimal 256-color palette with difference statistics for looping
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "warning",
                "-y",
                "-framerate",
                str(fps),
                "-i",
                os.path.join(temp_dir, "frame_%04d.png"),
                "-vf",
                "palettegen=max_colors=256:stats_mode=diff",
                palette_path,
            ],
            check=True,
        )

        # Apply palette with dither=none for absolute razor-sharp text
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "warning",
                "-y",
                "-framerate",
                str(fps),
                "-i",
                os.path.join(temp_dir, "frame_%04d.png"),
                "-i",
                palette_path,
                "-lavfi",
                "paletteuse=dither=none",
                gif_out,
            ],
            check=True,
        )

        # 3. MP4 compilation for web embed
        mp4_name = (
            f"hyades-banner-motion-{prefix}.mp4" if not dark_mode else "hyades-banner-motion.mp4"
        )
        mp4_out = os.path.join(out_dir, mp4_name)
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "warning",
                "-y",
                "-framerate",
                str(fps),
                "-i",
                os.path.join(temp_dir, "frame_%04d.png"),
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-crf",
                "18",
                "-movflags",
                "+faststart",
                mp4_out,
            ],
            check=True,
        )

        # Copy to artifacts for inspection
        art_gif_name = (
            f"hyades_banner_motion_{prefix}.gif" if not dark_mode else "hyades_banner_motion.gif"
        )
        subprocess.run(["cp", gif_out, os.path.join(artifact_dir, art_gif_name)], check=True)
        if not dark_mode:
            subprocess.run(
                ["cp", gif_out, os.path.join(artifact_dir, "hyades_banner_motion_light.gif")],
                check=True,
            )

        gif_size_kb = os.path.getsize(gif_out) / 1024
        mp4_size_kb = os.path.getsize(mp4_out) / 1024
        print(f"✔ [{mode_name}] GIF: {gif_out} ({gif_size_kb:.1f} KB)")
        print(f"✔ [{mode_name}] MP4: {mp4_out} ({mp4_size_kb:.1f} KB)")

    finally:
        # Clean up temporary frames
        for f in os.listdir(temp_dir):
            os.remove(os.path.join(temp_dir, f))
        os.rmdir(temp_dir)


def main():
    start_time = time.time()
    out_dir = "/home/hamza/Documents/Hyades-main/branding/banner"
    os.makedirs(out_dir, exist_ok=True)

    print("=== HYADES KINETIC BANNER GENERATOR (OPTION A APPROVED) ===")

    # 1. Generate Static SVG & PNG Masters (1x & 2x Retina)
    print("\n[1/3] Generating Static Masters (Light & Dark at 1x and 2x Retina)...")

    # Light SVG
    svg_light = build_svg_frame(0.125, dark_mode=False)
    light_svg_path = os.path.join(out_dir, "hyades-banner-refined-light.svg")
    with open(light_svg_path, "w", encoding="utf-8") as f:
        f.write(svg_light)
    subprocess.run(
        [
            "rsvg-convert",
            "-w",
            "1200",
            "-h",
            "400",
            light_svg_path,
            "-o",
            os.path.join(out_dir, "hyades-banner-refined-light.png"),
        ],
        check=True,
    )
    subprocess.run(
        [
            "rsvg-convert",
            "-w",
            "2400",
            "-h",
            "800",
            light_svg_path,
            "-o",
            os.path.join(out_dir, "hyades-banner-refined-light@2x.png"),
        ],
        check=True,
    )

    # Dark SVG
    svg_dark = build_svg_frame(0.125, dark_mode=True)
    dark_svg_path = os.path.join(out_dir, "hyades-banner-refined-dark.svg")
    with open(dark_svg_path, "w", encoding="utf-8") as f:
        f.write(svg_dark)
    subprocess.run(
        [
            "rsvg-convert",
            "-w",
            "1200",
            "-h",
            "400",
            dark_svg_path,
            "-o",
            os.path.join(out_dir, "hyades-banner-refined-dark.png"),
        ],
        check=True,
    )
    subprocess.run(
        [
            "rsvg-convert",
            "-w",
            "2400",
            "-h",
            "800",
            dark_svg_path,
            "-o",
            os.path.join(out_dir, "hyades-banner-refined-dark@2x.png"),
        ],
        check=True,
    )

    # 2. Render Light Mode Kinetic Motion GIF (USER REQUEST) at 1800×600 (1.5x Retina)
    render_animation_edition(dark_mode=False, total_frames=50, fps=25, scale=1.5)

    # 3. Render Dark Mode Kinetic Motion GIF at 1800×600 (1.5x Retina)
    render_animation_edition(dark_mode=True, total_frames=50, fps=25, scale=1.5)

    elapsed = time.time() - start_time
    print(f"\n✔ ALL EDITIONS RENDERED IN {elapsed:.2f} SECONDS.")


if __name__ == "__main__":
    main()
