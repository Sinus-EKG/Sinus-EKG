#!/usr/bin/env python3
"""Draws Sinus's icons (lane 1, 26/11/2026; claude/signature.md): the family segment wheel with Sinus's ECG-red segment
and its QRS trace, on Sinus's own tile (deep oxblood, a cardiology dark). Writes static/icons/icon.svg, maskable.svg and
the PNGs (128, 192, 256, 512, maskable-512, apple-touch-180, favicon-32) by rendering the SVG in Playwright's Chromium.
Run: python3 tools/icons.py"""
import os
from playwright.sync_api import sync_playwright
D=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','static','icons')
TILE=('#3a1219','#1c070b')  # oxblood, top-left to bottom-right
QRS='M17.4 23.4H20.2L21.6 17.2L23.4 29.4L24.8 23.4H30.6'
def wheel(cx,cy,r,small=False):
    s=r/14.5  # the 32-unit mark has its rind at r=14.5
    return (f'<g transform="translate({cx-16*s:.2f} {cy-16*s:.2f}) scale({s:.4f})">'
      '<circle cx="16" cy="16" r="14.5" fill="#ff7a1a"/><circle cx="16" cy="16" r="11.5" fill="#ffd9b8"/>'
      '<path d="M16 16L25.96 21.75A11.5 11.5 0 0 1 16 27.5Z" fill="#ec3b26"/>'
      '<path d="M16 16V4.5M16 16L25.96 10.25M16 16L25.96 21.75M16 16V27.5M16 16L6.04 21.75M16 16L6.04 10.25" stroke="#ff7a1a" stroke-width="1.4" stroke-linecap="round" fill="none"/>'
      '<circle cx="16" cy="16" r="1.9" fill="#e0600a"/>'
      +(f'<path d="M17.2 24.2H19.6L21.9 16.4L24.6 30.2L26.2 24.2H30.8" fill="none" stroke="#fff4ec" stroke-width="2.3" stroke-linejoin="miter" stroke-linecap="butt"/></g>' if small else
      f'<path d="{QRS}" fill="none" stroke="#fff4ec" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>'
      f'<path d="{QRS}" fill="none" stroke="#ec3b26" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/></g>'))
def svg(rx,r,cx=246,cy=256,small=False):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
      f'<defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{TILE[0]}"/><stop offset="1" stop-color="{TILE[1]}"/></linearGradient></defs>'
      f'<rect width="512" height="512" rx="{rx}" fill="url(#t)"/>'+wheel(cx,cy,r,small)+'</svg>\n')
ANY=svg(112,184)          # rounded tile, the wheel large
FULL=svg(0,184)           # square tile for iOS, which rounds it itself
MASK=svg(0,142,250,256)   # trace and rind inside the 40 % safe circle
SMALL=svg(96,200,238,256,True) # favicon: a little bigger, the trace one bold pale line, so it reads at 32 px
open(os.path.join(D,'icon.svg'),'w').write(ANY);open(os.path.join(D,'maskable.svg'),'w').write(MASK)
jobs=[('icon-128.png',128,ANY),('icon-192.png',192,ANY),('icon-256.png',256,ANY),('icon-512.png',512,ANY),
      ('maskable-512.png',512,MASK),('apple-touch-180.png',180,FULL),('favicon-32.png',32,SMALL)]
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page()
    for name,size,s in jobs:
        pg.set_viewport_size({'width':size,'height':size})
        pg.set_content('<html><body style="margin:0;background:transparent">'+s.replace('<svg ','<svg width="%d" height="%d" '%(size,size),1)+'</body></html>')
        pg.screenshot(path=os.path.join(D,name),omit_background=True)
    b.close()
from PIL import Image  # 256-colour PNGs (a tenth of the size; the precache stays small)
for name,_,_ in jobs:
    f=os.path.join(D,name);Image.open(f).convert('RGBA').quantize(colors=256,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.FLOYDSTEINBERG).save(f,optimize=True)
print('icons written')
