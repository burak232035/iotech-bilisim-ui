"""
Maps raw model class names to the 6 report categories used across the
Node backend and frontend: kağıt, cam, metal, plastik, geri
dönüştürülemez, organik.

The dataset backing this model lives in the user's Google Drive (labeled
there, trained via train_waste_detection_colab.ipynb) and may use raw
class names inherited from the earlier Roboflow project ("trashdronedata2",
14 raw classes) or new ones added alongside the "organik" class. This map
is intentionally permissive — it keeps every raw name the previous 5-class
model understood, plus organic/recyclability variants, and anything
unrecognized falls back to "geri dönüştürülemez" (the closest catch-all,
since the system no longer has a 7th generic "diğer" bucket).
"""

RAW_TO_CATEGORY = {
    "glass": "cam",
    "Glass": "cam",
    "metal": "metal",
    "Metal": "metal",
    "cardboard": "kağıt",
    "cardbord": "kağıt",   # dataset typo, kept for safety
    "paper": "kağıt",
    "plastic": "plastik",
    "organic": "organik",
    "organik": "organik",
    "food": "organik",
    "food waste": "organik",
    "biodegradable": "organik",
    "trash": "geri dönüştürülemez",
    "trash bin": "geri dönüştürülemez",
    "other": "geri dönüştürülemez",
    "other_trash": "geri dönüştürülemez",
    "not recyclable": "geri dönüştürülemez",
    "non recyclable": "geri dönüştürülemez",
    "non_recyclable": "geri dönüştürülemez",
    "wood": "geri dönüştürülemez",
}

CATEGORIES = ["kağıt", "cam", "plastik", "metal", "geri dönüştürülemez", "organik"]


def to_category(raw_class_name: str) -> str:
    """Map a raw model class name to one of the 6 report categories."""
    return RAW_TO_CATEGORY.get(raw_class_name, "geri dönüştürülemez")
