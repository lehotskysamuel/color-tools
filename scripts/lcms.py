"""CMYK -> CIELAB in double precision, through LittleCMS.

Pillow's ImageCms only converts 8-bit pixels, which rounds Lab to about 0.4 L*
and 1 a*/b*, and runs 8-bit transforms through a precomputed table that is
least accurate next to the sRGB boundary. This calls LittleCMS directly with
floating-point input and output instead. It uses the system library when
there is one (apt install liblcms2-2, brew install little-cms2), otherwise
the copy bundled with Pillow.
"""
import ctypes
import ctypes.util
import glob
import os

import PIL

# LittleCMS pixel formats: FLOAT_SH(1) | COLORSPACE_SH(pt) | CHANNELS_SH(n) | BYTES_SH(0).
_FLOAT = 1 << 22
TYPE_CMYK_DBL = _FLOAT | (6 << 16) | (4 << 3)  # PT_CMYK, ink percentages 0..100
TYPE_LAB_DBL = _FLOAT | (10 << 16) | (3 << 3)  # PT_Lab
INTENT_RELATIVE_COLORIMETRIC = 1


def _library():
    path = ctypes.util.find_library("lcms2")
    if not path:
        pil = os.path.dirname(PIL.__file__)
        for pattern in ("../pillow.libs/liblcms2*", ".dylibs/liblcms2*", "../pillow.libs/lcms2*"):
            found = glob.glob(os.path.join(pil, pattern))
            if found:
                path = found[0]
                break
    if not path:
        raise OSError("LittleCMS not found: install it (liblcms2-2 / little-cms2) or Pillow with its bundled copy")
    lib = ctypes.CDLL(path)
    lib.cmsOpenProfileFromMem.restype = ctypes.c_void_p
    lib.cmsOpenProfileFromMem.argtypes = [ctypes.c_char_p, ctypes.c_uint32]
    lib.cmsCreateLab4Profile.restype = ctypes.c_void_p
    lib.cmsCreateLab4Profile.argtypes = [ctypes.c_void_p]
    lib.cmsCreateTransform.restype = ctypes.c_void_p
    lib.cmsCreateTransform.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_uint32,
                                       ctypes.c_uint32, ctypes.c_uint32]
    lib.cmsDoTransform.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint32]
    return lib


class CmykToLab:
    """Converts print CMYK through an ICC profile to CIELAB relative to D50.

    Relative colorimetric intent, so the paper is white (L* 100). No black
    point compensation: the darkest print stays at its own L* instead of being
    stretched to 0, as it would be for display.
    """

    def __init__(self, icc_bytes):
        self._lib = _library()
        cmyk = self._lib.cmsOpenProfileFromMem(icc_bytes, len(icc_bytes))
        lab = self._lib.cmsCreateLab4Profile(None)  # None: D50
        if not cmyk or not lab:
            raise ValueError("could not open the ICC profile")
        self._transform = self._lib.cmsCreateTransform(
            cmyk, TYPE_CMYK_DBL, lab, TYPE_LAB_DBL, INTENT_RELATIVE_COLORIMETRIC, 0)
        if not self._transform:
            raise ValueError("could not build the CMYK -> Lab transform")

    def __call__(self, cmyk_percent):
        """[c, m, y, k] in percent -> (L*, a*, b*)."""
        src = (ctypes.c_double * 4)(*cmyk_percent)
        dst = (ctypes.c_double * 3)()
        self._lib.cmsDoTransform(self._transform, src, dst, 1)
        return tuple(dst)
