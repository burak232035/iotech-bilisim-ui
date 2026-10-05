"""
Maps raw YOLO-seg class names to the two land-cover categories this
service reports: "yesil" (green / vegetation) and "beton" (concrete /
paved, impervious surface). Anything unrecognized is dropped from the
percentage calculation entirely (it's neither green nor concrete —
e.g. shadow, water, building roof — and counted only in the implicit
"other" remainder on the Node side).

The dataset backing this model lives in the user's Google Drive and may
use whatever raw class names were used when labeling (e.g. "grass",
"tree", "vegetation" for green; "concrete", "pavement", "road", "asphalt"
for hard surface). Extend these maps to match your actual label names if
they differ.
"""

RAW_TO_LANDCOVER = {
    "green": "yesil",
    "vegetation": "yesil",
    "grass": "yesil",
    "tree": "yesil",
    "trees": "yesil",
    "yesil": "yesil",
    "yeşil": "yesil",
    "concrete": "beton",
    "pavement": "beton",
    "asphalt": "beton",
    "road": "beton",
    "beton": "beton",
}

LANDCOVER_CLASSES = ["yesil", "beton"]


def to_landcover(raw_class_name: str) -> str | None:
    """Map a raw model class name to 'yesil'/'beton', or None if unrecognized."""
    return RAW_TO_LANDCOVER.get(raw_class_name)
