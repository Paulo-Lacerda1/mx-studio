"""Part rules for the MX Master 3S CAD (mouse8.stp). Units: CAD mm, Y up, front = -Z, left = -X."""
import numpy as np
WHEEL_X = 11.0
LED = set(range(247, 261)) | {84, 85, 86, 87}
LOGO = {4, 35, 36, 322, 323, 324, 325, 326, 327}
ACCENT = {328, 329}
SOLIDS = {1: 'thumbwheel', 2: 'forward', 3: 'back', 4: 'middle', 5: 'shift'}

def classify(solid, face, c):
    if solid in SOLIDS: return SOLIDS[solid]
    x, y, z = c
    if face in LED: return 'led'
    if face in LOGO: return 'logo'
    if face in ACCENT: return 'accent'
    if face == 34: return 'left' if x < WHEEL_X else 'right'
    if y < 2.2: return 'base'
    return 'body'

def transform(lo, hi):
    """Scale to the published 124.9 mm length; centre X/Z, floor at Y = 0."""
    k = 124.9 / (hi[2] - lo[2])
    centre = np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])
    return lambda p: (p - centre) * k
