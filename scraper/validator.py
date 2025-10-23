#!/usr/bin/env python3
# /// script
# requires-python = ">=3.14"
# dependencies = [
#   "jsonschema==4.23.0",
# ]
# ///
"""
Data Validation Module

Validates scraped PostgreSQL feature data to prevent bad data from being committed.
"""

from jsonschema import validate, ValidationError

# JSON Schema for feature_matrix.json
FEATURE_SCHEMA = {
    "type": "object",
    "required": ["last_updated", "versions", "features"],
    "properties": {
        "last_updated": {
            "type": "string",
            "pattern": r"^\d{4}-\d{2}-\d{2}$"
        },
        "versions": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 1
        },
        "features": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "name", "category", "introduced_in", "present_in"],
                "properties": {
                    "id": {"type": "string"},
                    "name": {"type": "string"},
                    "category": {"type": "string"},
                    "introduced_in": {"type": ["string", "null"]},
                    "deprecated_in": {"type": ["string", "null"]},
                    "present_in": {
                        "type": "array",
                        "items": {"type": "string"}
                    },
                    "docs_url": {"type": ["string", "null"]}
                }
            }
        }
    }
}


def validate_schema(data: dict) -> tuple[bool, list[str]]:
    """Validate data against JSON schema."""
    errors = []

    try:
        validate(instance=data, schema=FEATURE_SCHEMA)
    except ValidationError as e:
        errors.append(f"Schema validation error: {e.message}")
        return False, errors

    return True, errors


def validate_non_empty(data: dict) -> tuple[bool, list[str]]:
    """Validate that critical fields are non-empty."""
    errors = []

    if not data.get("versions"):
        errors.append("Versions array is empty")

    if not data.get("features"):
        errors.append("Features array is empty")

    # Check that all features have categories
    for idx, feature in enumerate(data.get("features", [])):
        if not feature.get("category"):
            errors.append(f"Feature at index {idx} has empty category")

        if not feature.get("name"):
            errors.append(f"Feature at index {idx} has empty name")

    return len(errors) == 0, errors


def validate_feature_count(new_data: dict, old_data: dict, tolerance: float = 0.10) -> tuple[bool, list[str]]:
    """
    Validate that feature count is within expected tolerance.

    Args:
        new_data: Newly scraped data
        old_data: Previous data
        tolerance: Allowed percentage difference (default 10%)
    """
    errors = []

    old_count = len(old_data.get("features", []))
    new_count = len(new_data.get("features", []))

    if old_count == 0:
        # No previous data to compare against
        return True, errors

    min_allowed = old_count * (1 - tolerance)
    max_allowed = old_count * (1 + tolerance)

    if new_count < min_allowed or new_count > max_allowed:
        errors.append(
            f"Feature count changed dramatically: {old_count} -> {new_count} "
            f"(allowed range: {int(min_allowed)}-{int(max_allowed)})"
        )
        return False, errors

    return True, errors


def validate_feature_continuity(new_data: dict, old_data: dict, min_overlap: float = 0.90) -> tuple[bool, list[str]]:
    """
    Validate that most previous features are still present.

    Args:
        new_data: Newly scraped data
        old_data: Previous data
        min_overlap: Minimum percentage of old feature names that should still exist (default 90%)
    """
    errors = []

    old_feature_names = set(f["name"] for f in old_data.get("features", []))
    new_feature_names = set(f["name"] for f in new_data.get("features", []))

    if not old_feature_names:
        # No previous data to compare against
        return True, errors

    overlap = old_feature_names & new_feature_names
    overlap_ratio = len(overlap) / len(old_feature_names)

    if overlap_ratio < min_overlap:
        missing_count = len(old_feature_names) - len(overlap)
        errors.append(
            f"Too many features disappeared: {missing_count} out of {len(old_feature_names)} "
            f"({overlap_ratio:.1%} overlap, minimum required: {min_overlap:.0%})"
        )

        # List some missing features for debugging
        missing = old_feature_names - new_feature_names
        sample_missing = list(missing)[:5]
        errors.append(f"Sample missing features: {', '.join(sample_missing)}")

        return False, errors

    return True, errors


def validate_version_consistency(new_data: dict, old_data: dict) -> tuple[bool, list[str]]:
    """
    Validate that version list is sensible compared to previous data.
    """
    errors = []

    old_versions = set(old_data.get("versions", []))
    new_versions = set(new_data.get("versions", []))

    if not old_versions:
        # No previous data to compare against
        return True, errors

    # Check that we didn't lose major versions
    # (It's ok to add new ones, but old ones shouldn't disappear)
    missing_versions = old_versions - new_versions

    # Allow removal of very old versions (e.g., < 10)
    significant_missing = [v for v in missing_versions if int(v) >= 10]

    if significant_missing:
        errors.append(
            f"Version(s) disappeared from matrix: {', '.join(sorted(significant_missing))}"
        )
        return False, errors

    return True, errors


def validate_feature_data(new_data: dict, old_data: dict | None = None) -> tuple[bool, list[str]]:
    """
    Main validation function that runs all validation checks.

    Args:
        new_data: Newly scraped data
        old_data: Previous data (if available)

    Returns:
        Tuple of (is_valid, list_of_errors)
    """
    all_errors = []

    # 1. Validate schema
    is_valid, errors = validate_schema(new_data)
    all_errors.extend(errors)
    if not is_valid:
        return False, all_errors

    # 2. Validate non-empty fields
    is_valid, errors = validate_non_empty(new_data)
    all_errors.extend(errors)
    if not is_valid:
        return False, all_errors

    # 3. If old data exists, run comparison validations
    if old_data:
        # Feature count validation
        is_valid, errors = validate_feature_count(new_data, old_data)
        all_errors.extend(errors)

        # Feature continuity validation
        is_valid, errors = validate_feature_continuity(new_data, old_data)
        all_errors.extend(errors)

        # Version consistency validation
        is_valid, errors = validate_version_consistency(new_data, old_data)
        all_errors.extend(errors)

    # Return overall result
    return len(all_errors) == 0, all_errors


if __name__ == "__main__":
    # Test validation with sample data
    sample_data = {
        "last_updated": "2025-10-16",
        "versions": ["12", "13", "14", "15", "16", "17"],
        "features": [
            {
                "id": "test_feature",
                "name": "Test Feature",
                "category": "Testing",
                "introduced_in": "15",
                "deprecated_in": None,
                "present_in": ["15", "16", "17"],
                "docs_url": "https://www.postgresql.org/docs/15/"
            }
        ]
    }

    is_valid, errors = validate_feature_data(sample_data)
    print(f"Validation result: {is_valid}")
    if errors:
        for error in errors:
            print(f"  - {error}")
