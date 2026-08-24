"""Local planar projection + geometry helpers.

Over a ~25 km study area an equirectangular projection about the centre
latitude is accurate to well under a metre, which is far below the precision
of the underlying crime geocoding. Avoids a pyproj dependency.
"""
import math
import numpy as np

import config as C

LAT0 = (C.BBOX["south"] + C.BBOX["north"]) / 2.0
LON0 = (C.BBOX["west"] + C.BBOX["east"]) / 2.0
R = 6371000.0
_MX = R * math.cos(math.radians(LAT0)) * math.pi / 180.0  # metres per degree lon
_MY = R * math.pi / 180.0                                  # metres per degree lat


def to_xy(lat, lon):
    """lat/lon (scalars or arrays) -> local metres."""
    return (np.asarray(lon) - LON0) * _MX, (np.asarray(lat) - LAT0) * _MY


def seg_lengths(xs, ys):
    return np.hypot(np.diff(xs), np.diff(ys))


def densify(xs, ys, step=25.0):
    """Sample points every ~`step` metres along a polyline (metres in, out)."""
    d = seg_lengths(xs, ys)
    total = d.sum()
    if total <= step:
        return np.array([xs.mean()]), np.array([ys.mean()]), total
    n = max(2, int(math.ceil(total / step)) + 1)
    cum = np.concatenate([[0.0], np.cumsum(d)])
    t = np.linspace(0.0, total, n)
    return np.interp(t, cum, xs), np.interp(t, cum, ys), total
