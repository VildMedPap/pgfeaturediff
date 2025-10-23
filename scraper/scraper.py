#!/usr/bin/env python3
# /// script
# requires-python = ">=3.14"
# dependencies = [
#   "requests==2.32.3",
#   "beautifulsoup4==4.12.3",
#   "lxml==5.3.0",
#   "jsonschema==4.23.0",
# ]
# ///
"""
PostgreSQL Feature Matrix Scraper

Scrapes the official PostgreSQL Feature Matrix and converts it to a structured JSON format.
"""

import requests
from bs4 import BeautifulSoup
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from validator import validate_feature_data

# Configuration
FEATURE_MATRIX_URL = "https://www.postgresql.org/about/featurematrix/"
OUTPUT_PATH = Path("frontend/public/feature_matrix.json")


def slugify(text: str) -> str:
    """Convert text to a URL-friendly slug."""
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '_', text)
    return text.strip('_')


def fetch_feature_matrix() -> BeautifulSoup:
    """Fetch and parse the PostgreSQL Feature Matrix HTML."""
    print(f"Fetching Feature Matrix from {FEATURE_MATRIX_URL}...")

    headers = {
        'User-Agent': 'pgfeaturediff-scraper/1.0 (https://github.com/sebastiansteenssoe/pgfeaturediff)'
    }

    try:
        response = requests.get(FEATURE_MATRIX_URL, headers=headers, timeout=30)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"Error fetching Feature Matrix: {e}", file=sys.stderr)
        sys.exit(1)

    return BeautifulSoup(response.content, 'lxml')


def extract_versions(soup: BeautifulSoup) -> list[str]:
    """Extract PostgreSQL version numbers from the first table header."""
    # Find the first table with class 'matrix'
    table = soup.find('table', class_='matrix')
    if not table:
        print("Error: Could not find table with class 'matrix'", file=sys.stderr)
        return []

    # Get the header row
    thead = table.find('thead')
    if not thead:
        print("Error: Could not find thead in table", file=sys.stderr)
        return []

    header_row = thead.find('tr')
    if not header_row:
        print("Error: Could not find header row", file=sys.stderr)
        return []

    # Extract version numbers from th elements (skip first empty th)
    versions = []
    for th in header_row.find_all('th')[1:]:  # Skip first column (feature names)
        version_text = th.get_text(strip=True)
        if version_text and re.match(r'^\d+(\.\d+)?$', version_text):
            versions.append(version_text)

    # Versions are in reverse order (18, 17, 16...), so reverse them
    return list(reversed(versions))


def scrape() -> dict:
    """Main scraping function."""
    print("Starting PostgreSQL Feature Matrix scrape...")

    soup = fetch_feature_matrix()

    print("Extracting versions...")
    versions = extract_versions(soup)

    if not versions:
        print("Error: Could not extract any versions", file=sys.stderr)
        sys.exit(1)

    print(f"Found versions: {', '.join(versions)}")

    print("Extracting features...")
    features = []

    # Find all H2 section headers
    # Each H2 is followed by a table with features in that category
    for h2 in soup.find_all('h2'):
        category_name = h2.get_text(strip=True)

        # Skip non-feature categories
        if category_name in ['Quick Links', 'PostgreSQL Feature Matrix']:
            continue

        # Find the table that follows this h2
        table = h2.find_next('table', class_='matrix')
        if not table:
            continue

        # Find tbody
        tbody = table.find('tbody')
        if not tbody:
            continue

        # Process each row in tbody
        for row in tbody.find_all('tr'):
            # First cell is th with feature name
            feature_th = row.find('th', scope='row')
            if not feature_th:
                continue

            feature_name = feature_th.get_text(strip=True)
            if not feature_name:
                continue

            # Extract documentation URL if available
            docs_url = None
            link = feature_th.find('a')
            if link and link.get('href'):
                href = link['href']
                if href.startswith('http'):
                    docs_url = href
                elif href.startswith('/'):
                    docs_url = f"https://www.postgresql.org{href}"
                else:
                    # Relative URL to detail page
                    docs_url = f"https://www.postgresql.org/about/featurematrix/{href}"

            # Get all td cells for version support
            td_cells = row.find_all('td')

            # Should have same number of cells as versions (reversed on page)
            if len(td_cells) != len(versions):
                print(f"Warning: Feature '{feature_name}' has {len(td_cells)} cells but {len(versions)} versions", file=sys.stderr)
                continue

            # Check which versions have this feature
            # Cells are in reverse order (newest first)
            present_in = []
            reversed_versions = list(reversed(versions))

            for idx, cell in enumerate(td_cells):
                cell_classes = cell.get('class', [])
                if 'fm_yes' in cell_classes:
                    present_in.append(reversed_versions[idx])

            # Reverse to get chronological order
            present_in = list(reversed(present_in))

            if not present_in:
                # Feature exists but isn't in any version (unlikely but skip it)
                continue

            # Determine when feature was introduced
            introduced_in = present_in[0]

            # Determine if deprecated
            deprecated_in = None
            if present_in[-1] != versions[-1]:
                # Feature is not in the latest version, so it was deprecated
                # Find the version after the last one it was present in
                last_present_idx = versions.index(present_in[-1])
                if last_present_idx < len(versions) - 1:
                    deprecated_in = versions[last_present_idx + 1]

            feature = {
                "id": slugify(feature_name),
                "name": feature_name,
                "category": category_name,
                "introduced_in": introduced_in,
                "deprecated_in": deprecated_in,
                "present_in": present_in,
                "docs_url": docs_url
            }

            features.append(feature)

    print(f"Extracted {len(features)} features")

    data = {
        "last_updated": datetime.now().strftime("%Y-%m-%d"),
        "versions": versions,
        "features": features
    }

    return data


def save_data(data: dict, output_path: Path):
    """Save scraped data to JSON file."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Data saved to {output_path}")


def main():
    """Main entry point."""
    # Allow custom output path via environment variable
    import os
    output_path = Path(os.getenv('OUTPUT_PATH', OUTPUT_PATH))

    # Scrape the data
    data = scrape()

    # Validate the data
    print("\nValidating scraped data...")
    existing_data = None

    if output_path.exists():
        try:
            with open(output_path, 'r', encoding='utf-8') as f:
                existing_data = json.load(f)
        except Exception as e:
            print(f"Warning: Could not load existing data: {e}", file=sys.stderr)

    is_valid, errors = validate_feature_data(data, existing_data)

    if not is_valid:
        print("Validation failed:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)

        # For first run or when there's no existing data, allow it through
        if not existing_data:
            print("\nNo existing data found, saving initial dataset...", file=sys.stderr)
        else:
            sys.exit(1)

    print("Validation passed!")

    # Save the data
    save_data(data, output_path)

    print("\n✓ Scraping completed successfully!")
    print(f"  - Versions: {len(data['versions'])}")
    print(f"  - Features: {len(data['features'])}")
    print(f"  - Categories: {len(set(f['category'] for f in data['features']))}")


if __name__ == "__main__":
    main()
